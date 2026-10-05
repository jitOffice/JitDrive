'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Icon, { type IconName } from './Icon'
import ContactButton from './ContactButton'
import { DRIVE_HOME, RECENT, SHARED, MY_SHARES, TRASH, SMART } from '@/lib/routes'
import { formatBytes, formatRatio } from '@/lib/format'
import type { StorageUsage } from '@/lib/types'

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: DRIVE_HOME, label: '我的云盘', icon: 'drive' },
  { href: RECENT, label: '最近打开', icon: 'clock' },
  { href: SHARED, label: '共享给我', icon: 'users' },
  { href: MY_SHARES, label: '我的分享', icon: 'share' },
  { href: SMART, label: 'AI 智能', icon: 'sparkles' },
  { href: TRASH, label: '回收站', icon: 'trash' }
]

interface Props {
  // Server layout always passes usage; optional so storybook-ish callers can
  // render the sidebar chrome without a DB (and so the type stays forgiving
  // across future refactors that may drop the prop from a caller).
  usage?: StorageUsage
}

export default function Sidebar({ usage }: Props) {
  const pathname = usePathname()
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-wps-border bg-white md:flex">
      <Link
        href="/"
        title="返回官网首页"
        aria-label="JitDrive 官网首页"
        className="group/logo flex items-center gap-2 px-4 py-4 transition hover:bg-slate-50"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-wps-brand to-wps-brandDark text-white shadow-sm transition group-hover/logo:scale-105">
          <Icon name="drive" size={18} />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-wps-text">JitDrive</span>
          <span className="flex items-center gap-1 text-[10px] text-wps-subtext">
            智能云盘
            <Icon
              name="arrowUpRight"
              size={11}
              className="opacity-0 transition group-hover/logo:opacity-60"
            />
          </span>
        </span>
      </Link>

      <nav className="mt-1 px-2">
        {NAV.map(item => {
          const active =
            item.href === DRIVE_HOME ? pathname === DRIVE_HOME : !!pathname && pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm ' +
                (active ? 'bg-red-50 font-medium text-wps-brand' : 'text-wps-text hover:bg-slate-100')
              }
            >
              <Icon name={item.icon} size={17} className="shrink-0 opacity-90" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto p-4">
        <div className="mb-3">
          <ContactButton variant="inline" className="w-full justify-center" />
        </div>
        <StorageCard usage={usage} />
      </div>
    </aside>
  )
}

function StorageCard({ usage }: { usage?: StorageUsage }) {
  if (!usage) {
    // Fallback chrome during SSR gaps or in isolated stories. Deliberately
    // plain so it doesn't pretend to be real numbers.
    return (
      <div className="rounded-md border border-wps-border bg-wps-side p-3 text-xs">
        <div className="text-wps-subtext">已用空间</div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
          <div className="h-full w-[3%] rounded-full bg-wps-brand opacity-40" />
        </div>
        <div className="mt-2 text-[10px] text-wps-subtext">回收站文档保留 30 天后自动清理</div>
      </div>
    )
  }

  // Zero-usage still paints a sliver so the bar reads as "present, empty"
  // rather than "unloaded". Above ~90% we shift to amber as a soft warning
  // without a full modal — a product nicety users on real quotas expect.
  const pct = Math.max(usage.ratio * 100, 0.5)
  const nearFull = usage.ratio >= 0.9
  const barColor = nearFull ? 'bg-amber-500' : 'bg-wps-brand'

  return (
    <div className="rounded-md border border-wps-border bg-wps-side p-3 text-xs">
      <div className="flex items-baseline justify-between text-wps-subtext">
        <span>已用空间</span>
        <span className="font-medium text-wps-text tabular-nums">
          {formatBytes(usage.totalUsed)} <span className="text-wps-subtext">/ {formatBytes(usage.quotaBytes)}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
        <div
          className={'h-full rounded-full transition-all ' + barColor}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usage.ratio * 100)}
          aria-label="已用空间"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-wps-subtext tabular-nums">
        <span>活跃 {formatBytes(usage.usedActive)}</span>
        <span>回收站 {formatBytes(usage.usedTrash)}</span>
        <span>{formatRatio(usage.ratio)}</span>
      </div>
      <div className="mt-1.5 text-[10px] text-wps-subtext">回收站文档保留 30 天后自动清理</div>
    </div>
  )
}
