'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon from '@/components/Icon'
import { track } from '@/lib/client/track'

/** v0.5.3 · S4 PLG footer on public share landing pages. Shown to anonymous
 *  visitors only (the server layout gates it) — every person who opened a link
 *  is a warm registration lead. Deliberately a slim, non-blocking bottom bar:
 *  it must never cover the document being previewed.
 *
 *  The click fires a `link_landing_register_click` beacon (carrying the share
 *  code, derived from the current /s/<code>/... path) before navigating to
 *  /register, so we can measure landing → signup conversion. */
export default function ShareCta() {
  const pathname = usePathname() || ''
  // pathname looks like `/s/ABC123` or `/s/ABC123/f/xyz` → grab the 3rd segment.
  const code = pathname.split('/')[2] || ''

  function onClick() {
    track('link_landing_register_click', { code })
  }

  return (
    <footer className="flex shrink-0 items-center gap-3 border-t border-wps-border bg-white px-4 py-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-red-50 text-wps-brand">
        <Icon name="drive" size={18} />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-wps-text">
          想像这样分享你的文档？
        </div>
        <div className="truncate text-[11px] text-wps-subtext">
          JitDrive · Word 高保真协同，链接可设密码 / 白名单 / 随时撤销
        </div>
      </div>
      <Link
        href="/register"
        onClick={onClick}
        className="shrink-0 rounded-md bg-wps-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-wps-brandDark"
      >
        免费注册
      </Link>
    </footer>
  )
}
