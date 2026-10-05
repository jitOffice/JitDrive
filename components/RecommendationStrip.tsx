'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from './Icon'
import FileKindIcon from './FileKindIcon'
import { fileOpenRoute, SMART } from '@/lib/routes'
import type { RecommendationItem } from '@/lib/types'

const DISMISS_KEY = 'jitdrive.smart.recommend.dismissedAt'

/** v0.7 · P0 · 首页顶部"你可能想找"横幅。
 *  数据来自服务端首屏注入的 recommendations（server component 已算好），
 *  客户端只做显示 + 关闭 + sessionStorage 记忆（本次会话不再出现，下次登录
 *  重新出现 — 不永久隐藏，避免用户以为功能坏了）。
 *
 *  空数组直接不渲染；关闭后 sessionStorage 写 Date.now() 用于将来做退避策略。 */
export default function RecommendationStrip({ items }: { items: RecommendationItem[] }) {
  // 初始 visible = true（只要 items 非空）。SSR 会渲染完整横幅；客户端
  // hydration 后如果 sessionStorage 里 24 小时内已关闭，再 useEffect 隐藏。
  // 这样：curl / 首屏 / 慢网都能看到内容；已关闭的用户最多看到 30-100ms
  // 的一次闪回，比"永远看不到直到刷新"的体验好得多。
  const [visible, setVisible] = useState(items.length > 0)

  useEffect(() => {
    if (items.length === 0) return
    try {
      const dismissedRaw = sessionStorage.getItem(DISMISS_KEY)
      if (!dismissedRaw) return
      const ts = Number(dismissedRaw)
      // 24 小时内不再弹（对齐 PRD §11.3 "不打扰"红线）。
      if (Number.isFinite(ts) && Date.now() - ts < 24 * 60 * 60 * 1000) {
        setVisible(false)
      }
    } catch {
      /* 隐私模式 / storage 禁用 → 保持可见 */
    }
  }, [items.length])

  if (!visible || items.length === 0) return null

  function dismiss() {
    setVisible(false)
    try {
      sessionStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mb-4 rounded-md border border-wps-border bg-gradient-to-r from-red-50 via-white to-amber-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-wps-text">
          <Icon name="zap" size={14} className="text-wps-brand" />
          你可能想找
          <span className="ml-1 font-normal text-wps-subtext">· 按最近打开 / 编辑 / 高频访问排序</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={SMART}
            className="text-[11px] text-wps-subtext hover:text-wps-brand"
          >
            查看 AI 智能 ·
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded p-1 text-wps-subtext hover:bg-white/60 hover:text-wps-text"
            title="本次会话不再显示"
            aria-label="关闭推荐横幅"
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 5).map(r => (
          <Link
            key={r.fileId}
            href={fileOpenRoute({ id: r.fileId, kind: r.kind })}
            className="flex max-w-[240px] items-center gap-1.5 rounded-full border border-wps-border bg-white px-3 py-1 text-xs text-wps-text shadow-sm transition hover:border-wps-brand hover:text-wps-brand"
            title={r.name}
          >
            <FileKindIcon kind={r.kind} ext={r.extension} size={13} rounded={false} />
            <span className="truncate">{r.name}</span>
            <ReasonDot reason={r.reason} />
          </Link>
        ))}
      </div>
    </div>
  )
}

function ReasonDot({ reason }: { reason: RecommendationItem['reason'] }) {
  const color =
    reason === 'recently_edited'
      ? 'bg-emerald-500'
      : reason === 'frequently_opened'
      ? 'bg-violet-500'
      : 'bg-blue-500'
  const title =
    reason === 'recently_edited'
      ? '最近编辑过'
      : reason === 'frequently_opened'
      ? '经常打开'
      : '最近打开过'
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} title={title} aria-label={title} />
}
