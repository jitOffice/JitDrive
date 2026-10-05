'use client'

// Signed-in user chip in the top bar. Replaces the earlier demo persona
// switcher. Two actions: 邀请同事 (open the invite-code modal) and 退出登录
// (clears the session cookie and navigates to /login).
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import Modal from './ui/Modal'
import { useUI } from './ui/UIProvider'

export interface UserLite {
  id: string
  email: string
  name: string
  color: string
}

interface InviteRow {
  code: string
  used: boolean
  createdAt: number
}

export default function UserMenu({ user }: { user: UserLite }) {
  const router = useRouter()
  const { toast } = useUI()
  const [open, setOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setOpen(false)
      router.replace('/login')
      router.refresh()
    } catch (e) {
      toast((e as Error).message || '退出失败', 'error')
    }
  }

  async function openInvite() {
    setOpen(false)
    setInviteOpen(true)
    setBusy(true)
    try {
      const r = await fetch('/api/auth/invite')
      const j = await r.json().catch(() => ({ code: 0 }))
      setInvites((j?.data || []) as InviteRow[])
    } finally {
      setBusy(false)
    }
  }

  async function genInvite() {
    setBusy(true)
    try {
      const r = await fetch('/api/auth/invite', { method: 'POST' })
      const j = await r.json().catch(() => ({ code: 0 }))
      if (j?.code === 200 && j?.data?.code) {
        setInvites(list => [{ code: j.data.code as string, used: false, createdAt: Date.now() }, ...list])
        toast('已生成新邀请码', 'success')
      } else {
        toast(j?.message || '生成失败', 'error')
      }
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusy(false)
    }
  }

  function copy(text: string) {
    if (!navigator.clipboard) {
      toast('浏览器不支持自动复制，请手动选中', 'error')
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => toast('已复制到剪贴板', 'success'))
      .catch(() => toast('复制失败，请手动选中', 'error'))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-full border border-wps-border py-1 pl-1 pr-2 text-sm text-wps-text hover:bg-slate-50"
      >
        <span
          className="grid h-7 w-7 place-items-center rounded-full text-xs font-medium text-white"
          style={{ background: user.color }}
        >
          {user.name.slice(0, 1)}
        </span>
        <span className="hidden max-w-[6rem] truncate sm:inline">{user.name}</span>
        <Icon name="chevron" size={14} className="text-wps-subtext" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-lg border border-wps-border bg-white py-1 shadow-lg">
          <div className="px-3 py-2">
            <div className="truncate text-sm font-medium text-wps-text">{user.name}</div>
            <div className="truncate text-xs text-wps-subtext">{user.email}</div>
          </div>
          <div className="mx-2 my-1 h-px bg-wps-border" />
          <button
            onClick={openInvite}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-wps-text hover:bg-slate-50"
          >
            <Icon name="link" size={15} className="text-wps-subtext" />
            邀请同事加入
          </button>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-wps-text hover:bg-slate-50"
          >
            <Icon name="logout" size={15} className="text-wps-subtext" />
            退出登录
          </button>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="邀请同事"
        icon="link"
        footer={
          <button
            onClick={() => setInviteOpen(false)}
            className="rounded-md border border-wps-border px-3 py-1.5 text-sm text-wps-text hover:bg-slate-50"
          >
            关闭
          </button>
        }
      >
        <div className="text-xs text-wps-subtext">
          分享邀请码给同事，他们用邮箱 + 密码 + 邀请码即可注册新账号。<b>每个邀请码仅能使用一次。</b>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={genInvite}
            disabled={busy}
            className="rounded-md bg-wps-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-wps-brandDark disabled:opacity-60"
          >
            {busy ? '处理中…' : '生成新邀请码'}
          </button>
          <span className="text-[11px] text-wps-subtext">生成后自动出现在下方列表</span>
        </div>
        <div className="mt-3 max-h-64 overflow-auto rounded-md border border-wps-border">
          {invites.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-wps-subtext">还没有生成过邀请码</div>
          )}
          {invites.map((r, i) => (
            <div
              key={r.code}
              className={'flex items-center gap-2 px-3 py-2 text-sm ' + (i ? 'border-t border-wps-border' : '')}
            >
              <code className="flex-1 truncate font-mono text-xs text-wps-text">{r.code}</code>
              <span
                className={
                  'rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                  (r.used ? 'bg-slate-100 text-wps-subtext' : 'bg-emerald-50 text-emerald-600')
                }
              >
                {r.used ? '已使用' : '未使用'}
              </span>
              <button
                onClick={() => copy(r.code)}
                className="rounded border border-wps-border px-2 py-0.5 text-xs text-wps-text hover:bg-slate-50"
              >
                复制
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
