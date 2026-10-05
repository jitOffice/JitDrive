import { redirect } from 'next/navigation'
import { getActorId } from '@/lib/users'
import { getCurrentUser } from '@/lib/auth'
import { ensureBootstrap } from '@/lib/bootstrap'
import { maybeReapExpiredTrash } from '@/lib/reap'
import { getStorageUsage } from '@/lib/store'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'

export const dynamic = 'force-dynamic'

// Authenticated app shell. Runs the one-time bootstrap, then gates every drive
// page behind a valid session in a single place (pages no longer each check).
// Everything under app/(drive) inherits this chrome + gate.
export default async function DriveLayout({ children }: { children: React.ReactNode }) {
  await ensureBootstrap()
  if (!getActorId()) redirect('/login')
  // actor is known from the cookie, so the two reads run in parallel — neither
  // depends on the other's result, and both are indexed single-user scans.
  const [user, usage] = await Promise.all([getCurrentUser(), getStorageUsage(getActorId())])
  if (!user) redirect('/login') // stale cookie pointing at a deleted account

  // S14 · recycle-bin 30-day sweep. Fire-and-forget: internally throttled to
  // ~once per 6h and self-swallows errors, so it never blocks or breaks render.
  maybeReapExpiredTrash()

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar usage={usage} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar user={{ id: user.id, email: user.email, name: user.name, color: user.color }} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
