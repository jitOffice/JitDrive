import { NextResponse } from 'next/server'
import { getFile } from '@/lib/store'
import { issueTicket, resolveOrigin } from '@/lib/jitword'
import {
  authorizePublic,
  folderSubtreeHasFile,
  type PublicFileRow,
  type PublicFolderRow
} from '@/lib/share'
import { getSessionUserId } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/share/[code]/ticket — issue a JitWord viewer ticket for a shared
// docx. Only `kind === 'jitword'` files (i.e. docx) go through this path;
// previewable/image/audio/etc. use /raw + JitWord-Preview SDK on the client.
//
// Hard-coded to read-only viewer permission — the "shared link" flow is
// explicitly one-way (see PRD US-19). Never honours any client-supplied
// role/scope; the `?mode` query is intentionally absent.
//
// Gate mirrors /raw: revoked / expired / view-limit / file-gone / folder-gone
// → 410, and password links require a valid jw_share unlock cookie (401
// otherwise).
//
// v0.5.2 · Folder-scoped links REQUIRE ?fileId=<id>; the target file must live
// inside the shared folder's recursive subtree (checked server-side, 404 on
// miss). File-scoped links ignore ?fileId and stream their bound file verbatim,
// byte-level compatible with v0.5.

function noStore(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra
  }
}

async function resolveTargetFileId(
  g: { kind: 'file'; file: PublicFileRow } | { kind: 'folder'; folder: PublicFolderRow },
  url: URL
): Promise<{ ok: true; fileId: string } | { ok: false; res: NextResponse }> {
  if (g.kind === 'file') return { ok: true, fileId: g.file.id }
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

export async function POST(req: Request, ctx: { params: { code: string } }) {
  const g = await authorizePublic(ctx.params.code, getSessionUserId())
  if (!g.ok) {
    return NextResponse.json(
      { code: g.status, reason: g.reason, message: g.message },
      { status: g.status, headers: noStore() }
    )
  }
  if (!g.unlocked) {
    return NextResponse.json(
      { code: 401, reason: 'need-password', message: '请输入访问密码' },
      { status: 401, headers: noStore() }
    )
  }
  const url = new URL(req.url)
  const target = await resolveTargetFileId(g, url)
  if (!target.ok) return target.res
  // Fresh authoritative read to catch any drift since the link was created.
  const rec = await getFile(target.fileId)
  if (!rec || rec.deleted) {
    return NextResponse.json(
      { code: 410, reason: 'file-gone', message: '文件已不可用' },
      { status: 410, headers: noStore() }
    )
  }
  if (!rec.docId) {
    return NextResponse.json(
      { code: 415, message: '此文件类型不走 JitWord 编辑器，请使用预览或下载路径' },
      { status: 415, headers: noStore() }
    )
  }
  const origin = resolveOrigin(req)
  try {
    const t = await issueTicket({
      docId: rec.docId,
      origin,
      // Replay the JitWord-side creator subject so the ticket binds to a
      // principal that already owns the doc on JitWord's ACL. Falls back to
      // the current owner cuid only for rows the backfill hasn't healed.
      externalSubject: rec.jwSubject || rec.ownerSubject,
      permission: { role: 'viewer', scopes: ['document:read'] },
      ui: { readonly: true, theme: 'light', toolbar: 'none' }
    })
    return NextResponse.json(
      { code: 200, data: { ...t, canEdit: false, isOwner: false, shared: true } },
      { headers: noStore() }
    )
  } catch (e) {
    return NextResponse.json(
      { code: 502, message: `JitWord 签发 ticket 失败：${(e as Error).message}` },
      { status: 502, headers: noStore() }
    )
  }
}
