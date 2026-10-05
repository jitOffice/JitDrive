import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { authorizePublic, recordView } from '@/lib/share'
import { getSessionUserId } from '@/lib/auth'
import { kindOfExt } from '@/lib/filetypes'
import { publicConfig } from '@/lib/jitword'
import PasswordGate from './PasswordGate'
import LoginGate from './LoginGate'
import ShareError from './ShareError'
import ShareFolderShell from './ShareFolderShell'
import { ShareFileRender } from './renderShareFile'

export const dynamic = 'force-dynamic'

/** Metadata: always noindex, regardless of state — Google must never crawl
 *  a share link even if the current visitor can view it. */
export const metadata: Metadata = {
  robots: { index: false, follow: false }
}

interface Props {
  params: { code: string }
}

/** /s/[code] — public landing page for a ShareLink.
 *
 *  Runs `authorizePublic` on the server so 404/410/401/403 cases short-circuit
 *  before any iframe / Preview SDK gets mounted. Once the visitor proves the
 *  password (or, for invite-only links, logs in as an allowlisted user) the
 *  browser holds the matching cookie which the very same server render path
 *  re-checks on the next request (via `router.refresh()` from the gate), so no
 *  client-side branching is required.
 *
 *  `recordView` fires once per successful (ok-branch) render — raw / ticket
 *  fetches deliberately don't touch the counter, otherwise Range prefetch
 *  and JitWord websocket handshake would inflate `viewCount` for maxViews
 *  gates.
 *
 *  v0.5.2 · Two flavors of a link:
 *    · file  → mount editor / preview for the linked file (unchanged from v0.5)
 *    · folder → mount `<ShareFolderShell>` at the shared root; deeper browsing
 *      lives under `/s/[code]/d/[folderId]`, file previews under
 *      `/s/[code]/f/[fileId]`. */
export default async function SharePage({ params }: Props) {
  const code = params.code
  const gate = await authorizePublic(code, getSessionUserId())
  if (!gate.ok) {
    if (gate.reason === 'not-found') notFound()
    if (gate.reason === 'need-login') return <LoginGate code={code} message={gate.message} />
    return <ShareError reason={gate.reason} message={gate.message} />
  }
  if (!gate.unlocked) {
    return <PasswordGate code={code} />
  }

  // Fire the view counter — best-effort, don't fail the page render.
  // v0.5.3 · S2: also capture visitor context (userId/ip/ua/referrer) for the
  // ShareView audit-detail layer. Header reads are defensive so a proxy that
  // strips them never breaks the render.
  try {
    const h = await headers()
    const viewerUserId = getSessionUserId()
    await recordView(gate.id, {
      userId: viewerUserId,
      ip:
        h.get('x-forwarded-for')?.split(',')[0].trim() ||
        h.get('x-real-ip') ||
        h.get('cf-connecting-ip') ||
        null,
      ua: h.get('user-agent') || null,
      referrer: h.get('referer') || null
    })
  } catch {
    /* noop */
  }

  const { link } = gate

  if (gate.kind === 'file') {
    return <ShareFileRender code={code} file={gate.file} link={link} />
  }

  // Folder root — one query for immediate children.
  const { listPublicFolderChildren } = await import('@/lib/share')
  const children = await listPublicFolderChildren(gate.folder.id)
  return (
    <ShareFolderShell
      code={code}
      folderName={gate.folder.name}
      ownerName={gate.folder.owner.name}
      isRoot
      breadcrumb={[]}
      folders={children.folders}
      files={children.files}
    />
  )
}
