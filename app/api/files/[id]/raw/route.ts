import { NextResponse } from 'next/server'
import { Readable } from 'node:stream'
import { getFile, canReadFile } from '@/lib/store'
import { openStream, existsFor, resolveReadPath } from '@/lib/storage'
import { guessMime } from '@/lib/filetypes'
import { getActorId } from '@/lib/users'
import fs from 'node:fs/promises'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/files/[id]/raw
 *  Streams the raw bytes of any stored file (docx or v0.4 blob) with HTTP Range
 *  support so the JitWord-Preview SDK (and native <video>/<audio>) can seek.
 *
 *  Auth: same-origin cookie session (SameSite=Lax rides along on top-level and
 *  XHR navigations). Owner or shared viewer can read; trashed rows return 410.
 *  Content-Type comes from FileRecord.mime (fallback: guessMime on extension).
 *  Content-Disposition is inline unless `?download=1` (then attachment).
 *
 *  Errors: 401 no session · 404 not accessible / not found · 410 trashed ·
 *  413 too large (guard) · 416 unsatisfiable range · 500 io. */
async function authorize(id: string): Promise<
  | { ok: true; rec: NonNullable<Awaited<ReturnType<typeof getFile>>> }
  | { ok: false; res: NextResponse }
> {
  const actor = getActorId()
  if (!actor) {
    return { ok: false, res: NextResponse.json({ code: 401, message: '未登录' }, { status: 401 }) }
  }
  const rec = await getFile(id)
  if (!rec) {
    return { ok: false, res: NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 }) }
  }
  if (rec.deleted) {
    return { ok: false, res: NextResponse.json({ code: 410, message: '文档在回收站中' }, { status: 410 }) }
  }
  const readable = await canReadFile(id, actor)
  if (!readable) {
    // Do not leak existence — same 404 as missing.
    return { ok: false, res: NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 }) }
  }
  return { ok: true, rec }
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const auth = await authorize(ctx.params.id)
  if (!auth.ok) return auth.res
  const rec = auth.rec
  if (!rec.originalPath || !(await existsFor(rec))) {
    return NextResponse.json({ code: 404, message: 'raw bytes missing' }, { status: 404 })
  }
  const url = new URL(req.url)
  const wantDownload = url.searchParams.get('download') === '1'
  const range = req.headers.get('range')
  try {
    const { stream, statusCode, headers } = await openStream(rec, range)
    const mime = rec.mime || guessMime(rec.extension)
    const allHeaders: Record<string, string> = {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'X-File-Kind': rec.kind,
      'X-File-Extension': rec.extension,
      ...headers
    }
    // Inline lets browsers render (Preview SDK / <img> / <video>); attachment
    // for explicit download. RFC 5987 for non-ASCII names.
    const encoded = encodeURIComponent(rec.name)
    allHeaders['Content-Disposition'] = `${wantDownload ? 'attachment' : 'inline'}; filename="${encoded}"; filename*=UTF-8''${encoded}`
    // Node ReadStream → Web ReadableStream for NextResponse.
    const body = statusCode === 416 ? null : Readable.toWeb(stream as unknown as Readable)
    return new NextResponse(body as ReadableStream<Uint8Array> | null, {
      status: statusCode,
      headers: allHeaders
    })
  } catch (e) {
    return NextResponse.json(
      { code: 500, message: `读取失败：${(e as Error).message}` },
      { status: 500 }
    )
  }
}

/** HEAD — same auth, returns Content-Length / Accept-Ranges without a body.
 *  Preview SDK probes this on some file types. */
export async function HEAD(_req: Request, ctx: { params: { id: string } }) {
  const auth = await authorize(ctx.params.id)
  if (!auth.ok) return auth.res
  const rec = auth.rec
  const abs = resolveReadPath(rec)
  if (!abs) return new NextResponse(null, { status: 404 })
  try {
    const st = await fs.stat(abs)
    const mime = rec.mime || guessMime(rec.extension)
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(st.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'X-File-Kind': rec.kind,
        'X-File-Extension': rec.extension
      }
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
