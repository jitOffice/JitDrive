import { getFile, touchFile } from '@/lib/store'
import EditorClient from '@/components/EditorClient'
import FileHeader from '@/components/FileHeader'
import { publicConfig } from '@/lib/jitword'
import { getActorId } from '@/lib/users'
import { notFound, redirect } from 'next/navigation'
import { TRASH, DRIVE_HOME, fileViewRoute } from '@/lib/routes'

export const dynamic = 'force-dynamic'

type Search = { mode?: string; debug?: string }

export default async function FilePage({
  params,
  searchParams
}: {
  params: { id: string }
  searchParams: Search
}) {
  const rec = await getFile(params.id)
  if (!rec) notFound()
  if (rec.deleted) redirect(TRASH)

  const actor = getActorId()
  const isOwner = rec.ownerSubject === actor
  const isViewer = !isOwner && rec.sharedWith.includes(actor)
  // A stranger (neither owner nor shared) has no business opening this doc.
  if (!isOwner && !isViewer) redirect(DRIVE_HOME)

  // 最近打开: record this open.
  await touchFile(rec.id)

  // Non-jitword files (pdf/xlsx/media/etc.) don't have a JitWord docId —
  // delegate them to the Preview SDK page at /files/[id]/view. This route
  // stays purely about the JitWord editor.
  if (rec.kind !== 'jitword' || !rec.docId) redirect(fileViewRoute(rec.id))

  const requestedMode: 'edit' | 'preview' = searchParams?.mode === 'preview' ? 'preview' : 'edit'
  // Non-owners can never get an editable session — force preview.
  const mode: 'edit' | 'preview' = requestedMode === 'edit' && isOwner ? 'edit' : 'preview'
  const debug = searchParams?.debug === '1'
  const cfg = publicConfig()

  return (
    <div className="flex h-full flex-col">
      <FileHeader
        file={rec}
        mode={mode}
        canEdit={isOwner}
        received={isViewer}
        ownerName={rec.ownerName}
        actorId={actor}
      />
      <div className="flex-1 overflow-hidden bg-slate-100">
        <EditorClient
          fileId={rec.id}
          docId={rec.docId}
          fileName={rec.name}
          mode={mode}
          hasPendingImport={rec.pendingImport && isOwner}
          cfg={cfg}
          debug={debug}
        />
      </div>
    </div>
  )
}
