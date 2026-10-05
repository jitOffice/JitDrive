'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActorUser } from '@/lib/types'
import Icon from '../Icon'

interface Props {
  /** Currently selected users (order preserved, rendered as chips). */
  value: ActorUser[]
  onChange: (next: ActorUser[]) => void
  /** ids that must never be offered (e.g. the owner themself). */
  excludeIds?: string[]
  placeholder?: string
  /** Cap selectable users. 0/undefined = unlimited. */
  max?: number
  autoFocus?: boolean
}

const PAGE = 20

/** Searchable multi-select user picker shared by「邀请协作」and「仅指定用户」.
 *
 *  Previously the invite tab rendered a hardcoded short list with no way to
 *  find a specific colleague. This version queries `/api/users?q=` (debounced
 *  220ms) so any registered account can be found by name or email, and keeps
 *  selections as removable chips so the state is legible at a glance.
 *
 *  Fully client-side; the only network call is the debounced search. Fetches
 *  are guarded by an incrementing seq so a slow earlier request can't clobber
 *  a faster later one (classic race). */
export default function UserPicker({ value, onChange, excludeIds, placeholder = '搜索用户名或邮箱…', max, autoFocus }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ActorUser[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const seq = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const excludeSet = useMemo(() => new Set([...(excludeIds || []), ...value.map(v => v.id)]), [excludeIds, value])
  const atMax = max != null && max > 0 && value.length >= max

  // Debounced search. Empty query clears results (initial paint shows nothing
  // until focus, then we run one query to seed suggestions).
  useEffect(() => {
    if (!open) return
    const kw = query.trim()
    // Seed suggestions on focus with no keyword; skip network when closed.
    const id = ++seq.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams()
        if (kw) qs.set('q', kw)
        qs.set('limit', String(PAGE))
        const r = await fetch(`/api/users?${qs.toString()}`)
        const j = await r.json()
        if (id !== seq.current) return
        const list: ActorUser[] = j?.code === 200 ? j.data || [] : []
        setResults(list.filter(u => !excludeSet.has(u.id)))
        setActive(0)
      } catch {
        if (id === seq.current) setResults([])
      } finally {
        if (id === seq.current) setLoading(false)
      }
    }, kw ? 220 : 0)
    return () => clearTimeout(t)
  }, [query, open, excludeSet])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function add(u: ActorUser) {
    if (atMax || value.some(v => v.id === u.id)) return
    onChange([...value, u])
    setQuery('')
  }
  function remove(id: string) {
    onChange(value.filter(v => v.id !== id))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive(i => Math.min(i + 1, Math.max(0, results.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault()
        add(results[active])
      }
    } else if (e.key === 'Backspace' && !query && value.length) {
      remove(value[value.length - 1].id)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      {/* Selected chips */}
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map(u => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-wps-border bg-white py-0.5 pl-1 pr-1 text-xs text-wps-text"
            >
              <span
                className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-medium text-white"
                style={{ background: u.color }}
              >
                {u.name.slice(0, 1)}
              </span>
              <span className="max-w-[10rem] truncate" title={u.email || u.name}>{u.name}</span>
              <button
                type="button"
                onClick={() => remove(u.id)}
                className="grid h-4 w-4 place-items-center rounded-full text-wps-subtext hover:bg-slate-100 hover:text-wps-brand"
                title="移除"
              >
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="flex items-center gap-2 rounded-md border border-wps-border bg-white px-2 py-1.5 focus-within:border-wps-brand">
        <Icon name="search" size={14} className="text-wps-subtext" />
        <input
          autoFocus={autoFocus}
          value={query}
          disabled={atMax}
          onChange={e => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={atMax ? `已达上限 ${max} 人` : placeholder}
          className="flex-1 bg-transparent text-sm text-wps-text outline-none disabled:cursor-not-allowed"
        />
      </div>

      {/* Dropdown results */}
      {open && !atMax && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-wps-border bg-white py-1 shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-wps-subtext">搜索中…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-wps-subtext">
              {query.trim() ? '没有匹配的用户，换个关键词试试' : '输入姓名或邮箱搜索同事'}
            </div>
          )}
          {!loading &&
            results.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => add(u)}
                className={
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ' +
                  (i === active ? 'bg-red-50' : 'hover:bg-slate-50')
                }
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium text-white"
                  style={{ background: u.color }}
                >
                  {u.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-wps-text">{u.name}</span>
                  {u.email && <span className="block truncate text-[11px] text-wps-subtext">{u.email}</span>}
                </span>
                <Icon name="plus" size={14} className="shrink-0 text-wps-subtext" />
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
