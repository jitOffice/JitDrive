import { NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import fs from 'node:fs/promises'
import { getFile } from '@/lib/store'
import { openStream, resolveReadPath, existsFor } from '@/lib/storage'
import { guessMime } from '@/lib/filetypes'
import {
  authorizePublic,
  folderSubtreeHasFile,
  type ShareLinkView,
  type PublicFileRow,
  type PublicFolderRow
} from '@/lib/share'
import { getSessionUserId } from '@/lib/auth'
import type { FileRecord } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/share/[code]/raw — public streaming reader.
//
// Same Range/206/Content-Disposition behaviour as /api/files/[id]/raw but with
// three public-specific twists:
//   ① Gate runs `authorizePublic`: revoked / expired / view-limit / file-gone /
//      folder-gone all return 410 (never 403, to avoid confirming code
//      existence).
//   ② Password gate must be satisfied (jw_share cookie) — otherwise 401.
//   ③ `?download=1` (attachment) is only honoured when the owner left
//      `allowDownload` on; the response still streams inline so the viewer
//      can preview without saving.
//
// v0.5.2 · Folder-scoped links. When the link points at a folder, the caller
// MUST pass `?fileId=<id>` naming a descendant file. We verify the file lives
// inside the shared folder's recursive subtree (`folderSubtreeHasFile`) before
// streaming — otherwise 404 (never 403) so outsiders can't probe which fileIds
// exist in someone else's drive. File-scoped links ignore ?fileId entirely and
// stream `link.fileId` verbatim, keeping byte-level compatibility with v0.5.
//
// HEAD is supported because JitWord-Preview SDK probes it for some types.

function noStore(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'private, max-age=0, must-revalidate',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra
  }
}

type GateOk = { ok: true; rec: FileRecord; link: ShareLinkView }
type Gate = { ok: false; res: NextResponse } | GateOk

/** Shared by GET / HEAD. `url` carries the `?fileId=` query for folder links. */
async function gate(code: string, url: URL): Promise<Gate> {
  const g = await authorizePublic(code, getSessionUserId())
  if (!g.ok) {
    return {
      ok: false,
      res: NextResponse.json(
        { code: g.status, reason: g.reason, message: g.message },
        { status: g.status, headers: noStore() }
      )
    }
  }
  if (!g.unlocked) {
    return {
      ok: false,
      res: NextResponse.json(
        { code: 401, reason: 'need-password', message: '请输入访问密码' },
        { status: 401, headers: noStore() }
      )
    }
  }
  // Resolve which physical file we're about to stream.
  const targetFileId = await resolveTargetFileId(g, url)
  if (!targetFileId.ok) {
    return { ok: false, res: targetFileId.res }
  }
  const rec = await getFile(targetFileId.fileId)
  if (!rec || rec.deleted) {
    return {
      ok: false,
      res: NextResponse.json(
        { code: 410, reason: 'file-gone', message: '文件已不可用' },
        { status: 410, headers: noStore() }
      )
    }
  }
  return { ok: true, rec, link: g.link }
}

/** Turn a gate (file-arm or folder-arm) plus a request URL into the concrete
 *  fileId we're allowed to stream. Folder links REQUIRE ?fileId= and the
 *  target must be inside the shared subtree; file links ignore ?fileId. */
async function resolveTargetFileId(
  g: { kind: 'file'; file: PublicFileRow } | { kind: 'folder'; folder: PublicFolderRow },
  url: URL
): Promise<{ ok: true; fileId: string } | { ok: false; res: NextResponse }> {
  if (g.kind === 'file') {
    return { ok: true, fileId: g.file.id }
  }
  const q = url.searchParams.get('fileId')
  if (!q) {
    return {
      ok: false,
      res: NextResponse.json(
        { code: 400, reason: 'file-id-required', message: '目录分享需要在 ?fileId= 指定要打开的文件' },
        { status: 400, headers: noStore() }
      )
    }
  }
  const inside = await folderSubtreeHasFile(g.folder.id, q)
  if (!inside) {
    // 404 (not 403) — don't leak whether the fileId exists at all in the drive.
    return {
      ok: false,
      res: NextResponse.json(
        { code: 404, reason: 'file-outside-share', message: '该文件不在此目录分享范围内' },
        { status: 404, headers: noStore() }
      )
    }
  }
  return { ok: true, fileId: q }
}

export async function GET(req: Request, ctx: { params: { code: string } }) {
  const url = new URL(req.url)
  const g = await gate(ctx.params.code, url)
  if (!g.ok) return g.res
  const { rec, link } = g
  if (!rec.originalPath || !(await existsFor(rec))) {
    return NextResponse.json(
      { code: 404, message: 'raw bytes missing' },
      { status: 404, headers: noStore() }
    )
  }
  const wantDownload = url.searchParams.get('download') === '1' && link.allowDownload
  const range = req.headers.get('range')
  try {
    const { stream, statusCode, headers } = await openStream(rec, range)
    const mime = rec.mime || guessMime(rec.extension)
    const allHeaders: Record<string, string> = {
      'Content-Type': mime,
      'X-File-Kind': rec.kind,
      'X-File-Extension': rec.extension,
      'X-Share-Allow-Download': link.allowDownload ? '1' : '0',
      ...noStore(headers)
    }
    const encoded = encodeURIComponent(rec.name)
    allHeaders['Content-Disposition'] =
      `${wantDownload ? 'attachment' : 'inline'}; filename="${encoded}"; filename*=UTF-8''${encoded}`
    const body = statusCode === 416 ? null : Readable.toWeb(stream as unknown as Readable)
    return new NextResponse(body as ReadableStream<Uint8Array> | null, {
      status: statusCode,
      headers: allHeaders
    })
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: `读取失败：${(e as Error).message}` },
      { status: 500, headers: noStore() }
    )
  }
}

export async function HEAD(_req: Request, ctx: { params: { code: string } }) {
  const url = new URL(_req.url)
  const g = await gate(ctx.params.code, url)
  if (!g.ok) return g.res
  const { rec, link } = g
  const abs = resolveReadPath(rec)
  if (!abs) return new NextResponse(null, { status: 404, headers: noStore() })
  try {
    const st = await fs.stat(abs)
    const mime = rec.mime || guessMime(rec.extension)
    return new NextResponse(null, {
      status: 200,
      headers: noStore({
        'Content-Type': mime,
        'Content-Length': String(st.size),
        'Accept-Ranges': 'bytes',
        'X-File-Kind': rec.kind,
        'X-File-Extension': rec.extension,
        'X-Share-Allow-Download': link.allowDownload ? '1' : '0'
      })
    })
  } catch {
    return new NextResponse(null, { status: 404, headers: noStore() })
  }
}
