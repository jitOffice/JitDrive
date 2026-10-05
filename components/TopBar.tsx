'use client'

// The authenticated app's top bar. Provides the drive actions (新建▾ / 上传),
// a real global search over titles the actor can access, and the UserMenu.
//
// v0.4 changes:
//   • "新建" is a split button with a dropdown (新建 Word / 新建文件夹).
//   • "上传 Word" renamed to "上传文件" and accepts the full whitelist
//     (see lib/filetypes.uploadAcceptAttr).
//   • Both actions honour `?folderId=` on the drive page so new content lands
//     in the folder the user is currently viewing.
//
// Product note: on the editor / preview pages (/files/[id]) the search box is
// intentionally hidden. Search is a *drive-level* navigation affordance.
import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Icon from './Icon'
import UserMenu, { type UserLite } from './UserMenu'
import { uploadAcceptAttr } from '@/lib/filetypes'
import { DRIVE, RECENT, SHARED, TRASH, editorRoute } from '@/lib/routes'

const TITLES: { match: (p: string) => boolean; title: string }[] = [
  { match: p => p === DRIVE, title: '我的云盘' },
  { match: p => p.startsWith(RECENT), title: '最近打开' },
  { match: p => p.startsWith(SHARED), title: '共享给我' },
  { match: p => p.startsWith(TRASH), title: '回收站' },
  { match: p => p.startsWith(`${DRIVE}/files/`), title: '文档' }
]

interface Hit {
  id: string
  name: string
  ownerName: string
  isOwner: boolean
  updatedAt: number
}

const ACCEPT = uploadAcceptAttr()

export default function TopBar({ user }: { user: UserLite }) {
  const router = useRouter()
  const pathname = usePathname() || DRIVE
  const searchParams = useSearchParams()
  const title = (TITLES.find(t => t.match(pathname)) || TITLES[0]).title
  const isDriveRootView = pathname === DRIVE
  const isEditor = pathname.startsWith(`${DRIVE}/files/`)
  const currentFolderId = isDriveRootView ? searchParams?.get('folderId') || null : null

  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const newMenuRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [openResults, setOpenResults] = useState(false)
  const [openNew, setOpenNew] = useState(false)

  // Reset the search box when navigating to/from the editor page.
  useEffect(() => {
    setQ('')
    setHits([])
    setOpenResults(false)
    setOpenNew(false)
  }, [pathname])

  // Close dropdowns on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpenResults(false)
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setOpenNew(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function runSearch(term: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const t = term.trim()
    if (!t) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(t)}`, { cache: 'no-store' })
        const j = await r.json().catch(() => ({ code: 0 }))
        setHits(j?.code === 200 ? (j.data as Hit[]) : [])
        setOpenResults(true)
      } finally {
        setSearching(false)
      }
    }, 220)
  }

  function go(hit: Hit) {
    setOpenResults(false)
    setQ('')
    setHits([])
    router.push(editorRoute(hit.id))
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setBusy(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const qs = currentFolderId ? `?folderId=${encodeURIComponent(currentFolderId)}` : ''
      const r = await fetch(`/api/files${qs}`, { method: 'POST', body: fd })
      const j = await r.json()
      if (j.code !== 200) {
        setMsg(j.message || '上传失败')
      } else {
        // Refresh the drive's RSC cache before pushing so browser-back from
        // the file view shows the folder listing with the new file present.
        if (isDriveRootView) {
          router.refresh()
          await new Promise<void>(resolve => setTimeout(resolve, 60))
        }
        router.push(editorRoute(j.data.id))
      }
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function newBlank() {
    setBusy(true)
    setMsg(null)
    try {
      const body: Record<string, unknown> = {}
      if (currentFolderId) body.folderId = currentFolderId
      const r = await fetch('/api/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const j = await r.json()
      if (j.code !== 200) setMsg(j.message || '新建失败')
      else router.push(editorRoute(j.data.id, 'edit'))
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
      setOpenNew(false)
    }
  }

  async function newFolder() {
    const name = window.prompt('新文件夹名称', '未命名文件夹')
    if (name == null) return
    const trimmed = name.trim()
    if (!trimmed) {
      setMsg('文件夹名称不能为空')
      setOpenNew(false)
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const body: Record<string, unknown> = { name: trimmed }
      if (currentFolderId) body.parentId = currentFolderId
      const r = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const j = await r.json()
      if (j.code !== 200) setMsg(j.message || '新建文件夹失败')
      else router.refresh()
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
      setOpenNew(false)
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-wps-border bg-white px-4">
      <div className="text-sm font-medium text-wps-text">{title}</div>
      {!isEditor && (
        <>
          <div className="mx-2 h-4 w-px bg-wps-border" />
          <div className="relative flex-1 max-w-md" ref={searchRef}>
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-wps-subtext">
              <Icon name="search" size={15} />
            </span>
            <input
              value={q}
              onChange={e => {
                setQ(e.target.value)
                runSearch(e.target.value)
              }}
              onFocus={() => {
                if (hits.length) setOpenResults(true)
              }}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpenResults(false)
                if (e.key === 'Enter' && hits.length) go(hits[0])
              }}
              placeholder="搜索文档标题"
              className="w-full rounded-md border border-wps-border bg-wps-side py-1.5 pl-8 pr-3 text-sm outline-none focus:border-wps-brand focus:bg-white"
            />
            {openResults && (
              <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-80 overflow-auto rounded-md border border-wps-border bg-white py-1 shadow-lg">
                {searching && <div className="px-3 py-2 text-xs text-wps-subtext">搜索中…</div>}
                {!searching && q.trim() && hits.length === 0 && (
                  <div className="px-3 py-2 text-xs text-wps-subtext">未找到匹配「{q.trim()}」的文档</div>
                )}
                {hits.map(h => (
                  <button
                    key={h.id}
                    onClick={() => go(h)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <Icon name="file" size={14} className="shrink-0 text-wps-subtext" />
                    <span className="flex-1 truncate text-wps-text" title={h.name}>
                      {h.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-wps-subtext">
                      {h.isOwner ? '我的' : `${h.ownerName} 共享`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={newMenuRef}>
            <button
              type="button"
              onClick={() => setOpenNew(v => !v)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-wps-border px-3 py-1.5 text-sm text-wps-text hover:bg-slate-50 disabled:opacity-50"
            >
              <Icon name="plus" size={15} />
              新建
              <Icon name="chevron" size={13} className="opacity-70" />
            </button>
            {openNew && (
              <div className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-md border border-wps-border bg-white py-1 shadow-lg">
                <button
                  onClick={newBlank}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-wps-text hover:bg-slate-50 disabled:opacity-50"
                >
                  <Icon name="file" size={14} className="text-wps-brand" />
                  新建 Word 文档
                </button>
                <button
                  onClick={newFolder}
                  disabled={busy}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-wps-text hover:bg-slate-50 disabled:opacity-50"
                >
                  <Icon name="folderPlus" size={14} className="text-amber-600" />
                  新建文件夹
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-wps-brand px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-wps-brandDark disabled:opacity-50"
          >
            <Icon name="upload" size={15} />
            {busy ? '处理中…' : '上传文件'}
          </button>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={onPick} />
          {msg && <span className="ml-2 text-xs text-red-500">{msg}</span>}
        </>
      )}
      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  )
}
