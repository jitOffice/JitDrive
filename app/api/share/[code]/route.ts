import { NextResponse } from 'next/server'
import { authorizePublic } from '@/lib/share'
import { kindOfExt } from '@/lib/filetypes'
import { getSessionUserId } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/share/[code] → public metadata for a share link.
//
// Three shapes on 200:
//   { status: 'need-password' }                       ← password gate closed
//   { status: 'ok', link, kind: 'file',   file }      ← open file link (v0.5)
//   { status: 'ok', link, kind: 'folder', folder, children } ← open folder link (v0.5.2)
//
// Error statuses (from authorizePublic gate):
//   404 not-found · 410 revoked / expired / view-limit / file-gone / folder-gone
//   401 need-login (invite-only + no session) · 403 not-invited (invite-only + outsider)
// Never carries raw bytes or docId — those go through the /raw and /ticket
// sub-resources which enforce the same gate.
//
// v0.5.2 · folder branch also returns the immediate children (sub-folders +
// files, deleted items filtered) so the landing page can render the shared
// directory in one round-trip. Deeper browsing goes through
// `GET /api/share/[code]/children?folderId=`.

function noStore(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra
  }
}

export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const gate = await authorizePublic(ctx.params.code, getSessionUserId())
  if (!gate.ok) {
    return NextResponse.json(
      { code: gate.status, reason: gate.reason, message: gate.message },
      { status: gate.status, headers: noStore() }
    )
  }
  if (!gate.unlocked) {
    // Don't leak the filename / folder-name / owner until the visitor proves the password.
    return NextResponse.json(
      { code: 200, data: { status: 'need-password', hasPassword: true } },
      { headers: noStore() }
    )
  }
  const { link } = gate
  const linkPayload = {
    code: link.code,
    url: link.url,
    hasPassword: link.hasPassword,
    expiresAt: link.expiresAt,
    maxViews: link.maxViews,
    viewCount: link.viewCount,
    allowDownload: link.allowDownload,
    createdAt: link.createdAt
  }
  if (gate.kind === 'file') {
    const file = gate.file
    return NextResponse.json(
      {
        code: 200,
        data: {
          status: 'ok',
          kind: 'file',
          link: linkPayload,
          file: {
            id: file.id,
            name: file.name,
            extension: file.extension,
            mime: file.mime,
            size: file.size,
            kind: kindOfExt(file.extension),
            hasDocId: !!file.docId,
            ownerName: file.owner.name
          }
        }
      },
      { headers: noStore() }
    )
  }
  // Folder branch — bundle root info + immediate children in one response so
  // the landing page doesn't need a second round-trip for the initial paint.
  const { getPublicFolderInfo, listPublicFolderChildren } = await import('@/lib/share')
  const info = await getPublicFolderInfo(gate.folder.id)
  const children = await listPublicFolderChildren(gate.folder.id)
  return NextResponse.json(
    {
      code: 200,
      data: {
        status: 'ok',
        kind: 'folder',
        link: linkPayload,
        folder: {
          id: gate.folder.id,
          name: info?.name ?? gate.folder.name,
          ownerName: gate.folder.owner.name,
          isRoot: true
        },
        folders: children.folders,
        files: children.files.map(f => ({
          id: f.id,
          name: f.name,
          extension: f.extension,
          size: f.size,
          mime: f.mime,
          kind: kindOfExt(f.extension),
          hasDocId: !!f.docId
        }))
      }
    },
    { headers: noStore() }
  )
}
