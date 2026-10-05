'use client'

import Link from 'next/link'
import Icon from '@/components/Icon'

interface Props {
  code: string
  message?: string
}

/** /s/[code] visitor is anonymous AND the link is invite-only. Renders a
 *  slim sign-in CTA that returns the browser to this exact share page after
 *  login (via `?next=`, honoured by LoginForm's safe-redirect guard). This
 *  is intentionally NOT a full-page auth wall — the visitor already trusts
 *  the sharer (they clicked their link), so we just bridge one hop. */
export default function LoginGate({ code, message }: Props) {
  const href = `/login?next=${encodeURIComponent(`/s/${code}`)}`
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-wps-border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-wps-brand">
          <Icon name="users" size={22} />
        </div>
        <div className="text-lg font-semibold text-wps-text">此分享仅对指定用户可见</div>
        <div className="mt-1 text-xs text-wps-subtext">
          {message || '请先登录 JitDrive 账号，登录后会自动返回此页面。'}
        </div>
        <Link
          href={href}
          className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-wps-brand px-3 py-2 text-sm font-medium text-white hover:bg-wps-brandDark"
        >
          <Icon name="users" size={14} />
          前往登录
        </Link>
        <div className="mt-3 text-[11px] text-wps-subtext">
          如果你还没收到邀请，请让分享者在「仅指定用户」名单里加上你。
        </div>
      </div>
    </div>
  )
}
