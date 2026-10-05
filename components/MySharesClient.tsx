'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { MyShareLink } from '@/lib/share'
import Icon from './Icon'
import { useUI } from './ui/UIProvider'

/** v0.5.3 · S3 owner share dashboard. Lists every active share link the user
 *  owns across files AND folders, with granular view counts (S2) and per-row /
 *  bulk revoke. Data is server-rendered on first paint, then managed client-side
 *  for the revoke actions (each hits the same owner APIs the card menus use, so
 *  ownership is re-checked server-side on every mutation). */
export default function MySharesClient({ initial }: { initial: MyShareLink[] }) {
  const { toast, confirm } = useUI()
  const router = useRouter()
  const [items, setItems] = useState<MyShareLink[]>(initial)
  const [busy, setBusy] = useState(false)

  const activeCount = items.length
  const totalViews = useMemo(() => items.reduce((s, l) => s + l.viewTotal, 0), [items])

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/share-links?mine=1')
      const j = await r.json()
      if (j?.code === 200) setItems(j.data.items || [])
      else toast(j?.message || '刷新失败', 'error')
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusy(false)
    }
  }, [toast])

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast('链接已复制', 'success')
    } catch {
      toast('复制失败，请手动选中', 'error')
    }
  }

  async function revokeOne(link: MyShareLink) {
    const ok = await confirm({
      title: '撤销这条分享链接？',
      message: (
        <div>
          <b>{link.targetName}</b> 的短码 <b>{link.code}</b> 立即失效，任何人访问都会看到「已撤销」。
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
        setItems(prev => prev.filter(x => x.code !== link.code))
      } else toast(j?.message || '撤销失败', 'error')
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    }
  }

  async function revokeAll() {
    if (items.length === 0) return
    const ok = await confirm({
      title: '撤销全部分享链接？',
      message: (
        <div>
          将立即失效你名下 <b>{items.length}</b> 条活跃分享链接，所有外部访问者都会看到「已撤销」。此操作不可恢复（需重新生成）。
        </div>
      ),
      confirmText: '全部撤销',
      tone: 'danger'
    })
    if (!ok) return
    setBusy(true)
    try {
      const r = await fetch('/api/share-links/bulk-revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // no codes → server revokes all owned
      })
      const j = await r.json()
      if (j?.code === 200) {
        toast(`已撤销 ${j.data.revoked} 条链接`, 'success')
        setItems([])
        router.refresh()
      } else toast(j?.message || '撤销失败', 'error')
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-wps-text">我的分享</h1>
          <p className="mt-1 text-xs text-wps-subtext">
            跨文件与目录的活跃分享链接 · 共 {activeCount} 条 · 累计被浏览 {totalViews} 次
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={busy}
            className="flex items-center gap-1 rounded-md border border-wps-border bg-white px-2.5 py-1.5 text-xs text-wps-text hover:bg-slate-50 disabled:opacity-50"
          >
            <Icon name="restore" size={13} />
            刷新
          </button>
          <button
            onClick={revokeAll}
            disabled={busy || items.length === 0}
            className="flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-wps-brand hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="close" size={13} />
            撤销全部
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-wps-border bg-white py-16 text-center text-sm text-wps-subtext">
          <Icon name="share" size={28} className="opacity-40" />
          <span>还没有活跃的分享链接。到「我的云盘」里点文件的 ⋯ → 分享即可创建。</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-wps-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-wps-side text-[11px] uppercase tracking-wide text-wps-subtext">
              <tr>
                <th className="px-4 py-2.5 font-medium">名称</th>
                <th className="px-4 py-2.5 font-medium">模式</th>
                <th className="px-4 py-2.5 font-medium">浏览</th>
                <th className="px-4 py-2.5 font-medium">创建</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(l => (
                <ShareRow key={l.code} link={l} onCopy={copy} onRevoke={() => revokeOne(l)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function absUrl(url: string): string {
  if (typeof window === 'undefined') return url
  return new URL(url, window.location.origin).href
}

function fmtDay(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function modeBits(l: MyShareLink): { key: string; label: string; tone: string }[] {
  const bits: { key: string; label: string; tone: string }[] = []
  if (l.invitees && l.invitees.length > 0) bits.push({ key: 'inv', label: `白名单 ${l.invitees.length} 人`, tone: 'bg-blue-50 text-blue-600' })
  else if (l.hasPassword) bits.push({ key: 'pw', label: '密码', tone: 'bg-amber-50 text-amber-600' })
  else bits.push({ key: 'pub', label: '公开', tone: 'bg-slate-100 text-wps-subtext' })
  if (l.expiresAt) {
    const expired = l.expiresAt < Date.now()
    bits.push({ key: 'exp', label: expired ? '已过期' : '有期限', tone: expired ? 'bg-red-50 text-red-500' : 'bg-slate-100 text-wps-subtext' })
  }
  if (l.maxViews != null) bits.push({ key: 'mv', label: `上限 ${l.maxViews}`, tone: 'bg-slate-100 text-wps-subtext' })
  if (!l.allowDownload) bits.push({ key: 'nd', label: '禁下载', tone: 'bg-slate-100 text-wps-subtext' })
  return bits
}

function ShareRow({
  link,
  onCopy,
  onRevoke
}: {
  link: MyShareLink
  onCopy: (t: string) => void
  onRevoke: () => void
}) {
  const absolute = useMemo(() => absUrl(link.url), [link.url])
  return (
    <tr className="border-t border-wps-border/70">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon name={link.targetKind === 'folder' ? 'folder' : 'file'} size={15} className="shrink-0 text-wps-subtext" />
          <div className="min-w-0">
            <div className="truncate font-medium text-wps-text" title={link.targetName}>{link.targetName}</div>
            <code className="block truncate text-[11px] text-wps-subtext" title={absolute}>{absolute}</code>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {modeBits(link).map(b => (
            <span key={b.key} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${b.tone}`}>{b.label}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums text-wps-text">{link.viewTotal}</td>
      <td className="px-4 py-3 text-xs text-wps-subtext">{fmtDay(link.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-3 text-xs">
          <button onClick={() => onCopy(absolute)} className="text-wps-text hover:text-wps-brand">复制</button>
          <a
            href={absolute}
            target="_blank"
            rel="noopener noreferrer noindex"
            className="text-wps-text hover:text-wps-brand"
          >
            预览
          </a>
          <button onClick={onRevoke} className="font-medium text-wps-brand hover:underline">撤销</button>
        </div>
      </td>
    </tr>
  )
}
