import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  authorizePublic,
  recordView,
  folderSubtreeHasFolder,
  getPublicFolderInfo,
  listPublicFolderChildren,
  breadcrumbWithinShare
} from '@/lib/share'
import { getSessionUserId } from '@/lib/auth'
import PasswordGate from '../../PasswordGate'
import LoginGate from '../../LoginGate'
import ShareError from '../../ShareError'
import ShareFolderShell from '../../ShareFolderShell'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

interface Props {
  params: { code: string; folderId: string }
}

/** /s/[code]/d/[folderId] — sub-folder view for a folder-scoped share link.
 *
 *  Guards (in order): link-level `authorizePublic` gate, then
 *  `folderSubtreeHasFolder(rootId, subId)` to reject any folderId outside the
 *  shared tree. Foreign folderIds return 404 (via `notFound()`) so outsiders
 *  can't probe which folderIds exist elsewhere in the drive. Password /
 *  invite-only gates reuse the parent's cookies — one unlock covers the whole
 *  link.
 *
 *  `recordView` intentionally doesn't fire on sub-folder navigations: v0.5's
 *  semantic is "one view = one landing-page open", the root /s/[code] render
 *  already counted it. Otherwise browsing a 10-level tree would consume 10
 *  of a `maxViews=20` budget. */
export default async function ShareFolderSubPage({ params }: Props) {
  const { code, folderId } = params
  const gate = await authorizePublic(code, getSessionUserId())
  if (!gate.ok) {
    if (gate.reason === 'not-found') notFound()
    if (gate.reason === 'need-login') return <LoginGate code={code} message={gate.message} />
    return <ShareError reason={gate.reason} message={gate.message} />
  }
  if (!gate.unlocked) return <PasswordGate code={code} />
  if (gate.kind !== 'folder') {
    // File-scoped link doesn't have a folder tree — behave as "URL doesn't
    // exist here" so a mistyped bookmark just 404s.
    notFound()
  }
  const rootId = gate.folder.id
  if (folderId === rootId) {
    // Same-page URL as `/s/[code]` — the caller can just hit the root instead.
    notFound()
  }
  const inside = await folderSubtreeHasFolder(rootId, folderId)
  if (!inside) notFound()
  const [info, children, crumbs] = await Promise.all([
    getPublicFolderInfo(folderId),
    listPublicFolderChildren(folderId),
    breadcrumbWithinShare(rootId, folderId)
  ])
  if (!info || info.deleted) return <ShareError reason="folder-gone" />
  const rootInfo = await getPublicFolderInfo(rootId)
  return (
    <ShareFolderShell
      code={code}
      folderName={info.name}
      ownerName={info.ownerName}
      isRoot={false}
      breadcrumb={[{ id: rootId, name: rootInfo?.name ?? gate.folder.name }, ...crumbs]}
      folders={children.folders}
      files={children.files}
    />
  )
}
