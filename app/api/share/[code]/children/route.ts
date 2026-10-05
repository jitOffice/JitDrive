import { NextResponse } from 'next/server'
import {
  authorizePublic,
  folderSubtreeHasFolder,
  listPublicFolderChildren,
  getPublicFolderInfo,
  breadcrumbWithinShare
} from '@/lib/share'
import { kindOfExt } from '@/lib/filetypes'
import { getSessionUserId } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/share/[code]/children?folderId=<id>
//
// v0.5.2 · Sub-folder browsing for a folder-scoped share link.
//
// Returns { ok, folder, breadcrumb, folders, files } — the same shape the
// root `/api/share/[code]` folder branch returns, but scoped to any folder
// inside the shared subtree. Callers navigate by pushing
// `/s/[code]/d/[folderId]` on the client; the SSR page and this API share
// the same helpers.
//
// Gate: `authorizePublic` runs first (revoked / expired / view-limit /
// password / invite-only all short-circuit). Then `?folderId` must reference
// a folder inside the link's shared subtree — enforced by
// `folderSubtreeHasFolder`; anything outside returns 404 (never 403) to
// avoid leaking whether the target folderId exists in someone else's drive.
// File-scoped links return 400 (`folder-link-only`).

function noStore(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extra
  }
}

function fail(status: number, reason: string, message: string) {
  return NextResponse.json({ code: status, reason, message }, { status, headers: noStore() })
}

export async function GET(req: Request, ctx: { params: { code: string } }) {
  const gate = await authorizePublic(ctx.params.code, getSessionUserId())
  if (!gate.ok) return fail(gate.status, gate.reason, gate.message)
  if (!gate.unlocked) return fail(401, 'need-password', '请输入访问密码')
  if (gate.kind !== 'folder') return fail(400, 'folder-link-only', '此端点仅服务目录分享链接')

  const url = new URL(req.url)
  const rootId = gate.folder.id
  const q = url.searchParams.get('folderId')
  const currentId = q || rootId
  if (currentId !== rootId) {
    const inside = await folderSubtreeHasFolder(rootId, currentId)
    if (!inside) return fail(404, 'folder-outside-share', '该目录不在此分享范围内')
  }
  const [info, children, crumbs] = await Promise.all([
    getPublicFolderInfo(currentId),
    listPublicFolderChildren(currentId),
    currentId !== rootId ? breadcrumbWithinShare(rootId, currentId) : Promise.resolve([] as { id: string; name: string }[])
  ])
  if (!info || info.deleted) return fail(410, 'folder-gone', '目录已不可用')

  const rootInfo = await getPublicFolderInfo(rootId)
  return NextResponse.json(
    {
      code: 200,
      data: {
        status: 'ok',
        kind: 'folder',
        folder: {
          id: info.id,
          name: info.name,
          ownerName: info.ownerName,
          isRoot: currentId === rootId
        },
        root: rootInfo ? { id: rootInfo.id, name: rootInfo.name } : null,
        breadcrumb: [
          // Root crumb is always the link's shared folder — client renders it
          // as the left-most segment, matching v0.4 drive's 我的云盘 anchor.
          { id: rootId, name: rootInfo?.name ?? '' },
          ...crumbs
        ]
      ,
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
