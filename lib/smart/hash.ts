// v0.7 · P0 · SHA-256 helper for duplicate detection.
//
// Two entry points:
//   • `inlineSha256(buf)` — used inside POST /api/files where we already hold
//     the upload in memory (see `Buffer.from(await file.arrayBuffer())`). Zero
//     extra IO, <10 ms on the 25 MB cap, so we run it synchronously.
//   • `sha256OfFile(absPath)` — backfill path used by /api/smart/scan when a
//     row predates v0.7 and its contentHash is null. Streams to avoid loading
//     200 MB video into the Node heap.
//
// Output is the *lower-case hex* digest (64 chars), matching what Prisma
// stores on File.contentHash. We do NOT prefix with `sha256:` — the column
// name is already the algorithm tag, and untagged hex is what `dupes` GROUP BY
// comparisons expect (a stray prefix would fragment every group).
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'

/** 64-char lower-case hex. */
export function inlineSha256(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Streaming hash for on-disk backfill. Throws if the path is missing — the
 *  caller (`/api/smart/scan`) wraps in try/catch and moves on. */
export async function sha256OfFile(absPath: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(fs.createReadStream(absPath), hash)
  return hash.digest('hex')
}

/** Cheap format check used by routes before writing contentHash to the DB.
 *  Rejects empty strings, uppercase, and accidental "sha256:" prefixes so a
 *  bad backfill script can't poison duplicate detection. */
export function isSha256Hex(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
}
