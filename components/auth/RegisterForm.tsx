'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Icon from '../Icon'
import { DRIVE } from '@/lib/routes'

export default function RegisterForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(params.get('code') || '')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, inviteCode })
      })
      const j = await r.json().catch(() => ({ code: 0 }))
      if (j?.code === 200) {
        router.replace(DRIVE)
        router.refresh()
      } else {
        setErr(j?.message || '注册失败')
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
          <div className="text-base font-semibold text-wps-text">创建账号</div>
          <div className="text-[11px] text-wps-subtext">JitDrive · 需要邀请码</div>
        </div>
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-wps-subtext">昵称</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full rounded-md border border-wps-border px-3 py-2 text-sm outline-none focus:border-wps-brand"
          placeholder="选填，默认取邮箱前缀"
        />
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
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-wps-subtext">密码</label>
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-md border border-wps-border px-3 py-2 text-sm outline-none focus:border-wps-brand"
          placeholder="至少 6 位"
        />
      </div>
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium text-wps-subtext">邀请码</label>
        <input
          required
          value={inviteCode}
          onChange={e => setInviteCode(e.target.value)}
          className="w-full rounded-md border border-wps-border px-3 py-2 font-mono text-sm uppercase outline-none focus:border-wps-brand"
          placeholder="JW-XXXX-XXXX-XXXX"
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
        {busy ? '注册中…' : '注册并登录'}
      </button>

      <div className="mt-3 text-center text-xs text-wps-subtext">
        已有账号？
        <Link href="/login" className="ml-1 font-medium text-wps-brand hover:underline">
          去登录
        </Link>
      </div>
    </form>
  )
}
