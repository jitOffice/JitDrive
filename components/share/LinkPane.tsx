'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActorUser, FileRecord, FolderRecord } from '@/lib/types'
import Icon from '../Icon'
import { useUI } from '../ui/UIProvider'
import QrCard from './QrCard'
import UserPicker from './UserPicker'
import { bannerTextFor } from '@/lib/smart/sensitive-core'

/** v0.5.2 · Target discriminator. `file` and `folder` links share one UI but
 *  hit different owner endpoints (`/api/files/[id]/share-links` vs
 *  `/api/folders/[id]/share-links`). Everything below reads `target.id` via
 *  the `targetId` / `targetKind` derived vars. */
export type ShareTarget =
  | { kind: 'file'; file: FileRecord }
  | { kind: 'folder'; folder: FolderRecord }

interface Props {
  target: ShareTarget
  actorId: string
}

type ShareLinkView = {
  code: string
  fileId: string | null
  folderId?: string | null
  url: string
  hasPassword: boolean
  expiresAt: number | null
  maxViews: number | null
  viewCount: number
  allowDownload: boolean
  revokedAt: number | null
  createdAt: number
  lastViewedAt: number | null
  /** v0.5.1 invite-only allowlist. Non-empty ⇒ visitor must be logged in and
   *  on this list (or be the file/folder owner) before /s/[code] unlocks. */
  invitees?: { id: string; name: string; color: string }[]
}

/** One of three preset cards. All live as of v0.5.1:
 *  - `public`      : open to anyone holding the link (v0.5)
 *  - `encrypted`   : link + shared password (v0.5)
 *  - `invite-only` : login + ShareLinkUser allowlist (v0.5.1) */
type Preset = 'public' | 'encrypted' | 'invite-only'

type Expires = 'never' | '1d' | '3d' | '7d' | '30d'
type MaxViews = 'unlimited' | '1' | '10' | '100' | 'custom'

// Small helper so both "password reveal" and clipboard copy stay in sync with
// the code that minted them — we keep the plaintext in local state only,
// never persisted to the server (the response has no passwordHash either).
function randomPw(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  // base32-ish alphabet, no lookalikes
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (const b of bytes) out += ALPHA[b % ALPHA.length]
  return out
}

function absUrl(url: string): string {
  if (typeof window === 'undefined') return url
  return new URL(url, window.location.origin).href
}

function fmtDate(ms: number | null): string {
  if (!ms) return '不过期'
  const d = new Date(ms)
  const diff = ms - Date.now()
  if (diff <= 0) return '已过期'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days >= 1) return `${days} 天 ${hours} 小时后`
  if (hours >= 1) return `${hours} 小时后`
  return `${Math.max(1, Math.floor(diff / 60000))} 分钟后`
}

function fmtCreated(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function LinkPane({ target, actorId }: Props) {
  const { toast, confirm } = useUI()
  const [links, setLinks] = useState<ShareLinkView[]>([])
  const [loading, setLoading] = useState(false)

  const targetId = target.kind === 'file' ? target.file.id : target.folder.id
  const targetKind = target.kind
  const apiBase = targetKind === 'file' ? `/api/files/${targetId}/share-links` : `/api/folders/${targetId}/share-links`

  // Preset + advanced state.
  const [preset, setPreset] = useState<Preset>('public')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [password, setPassword] = useState<string>('')
  const [revealPassword, setRevealPassword] = useState(false)
  const [inviteeUsers, setInviteeUsers] = useState<ActorUser[]>([])
  const [expires, setExpires] = useState<Expires>('never')
  const [maxViews, setMaxViews] = useState<MaxViews>('unlimited')
  const [customViews, setCustomViews] = useState<string>('')
  const [allowDownload, setAllowDownload] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(apiBase)
      const j = await r.json()
      if (j?.code === 200) setLinks(j.data.items || [])
      else if (j?.message) toast(j.message, 'error')
    } catch (e) {
      toast((e as Error).message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }, [apiBase, toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Preset changes drive sensible defaults so the panel never carries
  // contradictory values: invite-only replaces the password gate, and the
  // invitee list is meaningless for public/encrypted links.
  function pickPreset(p: Preset) {
    setPreset(p)
    if (p === 'invite-only') {
      setPassword('')
    } else {
      setInviteeUsers([])
      if (p === 'encrypted' && !password) setPassword(randomPw())
      if (p === 'public') setPassword('')
    }
  }

  const expiresAt = useMemo(() => {
    const day = 86400000
    const map: Record<Expires, number | null> = {
      never: null,
      '1d': day,
      '3d': day * 3,
      '7d': day * 7,
      '30d': day * 30
    }
    const delta = map[expires]
    return delta == null ? null : Date.now() + delta
  }, [expires])

  const maxViewsValue = useMemo(() => {
    if (maxViews === 'unlimited') return null
    if (maxViews === 'custom') {
      const n = parseInt(customViews, 10)
      return Number.isFinite(n) && n >= 1 && n <= 10000 ? n : null
    }
    return parseInt(maxViews, 10)
  }, [maxViews, customViews])

  async function createLink() {
    if (preset === 'encrypted' && password.length < 4) {
      toast('加密分享需要至少 4 位密码', 'error')
      return
    }
    if (preset === 'invite-only' && inviteeUsers.length === 0) {
      toast('请至少选择一位可见用户', 'error')
      return
    }
    if (maxViews === 'custom' && maxViewsValue == null) {
      toast('请输入 1–10000 的浏览次数', 'error')
      return
    }
    setBusy(true)
    try {
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: preset === 'encrypted' ? password : null,
          expiresAt,
          maxViews: maxViewsValue,
          allowDownload,
          inviteeIds: preset === 'invite-only' ? inviteeUsers.map(u => u.id) : []
        })
      })
      const j = await r.json()
      if (j?.code === 200) {
        toast('分享链接已生成', 'success')
        setLinks(prev => [j.data, ...prev])
        setShowAdvanced(false)
        if (preset === 'invite-only') setInviteeUsers([])
      } else {
        toast(j?.message || '生成失败', 'error')
      }
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string, hint = '已复制') {
    try {
      await navigator.clipboard.writeText(text)
      toast(hint, 'success')
    } catch {
      toast('复制失败，请手动选中', 'error')
    }
  }

  async function revoke(link: ShareLinkView) {
    const ok = await confirm({
      title: '撤销这条分享链接？',
      message: (
        <div>
          短码 <b>{link.code}</b> 立即失效，任何人访问都会看到「已撤销」页面。
          {link.viewCount > 0 && <div className="mt-1 text-xs text-wps-subtext">已经被浏览 {link.viewCount} 次。</div>}
        </div>
      ),
      confirmText: '撤销',
      tone: 'danger'
    })
    if (!ok) return
    try {
      const r = await fetch(`/api/share-links/${link.code}`, { method: 'DELETE' })
      const j = await r.json()
      if (j?.code === 200) {
        toast('已撤销', 'success')
        setLinks(prev => prev.filter(x => x.code !== link.code))
      } else toast(j?.message || '撤销失败', 'error')
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    }
  }

  /** v0.5.3 · S5 replace an invite-only link's allowlist. Emptying the roster
   *  silently de-privileges the link back to public / password, so we warn
   *  first. The PATCH response carries the fresh link (with updated invitees)
   *  so we swap the row in place without a full refetch. */
  async function saveInvitees(link: ShareLinkView, users: ActorUser[]) {
    const ids = users.map(u => u.id)
    const hadList = (link.invitees?.length || 0) > 0
    if (hadList && ids.length === 0) {
      const ok = await confirm({
        title: '清空可见名单？',
        message: '清空后这条链接将不再是「仅指定用户」，任何拿到链接的人都能访问（若设了密码则仍需密码）。确定清空吗？',
        confirmText: '清空',
        tone: 'danger'
      })
      if (!ok) return
    }
    try {
      const r = await fetch(`/api/share-links/${link.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteeIds: ids })
      })
      const j = await r.json()
      if (j?.code === 200) {
        toast('可见名单已更新', 'success')
        setLinks(prev => prev.map(x => (x.code === link.code ? j.data : x)))
      } else toast(j?.message || '更新失败', 'error')
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    }
  }

  // v0.7 · P0 · 敏感文件分享预警。bannerTextFor(null | 'low') = null 直接不渲染；
  // 高危红色 / 中危 amber。文件夹级不扫（folder 内多文件混合，预警粒度不对），
  // 只在 file 分享时展示。用户仍可继续分享 — AI 只提示不动手。
  const sensitivityLabel =
    target.kind === 'file' ? (target.file.sensitivity ?? null) : null
  const sensitivityText = bannerTextFor(sensitivityLabel)

  return (
    <div className="space-y-4">
      {sensitivityText && (
        <div
          className={
            'flex items-start gap-2 rounded-md border p-2.5 text-xs ' +
            (sensitivityLabel === 'high'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-200 bg-amber-50 text-amber-800')
          }
          role="alert"
        >
          <Icon name="shield" size={14} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">
              {sensitivityLabel === 'high' ? '敏感文件分享预警' : '半敏感文件建议'}
            </div>
            <div className="mt-0.5 opacity-90">{sensitivityText}</div>
          </div>
        </div>
      )}

      {/* Preset cards */}
      <div className="grid grid-cols-3 gap-2">
        <PresetCard
          active={preset === 'public'}
          icon="globe"
          title="公开"
          desc="任何人拿到链接可看"
          tone="brand"
          onClick={() => pickPreset('public')}
        />
        <PresetCard
          active={preset === 'encrypted'}
          icon="lock"
          title="加密"
          desc="链接 + 密码"
          tone="brand"
          onClick={() => pickPreset('encrypted')}
        />
        <PresetCard
          active={preset === 'invite-only'}
          icon="users"
          title="仅指定用户"
          desc="登录 + 白名单"
          tone="brand"
          onClick={() => pickPreset('invite-only')}
        />
      </div>

      {/* Invite-only allowlist picker */}
      {preset === 'invite-only' && (
        <div className="rounded-md border border-wps-border bg-slate-50 p-3">
          <label className="mb-1 block text-[11px] font-medium text-wps-subtext">可见用户</label>
          <UserPicker
            value={inviteeUsers}
            onChange={setInviteeUsers}
            excludeIds={[actorId]}
            placeholder="搜索同事姓名或邮箱并添加…"
          />
          <div className="mt-1 text-[11px] text-wps-subtext">
            名单里的人需要<b>登录 JitDrive</b> 后打开此链接才能预览；其他人只会看到「无访问权限」。链接本身仍可自由转发。
          </div>
        </div>
      )}

      {/* Password field (encrypted only) */}
      {preset === 'encrypted' && (
        <div className="rounded-md border border-wps-border bg-slate-50 p-3">
          <label className="mb-1 block text-[11px] font-medium text-wps-subtext">访问密码</label>
          <div className="flex items-center gap-2">
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type={revealPassword ? 'text' : 'password'}
              placeholder="至少 4 位"
              className="flex-1 rounded border border-wps-border bg-white px-2 py-1 text-sm outline-none focus:border-wps-brand"
            />
            <button
              type="button"
              onClick={() => setRevealPassword(v => !v)}
              className="rounded border border-wps-border bg-white p-1.5 text-wps-subtext hover:bg-slate-100"
              title={revealPassword ? '隐藏密码' : '显示密码'}
            >
              <Icon name={revealPassword ? 'eye' : 'lock'} size={14} />
            </button>
            <button
              type="button"
              onClick={() => setPassword(randomPw())}
              className="rounded border border-wps-border bg-white px-2 py-1 text-xs text-wps-text hover:bg-slate-100"
            >
              随机
            </button>
          </div>
          <div className="mt-1 text-[11px] text-wps-subtext">密码通过另一个渠道（微信/邮件）发给对方，不要跟链接一起发。</div>
        </div>
      )}

      {/* Advanced toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1 text-xs text-wps-subtext hover:text-wps-text"
        >
          <Icon name="chevron" size={12} className={'transition ' + (showAdvanced ? 'rotate-180' : '')} />
          {showAdvanced ? '收起' : '高级选项'}（有效期 / 浏览次数 / 是否可下载）
        </button>
        {showAdvanced && (
          <div className="mt-2 space-y-3 rounded-md border border-wps-border bg-slate-50 p-3">
            <FieldRow label="有效期">
              <Chips
                value={expires}
                onChange={v => setExpires(v as Expires)}
                options={[
                  ['never', '永久'],
                  ['1d', '1 天'],
                  ['3d', '3 天'],
                  ['7d', '7 天'],
                  ['30d', '30 天']
                ]}
              />
            </FieldRow>
            <FieldRow label="浏览次数">
              <Chips
                value={maxViews}
                onChange={v => setMaxViews(v as MaxViews)}
                options={[
                  ['unlimited', '不限'],
                  ['1', '1 次'],
                  ['10', '10 次'],
                  ['100', '100 次'],
                  ['custom', '自定义']
                ]}
              />
              {maxViews === 'custom' && (
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={customViews}
                  onChange={e => setCustomViews(e.target.value)}
                  placeholder="1–10000"
                  className="ml-2 w-24 rounded border border-wps-border bg-white px-2 py-1 text-xs outline-none focus:border-wps-brand"
                />
              )}
            </FieldRow>
            <FieldRow label="允许下载">
              <label className="inline-flex items-center gap-2 text-xs text-wps-text">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={e => setAllowDownload(e.target.checked)}
                  className="h-3.5 w-3.5 accent-wps-brand"
                />
                {allowDownload ? '访问者可下载原件' : '访问者仅可预览'}
              </label>
            </FieldRow>
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="flex justify-end">
        <button
          onClick={createLink}
          disabled={busy}
          className="flex items-center gap-1 rounded-md bg-wps-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-wps-brandDark disabled:opacity-50"
        >
          <Icon name="link" size={14} />
          {busy ? '生成中…' : '生成分享链接'}
        </button>
      </div>

      {/* Existing links */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium text-wps-subtext">
            已生成的分享（{links.length}）
            {loading && ' · 刷新中'}
          </div>
          <button
            onClick={refresh}
            className="text-[11px] text-wps-subtext hover:text-wps-text"
            title="刷新列表"
          >
            <Icon name="restore" size={12} />
          </button>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {links.length === 0 && (
            <div className="rounded border border-dashed border-wps-border p-6 text-center text-xs text-wps-subtext">
              还没有分享链接，选一个预设生成一条吧。
            </div>
          )}
          {links.map(l => (
            <LinkRow
              key={l.code}
              link={l}
              actorId={actorId}
              onCopy={copy}
              onRevoke={() => revoke(l)}
              onSaveInvitees={users => saveInvitees(l, users)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- sub-components ----------

function PresetCard(props: {
  active: boolean
  disabled?: boolean
  icon: 'globe' | 'lock' | 'users'
  title: string
  desc: string
  tone: 'brand' | 'muted'
  onClick: () => void
}) {
  const { active, disabled, icon, title, desc, tone, onClick } = props
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition ' +
        (active
          ? 'border-wps-brand bg-red-50 ring-2 ring-red-100'
          : disabled
          ? 'cursor-not-allowed border-wps-border bg-slate-50 opacity-60'
          : 'border-wps-border bg-white hover:border-slate-300 hover:bg-slate-50')
      }
    >
      <span
        className={
          'flex items-center gap-1 text-sm font-medium ' +
          (tone === 'muted' ? 'text-wps-subtext' : active ? 'text-wps-brand' : 'text-wps-text')
        }
      >
        <Icon name={icon} size={14} />
        {title}
      </span>
      <span className="text-[11px] text-wps-subtext">{desc}</span>
    </button>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-16 shrink-0 pt-1 text-[11px] font-medium text-wps-subtext">{label}</div>
      <div className="flex flex-1 flex-wrap items-center gap-1">{children}</div>
    </div>
  )
}

function Chips({
  value,
  onChange,
  options
}: {
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <>
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={
            'rounded-full border px-2.5 py-0.5 text-xs transition ' +
            (value === k
              ? 'border-wps-brand bg-wps-brand text-white'
              : 'border-wps-border bg-white text-wps-text hover:border-slate-300')
          }
        >
          {label}
        </button>
      ))}
    </>
  )
}

function LinkRow({
  link,
  actorId,
  onCopy,
  onRevoke,
  onSaveInvitees
}: {
  link: ShareLinkView
  actorId: string
  onCopy: (t: string, hint?: string) => void
  onRevoke: () => void
  onSaveInvitees: (users: ActorUser[]) => Promise<void> | void
}) {
  const absolute = useMemo(() => absUrl(link.url), [link.url])
  const [expanded, setExpanded] = useState(false)
  const isInviteOnly = (link.invitees?.length || 0) > 0
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ActorUser[]>([])
  const [saving, setSaving] = useState(false)

  function startEdit() {
    setDraft((link.invitees || []).map(u => ({ id: u.id, name: u.name, color: u.color })))
    setEditing(true)
  }
  async function save() {
    setSaving(true)
    try {
      await onSaveInvitees(draft)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const summaryBits: React.ReactNode[] = []
  if (link.invitees && link.invitees.length > 0) {
    const names = link.invitees.map(u => u.name).join('、')
    summaryBits.push(
      <span key="inv" className="rounded bg-slate-100 px-1.5 py-0.5" title={names}>
        👥 {link.invitees.length} 人可见
      </span>
    )
  } else if (link.hasPassword) {
    summaryBits.push(<span key="pw" className="rounded bg-slate-100 px-1.5 py-0.5">🔒 密码</span>)
  }
  if (link.expiresAt) summaryBits.push(<span key="exp" className="rounded bg-slate-100 px-1.5 py-0.5">{fmtDate(link.expiresAt)}</span>)
  if (link.maxViews != null) summaryBits.push(<span key="mv" className="rounded bg-slate-100 px-1.5 py-0.5">{`${link.viewCount}/${link.maxViews} 次`}</span>)
  else summaryBits.push(<span key="mv0" className="rounded bg-slate-100 px-1.5 py-0.5">{`已浏览 ${link.viewCount} 次`}</span>)
  if (!link.allowDownload) summaryBits.push(<span key="nd" className="rounded bg-slate-100 px-1.5 py-0.5">禁下载</span>)

  return (
    <div className="rounded-md border border-wps-border bg-white">
      <div className="flex items-start gap-3 p-3">
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <QrCard value={absolute} size={expanded ? 140 : 84} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-wps-text" title={absolute}>
              {absolute}
            </code>
            <button
              onClick={() => onCopy(absolute, '链接已复制')}
              className="shrink-0 rounded border border-wps-border px-1.5 py-0.5 text-[11px] text-wps-text hover:bg-slate-50"
            >
              复制
            </button>
            <a
              href={absolute}
              target="_blank"
              rel="noopener noreferrer noindex"
              className="shrink-0 rounded border border-wps-border px-1.5 py-0.5 text-[11px] text-wps-text hover:bg-slate-50"
            >
              预览
            </a>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-wps-subtext">
            {summaryBits}
            <span>· 创建于 {fmtCreated(link.createdAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-[11px]">
            <button
              onClick={() => setExpanded(v => !v)}
              className="text-wps-subtext hover:text-wps-text"
            >
              {expanded ? '收起二维码' : '放大二维码'}
            </button>
            {isInviteOnly && (
              <button onClick={startEdit} className="text-wps-brand hover:underline">
                改名单
              </button>
            )}
            <button onClick={onRevoke} className="text-wps-brand hover:underline">
              撤销
            </button>
          </div>

          {/* v0.5.3 · S5 inline allowlist editor (invite-only links only). */}
          {editing && isInviteOnly && (
            <div className="mt-2 rounded-md border border-wps-border bg-slate-50 p-3">
              <div className="mb-1 text-[11px] font-medium text-wps-subtext">可见用户</div>
              <UserPicker value={draft} onChange={setDraft} excludeIds={[actorId]} placeholder="搜索同事姓名或邮箱并添加…" autoFocus />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded border border-wps-border bg-white px-2.5 py-1 text-xs text-wps-text hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded bg-wps-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-wps-brandDark disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存名单'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
