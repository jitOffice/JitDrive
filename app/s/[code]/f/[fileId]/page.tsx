import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  authorizePublic,
  folderSubtreeHasFile,
  getPublicFileRow,
  getPublicFolderInfo
} from '@/lib/share'
import { getSessionUserId } from '@/lib/auth'
import PasswordGate from '../../PasswordGate'
import LoginGate from '../../LoginGate'
import ShareError from '../../ShareError'
import { ShareFileRender } from '../../renderShareFile'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false } }

interface Props {
  params: { code: string; fileId: string }
}

/** /s/[code]/f/[fileId] — file preview within a folder-scoped share link.
 *
 *  Guards mirror `/s/[code]/d/[folderId]`: `authorizePublic` for the link-
 *  level gate, then `folderSubtreeHasFile(linkRootFolderId, fileId)` to
 *  ensure the requested file actually lives under the shared folder.
 *  Foreign fileIds short-circuit to `notFound()` (404, not 403) so outsiders
 *  can't enumerate which files exist elsewhere in the drive.
 *
 *  `?fileId=` on the underlying /raw and /ticket calls is threaded by
 *  `<ShareFileRender>` → `<ShareFilePreview>` / `<ShareEditorClient>`; the
 *  server side enforces the same subtree check independently, so the gate is
 *  not purely client-side.
 *
 *  `recordView` intentionally doesn't fire per-file-open (mirrors the sub-
 *  folder page's stance). One landing-page open = one view; deep navigation
 *  inside the shared tree is free. */
export default async function ShareFileInFolderPage({ params }: Props) {
  const { code, fileId } = params
  const gate = await authorizePublic(code, getSessionUserId())
  if (!gate.ok) {
    if (gate.reason === 'not-found') notFound()
    if (gate.reason === 'need-login') return <LoginGate code={code} message={gate.message} />
    return <ShareError reason={gate.reason} message={gate.message} />
  }
  if (!gate.unlocked) return <PasswordGate code={code} />
  if (gate.kind !== 'folder') {
    // File-scoped links preview their one bound file at `/s/[code]`; a
    // hand-typed `/s/[code]/f/<other>` shouldn't get to peek elsewhere.
    notFound()
  }
  const inside = await folderSubtreeHasFile(gate.folder.id, fileId)
  if (!inside) notFound()
  const file = await getPublicFileRow(fileId)
  if (!file || file.deleted) return <ShareError reason="file-gone" />
  // Sanity: also verify the file's owner is the same user who owns the shared
  // folder (guards against a weird edge case where fileId was cross-linked
  // via a manual DB edit). Cheap check, prevents surprises.
  const rootInfo = await getPublicFolderInfo(gate.folder.id)
  if (!rootInfo || rootInfo.deleted) return <ShareError reason="folder-gone" />
  return <ShareFileRender code={code} file={file} link={gate.link} fileId={fileId} />
}
