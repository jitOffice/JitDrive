'use client'

import { useEffect, useState } from 'react'
import type { ActorUser, FileRecord } from '@/lib/types'
import { useUI } from '../ui/UIProvider'
import UserPicker from './UserPicker'

interface Props {
  file: FileRecord
  actorId: string
  onSaved: () => void
}

/** Internal "invite collaborators" tab. Backed by the pre-existing FileShare
 *  roster (POST /api/files/[id]/share) — completely separate from the public
 *  ShareLink channel. Viewers see the file in their "共享给我" list with
 *  read-only access; no link is generated here.
 *
 *  v0.5.1: replaced the old hardcoded toggle list (which could only show the
 *  handful of users returned in one shot and had no search) with the shared
 *  <UserPicker>, so any colleague can be found by name/email. The initial
 *  already-shared people are resolved from a one-off `/api/users?limit=100`
 *  roster read (demo-scale; a real deployment would add an `?ids=` lookup). */
export default function UsersPane({ file, actorId, onSaved }: Props) {
  const { toast } = useUI()
  const [selected, setSelected] = useState<ActorUser[]>([])
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)

  // Seed already-shared users so reopening the dialog shows the current roster.
  useEffect(() => {
    let alive = true
    fetch('/api/users?limit=100')
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        const all: ActorUser[] = j.data || []
        const shared = new Set(file.sharedWith)
        setSelected(all.filter(u => shared.has(u.id)))
        setReady(true)
      })
      .catch(() => {
        if (alive) setReady(true)
      })
    return () => {
      alive = false
    }
  }, [file.sharedWith])

  async function save() {
    setBusy(true)
    try {
      const r = await fetch(`/api/files/${file.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectIds: selected.map(u => u.id) })
      })
      const j = await r.json().catch(() => ({ code: 0 }))
      if (j && j.code && j.code !== 200) toast(j.message || '共享失败', 'error')
      else {
        toast(selected.length ? `已共享给 ${selected.length} 位同事` : '已更新共享名单', 'success')
        onSaved()
      }
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-wps-subtext">
        选中同事会以<b>只读</b>身份出现在对方的「共享给我」列表，不需要链接、也不能被转发。支持按姓名或邮箱搜索。
      </div>
      {ready ? (
        <UserPicker value={selected} onChange={setSelected} excludeIds={[actorId]} placeholder="搜索同事姓名或邮箱并添加…" />
      ) : (
        <div className="rounded-md border border-wps-border bg-slate-50 px-3 py-2 text-xs text-wps-subtext">加载共享名单…</div>
      )}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={busy || !ready}
          className="rounded-md bg-wps-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-wps-brandDark disabled:opacity-50"
        >
          {busy ? '保存中…' : `确认共享（${selected.length}）`}
        </button>
      </div>
    </div>
  )
}
