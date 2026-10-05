// Physical storage seam for the drive. Everything that touches user-uploaded
// bytes goes through here so migrating to S3/OSS later is a one-file change.
//
// Two layouts co-exist for backward compatibility with v0.3.2:
//   • Legacy docx:  data/uploads/<id>.docx                    (flat)
//   • v0.4 blob:    data/uploads/<id>/<rev>/<safeName>        (per-file dir, rev = ms ts)
//
// Non-docx uploads always use the v0.4 layout; docx still writes to the
// legacy path so the existing editor roundtrip and download links keep
// working. `resolveReadPath` picks the right one per FileRecord.

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  UPLOADS_DIR,
  fileBlobDir,
  fileBlobPath,
  sanitizeFilename,
  uploadPath
} from './paths'
import type { FileRecord } from './types'
import { moveToTrash } from './fsafe'

function makeCountingStream(onChunk: (n: number) => void): Transform {
  return new Transform({
    transform(chunk, _enc, cb) {
      onChunk(chunk.length)
      cb(null, chunk)
    }
  })
}

async function streamTo(src: NodeJS.ReadableStream | Buffer, dest: string): Promise<number> {
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  let size = 0
  if (Buffer.isBuffer(src)) {
    size = src.length
    await fsp.writeFile(dest, src)
  } else {
    const out = fs.createWriteStream(dest, { flags: 'w' })
    const counter = makeCountingStream(n => { size += n })
    await pipeline(src as NodeJS.ReadableStream, counter, out)
  }
  return size
}

export interface WriteBlobResult {
  rev: number
  absolutePath: string
  /** Path relative to UPLOADS_DIR, stored on FileRecord.originalPath. */
  relativePath: string
  size: number
}

/**
 * Stream an incoming UploadFile / Readable to disk under the v0.4 layout.
 * Uses a `.tmp` sibling then rename to keep the visible path atomic — readers
 * never observe partial bytes.
 */
export async function writeBlob(
  fileId: string,
  src: NodeJS.ReadableStream | Buffer,
  opts: { originalName: string }
): Promise<WriteBlobResult> {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true })
  const rev = Date.now()
  const safe = sanitizeFilename(opts.originalName)
  const dest = fileBlobPath(fileId, rev, safe)
  const tmp = dest + '.tmp'
  const size = await streamTo(src, tmp)
  await fsp.rename(tmp, dest)
  const rel = path.relative(UPLOADS_DIR, dest)
  return { rev, absolutePath: dest, relativePath: rel, size }
}

/**
 * Legacy docx write. Kept separate because the editor roundtrip and existing
 * tests hardcode `data/uploads/<id>.docx`. v0.5 might collapse both layouts.
 */
export async function writeDocxLegacy(
  fileId: string,
  src: NodeJS.ReadableStream | Buffer
): Promise<{ absolutePath: string; relativePath: string; size: number }> {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true })
  const dest = uploadPath(fileId)
  const tmp = dest + '.tmp'
  const size = await streamTo(src, tmp)
  await fsp.rename(tmp, dest)
  return { absolutePath: dest, relativePath: path.basename(dest), size }
}

/** Absolute path for reading; honours both layouts. */
export function resolveReadPath(
  rec: Pick<FileRecord, 'id' | 'extension' | 'originalPath'>
): string | null {
  if (!rec.originalPath) return null
  // Legacy docx rows store just a basename ("<id>.docx"); v0.4 rows
  // store a relative path ("<id>/<rev>/<name>"). Both resolve against UPLOADS_DIR.
  const abs = path.isAbsolute(rec.originalPath)
    ? rec.originalPath
    : path.join(UPLOADS_DIR, rec.originalPath)
  return abs
}

export interface RangeSpec {
  start: number
  end: number // inclusive
  total: number
  unsatisfiable: boolean
}

/**
 * Parse an HTTP Range header into a single inclusive range. Returns null for
 * a missing / wildcard / unsupported-multipart header (callers should then
 * send 200 with the whole body). Only `bytes=a-b`, `bytes=a-`, `bytes=-N`
 * forms are supported — the Preview SDK uses simple ranges.
 */
export function parseRange(header: string | null, total: number): RangeSpec | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!m) return null
  const rawStart = m[1]
  const rawEnd = m[2]
  if (!rawStart && !rawEnd) return null
  let start: number
  let end: number
  if (!rawStart) {
    const n = parseInt(rawEnd!, 10)
    if (!Number.isFinite(n) || n <= 0) return null
    start = Math.max(0, total - n)
    end = total - 1
  } else {
    start = parseInt(rawStart, 10)
    end = rawEnd ? parseInt(rawEnd, 10) : total - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start >= total || end < start) {
    return { start: 0, end: 0, total, unsatisfiable: true }
  }
  end = Math.min(end, total - 1)
  return { start, end, total, unsatisfiable: false }
}

export interface StreamedResponse {
  stream: fs.ReadStream
  statusCode: 200 | 206 | 416
  headers: Record<string, string>
}

/**
 * Stream a (possibly ranged) slice of a FileRecord's blob. Missing files
 * throw ENOENT which the route turns into 404.
 */
export async function openStream(
  rec: Pick<FileRecord, 'id' | 'extension' | 'originalPath'>,
  range: string | null
): Promise<StreamedResponse> {
  const abs = resolveReadPath(rec)
  if (!abs) throw new Error('file has no stored bytes')
  const st = await fsp.stat(abs)
  const total = st.size
  const r = parseRange(range, total)
  if (!r) {
    return {
      stream: fs.createReadStream(abs),
      statusCode: 200,
      headers: { 'Content-Length': String(total), 'Accept-Ranges': 'bytes' }
    }
  }
  if (r.unsatisfiable) {
    return {
      stream: fs.createReadStream(abs, { start: 0, end: -1 }), // empty stream
      statusCode: 416,
      headers: { 'Content-Range': `bytes */${total}`, 'Accept-Ranges': 'bytes' }
    }
  }
  return {
    stream: fs.createReadStream(abs, { start: r.start, end: r.end }),
    statusCode: 206,
    headers: {
      'Content-Length': String(r.end - r.start + 1),
      'Content-Range': `bytes ${r.start}-${r.end}/${total}`,
      'Accept-Ranges': 'bytes'
    }
  }
}

/**
 * Move a file's on-disk bytes to system Trash. Both layouts supported:
 *   • Legacy docx: `<id>.docx` file
 *   • v0.4 blob: `<id>/` directory
 * Returns the number of items moved.
 */
export async function removeBlobs(fileId: string): Promise<number> {
  const legacy = uploadPath(fileId)
  const blobDir = fileBlobDir(fileId)
  let moved = 0
  if (fs.existsSync(legacy)) {
    const dst = await moveToTrash(legacy)
    if (dst) moved++
  }
  if (fs.existsSync(blobDir)) {
    const dst = await moveToTrash(blobDir)
    if (dst) moved++
  }
  return moved
}

/** Best-effort existence check used by the download / raw route. */
export async function existsFor(
  rec: Pick<FileRecord, 'id' | 'extension' | 'originalPath'>
): Promise<boolean> {
  const abs = resolveReadPath(rec)
  if (!abs) return false
  try {
    await fsp.stat(abs)
    return true
  } catch {
    return false
  }
}
