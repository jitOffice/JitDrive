import { getFile, touchFile } from '@/lib/store'
import { getActorId } from '@/lib/users'
import { notFound, redirect } from 'next/navigation'
import PreviewClient from '@/components/PreviewClient'
import ViewHeader from '@/components/ViewHeader'
import { TRASH, DRIVE_HOME, editorRoute } from '@/lib/routes'

export const dynamic = 'force-dynamic'

/** /files/[id]/view — non-jitword preview page. The /files/[id] route already
 *  knows to bounce pdfs/xlsx/images here; if someone lands on this URL for a
 *  docx we hand them back to the editor instead of showing a static preview
 *  (JitWord has richer interactions in that case). */
export default async function ViewPage({ params }: { params: { id: string } }) {
  const rec = await getFile(params.id)
  if (!rec) notFound()
  if (rec.deleted) redirect(TRASH)

  const actor = getActorId()
  const isOwner = rec.ownerSubject === actor
  const isViewer = !isOwner && rec.sharedWith.includes(actor)
  if (!isOwner && !isViewer) redirect(DRIVE_HOME)

  await touchFile(rec.id)

  if (rec.kind === 'jitword') redirect(editorRoute(rec.id, 'preview'))

  return (
    <div className="flex h-full flex-col">
      <ViewHeader file={rec} canEdit={isOwner} received={isViewer} ownerName={rec.ownerName} actorId={actor} />
      <div className="flex-1 overflow-hidden bg-slate-100">
        <PreviewClient file={rec} />
      </div>
    </div>
  )
}
