'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FolderRecord } from '@/lib/types'
import Icon from './Icon'
import { useUI } from './ui/UIProvider'

interface Props {
  folders: FolderRecord[]
  actorId: string
}

const TRASH_RETENTION_DAYS = 30

function daysLeft(deletedAt?: number): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS
  const elapsed = (Date.now() - deletedAt) / 86400000
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor(elapsed))
}

/** Minimal trash-row for folders. Restore / purge cascade in the folder itself
 *  (all descendants come back with it — see lib/store.ts cascadeRestore &
 *  purgeFolder). Full folder management UI lives on the drive page. */
export default function FolderTrashList({ folders, actorId }: Props) {
  const router = useRouter()
  const { confirm, toast } = useUI()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function run(id: string, fn: () => Promise<{ code?: number; message?: string }>, okMsg?: string) {
    setBusyId(id)
    try {
      const j = await fn()
      if (j && j.code && j.code !== 200) toast(j.message || '操作失败', 'error')
      else {
        if (okMsg) toast(okMsg, 'success')
        router.refresh()
      }
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const json = (r: Response) => r.json().catch(() => ({ code: 0 }))

  async function restore(id: string) {
    await run(id, () => fetch(`/api/folders/${id}/restore`, { method: 'POST' }).then(json), '已还原文件夹')
  }

  async function purge(id: string) {
    const ok = await confirm({
      title: '彻底删除文件夹',
      tone: 'danger',
      icon: 'trash',
      message: '会连同该文件夹下的所有子文件夹和文档一起彻底删除（原始文件将移到系统废纸篓）。此操作不可撤销。',
      confirmText: '彻底删除'
    })
    if (!ok) return
    await run(id, () => fetch(`/api/folders/${id}/purge`, { method: 'DELETE' }).then(json), '已彻底删除')
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {folders.map(f => {
        const owned = f.ownerId === actorId
        const busy = busyId === f.id
        return (
          <div
            key={f.id}
            className="file-card group relative rounded-lg border border-dashed border-wps-border bg-white p-4 opacity-90 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-amber-50 text-amber-600">
                <Icon name="folder" size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-wps-text" title={f.name}>
                  {f.name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-wps-subtext">
                  <span className="flex items-center gap-1 text-amber-600">
                    <Icon name="trash" size={11} />
                    剩 {daysLeft(f.deletedAt)} 天
                  </span>
                  {typeof f.childCount === 'number' && <span>· 包含 {f.childCount} 项</span>}
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                disabled={busy || !owned}
                onClick={() => restore(f.id)}
                className="flex items-center gap-1 rounded border border-wps-border px-2 py-1 text-wps-text hover:bg-slate-50 disabled:opacity-50"
              >
                <Icon name="restore" size={13} />
                还原
              </button>
              <button
                disabled={busy || !owned}
                onClick={() => purge(f.id)}
                className="flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                <Icon name="trash" size={13} />
                彻底删除
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
