'use client'

import { useEffect, useMemo, useState } from 'react'
import type { FolderRecord } from '@/lib/types'
import Modal from './ui/Modal'
import Icon from './Icon'
import { useUI } from './ui/UIProvider'

interface Props {
  title: string
  /** When moving a folder, its own id — used to prune the subtree from the
   *  candidate list (would create a cycle). Pass null when moving a file. */
  fromFolderId: string | null
  /** Current parent of the item. Shown as "当前位置" and disabled in the list. */
  currentParentId: string | null
  actorId: string
  onClose: () => void
  onMoved: () => void
  /** PATCH endpoint — /api/files/[id] or /api/folders/[id]. Body: {parentId}. */
  endpoint: string
}

/** Folder tree picker used by 移动 to. Renders as an expandable list; a
 *  synthetic "我的云盘" root entry lets the user move back to top level. */
export default function MoveToFolderDialog({
  title,
  fromFolderId,
  currentParentId,
  onClose,
  onMoved,
  endpoint
}: Props) {
  const { toast } = useUI()
  const [folders, setFolders] = useState<FolderRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setErr(null)
      try {
        const r = await fetch('/api/folders', { cache: 'no-store' })
        const j = await r.json()
        if (j?.code !== 200) throw new Error(j?.message || '加载目录失败')
        if (!cancelled) setFolders(j.data as FolderRecord[])
      } catch (e) {
        if (!cancelled) setErr((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Prune: exclude self + all descendants of self (they'd form a cycle).
  const visible = useMemo(() => {
    if (!folders) return [] as FolderRecord[]
    if (!fromFolderId) return folders
    const banned = new Set<string>([fromFolderId])
    let grew = true
    while (grew) {
      grew = false
      for (const f of folders) {
        if (f.parentId && banned.has(f.parentId) && !banned.has(f.id)) {
          banned.add(f.id)
          grew = true
        }
      }
    }
    return folders.filter(f => !banned.has(f.id))
  }, [folders, fromFolderId])

  // Build ordered tree (BFS by level) with depth for indentation.
  const rows = useMemo(() => {
    const byParent = new Map<string | null, FolderRecord[]>()
    for (const f of visible) {
      const key = f.parentId
      const list = byParent.get(key) || []
      list.push(f)
      byParent.set(key, list)
    }
    const out: { folder: FolderRecord; depth: number; hasKids: boolean }[] = []
    const visit = (parentId: string | null, depth: number) => {
      const kids = (byParent.get(parentId) || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
      for (const k of kids) {
        const grandkids = byParent.get(k.id) || []
        out.push({ folder: k, depth, hasKids: grandkids.length > 0 })
        if (expanded.has(k.id)) visit(k.id, depth + 1)
      }
    }
    visit(null, 0)
    return out
  }, [visible, expanded])

  async function doMove() {
    setBusy(true)
    try {
      const r = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: picked })
      })
      const j = await r.json().catch(() => ({ code: 0 }))
      if (j?.code !== 200) throw new Error(j?.message || '移动失败')
      toast('已移动到新目录', 'success')
      onMoved()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      icon="moveTo"
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded border border-wps-border px-3 py-1.5 text-sm text-wps-text hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={doMove}
            disabled={busy || loading || !!err || picked === currentParentId}
            className="rounded bg-wps-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-wps-brandDark disabled:opacity-50"
          >
            {busy ? '移动中…' : '确认移动'}
          </button>
        </>
      }
    >
      <div className="text-xs text-wps-subtext">
        当前位置：<b className="text-wps-text">{currentParentId ? '某个文件夹' : '我的云盘根目录'}</b>
      </div>
      <div className="mt-3 max-h-80 overflow-auto rounded border border-wps-border bg-white">
        {loading && <div className="px-3 py-4 text-xs text-wps-subtext">加载目录…</div>}
        {err && <div className="px-3 py-4 text-xs text-red-500">{err}</div>}
        {!loading && !err && (
          <>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className={
                'flex w-full items-center gap-2 border-b border-wps-border px-3 py-2 text-left text-sm ' +
                (picked === null ? 'bg-red-50 text-wps-brand' : 'hover:bg-slate-50 text-wps-text')
              }
            >
              <Icon name="home" size={14} />
              <span className="flex-1">我的云盘（根目录）</span>
              {currentParentId === null && <span className="text-[10px] text-wps-subtext">当前</span>}
            </button>
            {rows.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-wps-subtext">还没有其他文件夹可以选</div>
            )}
            {rows.map(({ folder, depth, hasKids }) => {
              const isCurrent = folder.id === currentParentId
              return (
                <div
                  key={folder.id}
                  className={
                    'flex items-center gap-1 border-b border-slate-50 last:border-b-0 ' +
                    (picked === folder.id ? 'bg-red-50' : 'hover:bg-slate-50')
                  }
                  style={{ paddingLeft: 8 + depth * 16 }}
                >
                  {hasKids ? (
                    <button
                      type="button"
                      onClick={() => toggle(folder.id)}
                      className="rounded p-1 text-wps-subtext hover:bg-slate-100"
                      aria-label={expanded.has(folder.id) ? '折叠' : '展开'}
                    >
                      <Icon
                        name={expanded.has(folder.id) ? 'chevron' : 'chevronRight'}
                        size={12}
                      />
                    </button>
                  ) : (
                    <span className="w-[22px]" />
                  )}
                  <button
                    type="button"
                    onClick={() => setPicked(folder.id)}
                    className="flex flex-1 items-center gap-2 py-2 pr-3 text-left text-sm text-wps-text"
                  >
                    <Icon name="folder" size={14} className="text-amber-600" />
                    <span className="truncate">{folder.name}</span>
                    {isCurrent && <span className="text-[10px] text-wps-subtext">当前</span>}
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
    </Modal>
  )
}
