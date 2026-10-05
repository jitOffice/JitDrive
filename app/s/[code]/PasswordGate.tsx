'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Icon from '@/components/Icon'

interface Props {
  code: string
}

/** Client component: POST /api/share/[code]/unlock, on success the server
 *  sets the `jw_share` HMAC cookie and we router.refresh() so the SSR page
 *  re-runs `authorizePublic` with the cookie present, this time returning
 *  the actual preview instead of the gate. */
export default function PasswordGate({ code }: Props) {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pw || busy) return
    setBusy(true)
    setErr(null)
    try {
      const r = await fetch(`/api/share/${code}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      })
      const j = await r.json().catch(() => ({ code: 0 }))
      if (r.status === 429) {
        setLocked(true)
        setErr(j?.message || '尝试次数过多，请稍后再试')
      } else if (r.ok && j?.code === 200) {
        router.refresh()
      } else {
        setErr(j?.message || '密码不正确')
      }
    } catch (e2) {
      setErr((e2 as Error).message || '网络错误')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl border border-wps-border bg-white p-8 shadow-sm"
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-50 text-wps-brand">
          <Icon name="lock" size={22} />
        </div>
        <div className="text-center text-lg font-semibold text-wps-text">此分享受密码保护</div>
        <div className="mt-1 text-center text-xs text-wps-subtext">
          请输入分享者提供的访问密码继续预览。
        </div>
        <div className="mt-6 space-y-2">
          <input
            autoFocus
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder="访问密码"
            disabled={locked}
            className="w-full rounded-md border border-wps-border bg-white px-3 py-2 text-sm outline-none focus:border-wps-brand disabled:bg-slate-100"
          />
          {err && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-600">
              {err}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !pw || locked}
            className="w-full rounded-md bg-wps-brand px-3 py-2 text-sm font-medium text-white hover:bg-wps-brandDark disabled:opacity-50"
          >
            {busy ? '校验中…' : '解锁查看'}
          </button>
        </div>
        <div className="mt-4 text-center text-[10px] text-wps-subtext">
          密码连续输错 5 次会临时锁定 15 分钟
        </div>
      </form>
    </div>
  )
}
