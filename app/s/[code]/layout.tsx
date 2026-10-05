import type { Metadata } from 'next'
import Link from 'next/link'
import Icon from '@/components/Icon'
import { getSessionUserId } from '@/lib/auth'
import { DRIVE } from '@/lib/routes'
import ShareCta from './ShareCta'

/** Public site-wide layout for share landing pages. Deliberately does NOT
 *  wrap `(drive)` — no Sidebar / TopBar / session cookie needed. The whole
 *  `/s` subtree is anonymous-accessible (subject to the per-link password /
 *  expiry / revoke gate handled in `page.tsx`). */
export const metadata: Metadata = {
  title: '分享链接 · JitDrive',
  robots: { index: false, follow: false }
}

export default async function ShareLayout({ children }: { children: React.ReactNode }) {
  // v0.5.3 · S4: show the PLG registration CTA to anonymous visitors only.
  // A logged-in viewer already has an account, so we don't pitch signup at them.
  const viewer = !!getSessionUserId()
  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-wps-border bg-white px-4">
        <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-wps-brand">
          <Icon name="drive" size={16} />
          JitDrive
        </Link>
        <span className="text-xs text-wps-subtext">· 公开分享</span>
        <div className="ml-auto flex items-center gap-3 text-[11px] text-wps-subtext">
          <Link href={DRIVE} className="hover:text-wps-text">
            进入我的云盘
          </Link>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
      {!viewer && <ShareCta />}
    </div>
  )
}
