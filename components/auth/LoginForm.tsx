'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Icon from '../Icon'
import { DRIVE } from '@/lib/routes'

/** Only allow same-origin absolute paths as post-login destinations. Rejects
 *  full URLs, protocol-relative (`//evil`), and backslash tricks so a crafted
 *  `?next=` can't turn login into an open redirect. Falls back to the drive
 *  (not the marketing root) so a bare visit to /login lands the user in /drive. */
function safeNext(raw: string | null): string {
  if (!raw) return DRIVE
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DRIVE
  if (/[\s]/.test(raw)) return DRIVE
  return raw
}

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const j = await r.json().catch(() => ({ code: 0 }))
      if (j?.code === 200) {
        router.replace(next)
        router.refresh()
      } else {
        setErr(j?.message || '登录失败')
        setBusy(false)
      }
    } catch (e2) {
      setErr((e2 as Error).message || '网络错误')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <div className="mb-6 flex items-center gap-2">
        <div className="grid h-9 w-9 place-items-center rounded-md bg-wps-brand text-white">
          <Icon name="drive" size={20} />
        </div>
        <div className="leading-tight">
          <div className="text-base font-semibold text-wps-text">JitDrive</div>
          <div className="text-[11px] text-wps-subtext">智能云盘 · 登录继续</div>
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-wps-subtext">邮箱</label>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-md border border-wps-border px-3 py-2 text-sm outline-none focus:border-wps-brand"
          placeholder="you@example.com"
        />
      </div>
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-wps-subtext">密码</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-md border border-wps-border px-3 py-2 text-sm outline-none focus:border-wps-brand"
          placeholder="••••••"
        />
      </div>

      {err && (
        <div className="mb-3 flex items-center gap-1.5 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          <Icon name="alert" size={14} />
          {err}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-wps-brand px-3 py-2 text-sm font-medium text-white hover:bg-wps-brandDark disabled:opacity-60"
      >
        {busy ? '登录中…' : '登录'}
      </button>

      <div className="mt-3 text-center text-xs text-wps-subtext">
        还没有账号？
        <Link href="/register" className="ml-1 font-medium text-wps-brand hover:underline">
          使用邀请码注册
        </Link>
      </div>
    </form>
  )
}
