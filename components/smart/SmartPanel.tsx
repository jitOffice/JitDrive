'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Icon from '../Icon'
import FileKindIcon from '../FileKindIcon'
import { useUI } from '../ui/UIProvider'
import { fileOpenRoute, DRIVE_HOME } from '@/lib/routes'
import { formatBytes } from '@/lib/format'
import type {
  DuplicateGroup,
  RecommendationItem,
  SmartSummary,
  TagSuggestion
} from '@/lib/types'

interface Props {
  actorId: string
  initialSummary: SmartSummary
  initialDuplicates: DuplicateGroup[]
  initialSuggestions: TagSuggestion[]
  initialRecommendations: RecommendationItem[]
}

/** v0.7 · P0 · AI 智能面板。
 *  四段合一：汇总卡 → 你可能想找 → 重复文件 → 敏感预警 → 标签建议。
 *  数据由 server component 首次注入，扫描按钮触发懒扫并 refresh 汇总。
 *
 *  设计红线（PRD §11.3）：AI 只提示不动手 — 重复文件的清理、敏感文件的分享
 *  限制、标签的实际添加，都由用户显式操作。 */
export default function SmartPanel({
  actorId,
  initialSummary,
  initialDuplicates,
  initialSuggestions,
  initialRecommendations
}: Props) {
  const { toast } = useUI()
  const [summary, setSummary] = useState(initialSummary)
  const [duplicates, setDuplicates] = useState(initialDuplicates)
  const [suggestions, setSuggestions] = useState(initialSuggestions)
  const [recommendations, setRecommendations] = useState(initialRecommendations)
  const [scanning, setScanning] = useState(false)

  // 只在完全没扫过 & 有待扫文件时自动跑一次（很轻，一般 <1s）。
  useEffect(() => {
    if (!summary.scanCompleted && summary.unscannedCount > 0 && summary.totalFiles > 0) {
      void runScan(true)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [])

  const runScan = useCallback(
    async (auto = false) => {
      if (scanning) return
      setScanning(true)
      try {
        const r = await fetch('/api/smart/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: auto ? 30 : 20 })
        })
        const j = await r.json()
        if (j?.code !== 200) {
          toast(j?.message || '扫描失败', 'error')
          return
        }
        const report = j.data as {
          scanned: number
          hashedBackfilled: number
          sensitiveHigh: number
          sensitiveMedium: number
          remaining: number
        }
        // 汇总 + 各 section 都 refresh；扫描后 duplicates 可能有新增，重新拉。
        const [s, d, sg, rc] = await Promise.all([
          fetch('/api/smart/summary').then(x => x.json()),
          fetch('/api/smart/duplicates?limit=30').then(x => x.json()),
          fetch('/api/smart/suggestions?limit=20').then(x => x.json()),
          fetch('/api/smart/recommendations?limit=5').then(x => x.json())
        ])
        if (s?.code === 200) setSummary(s.data)
        if (d?.code === 200) setDuplicates(d.data.items)
        if (sg?.code === 200) setSuggestions(sg.data.items)
        if (rc?.code === 200) setRecommendations(rc.data.items)

        toast(
          `已扫描 ${report.scanned} 个文件` +
            (report.hashedBackfilled > 0 ? ` · 补 hash ${report.hashedBackfilled}` : '') +
            (report.sensitiveHigh > 0 ? ` · 高危 ${report.sensitiveHigh}` : '') +
            (report.remaining > 0 ? ` · 剩余 ${report.remaining}` : ' · 全部完成'),
          'success'
        )
      } catch (e) {
        toast((e as Error).message || '扫描请求失败', 'error')
      } finally {
        setScanning(false)
      }
    },
    [scanning, toast]
  )

  const hasSensitive = summary.highCount + summary.mediumCount > 0
  const noFiles = summary.totalFiles === 0

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-wps-text">
            <Icon name="sparkles" size={18} className="text-wps-brand" />
            AI 智能
          </h1>
          <p className="mt-1 text-xs text-wps-subtext">
            零 LLM 启发式扫描 · 帮你找回重复占用 / 预警敏感分享 / 建议标签 ·
            所有分析只在你自己的文件域内进行
          </p>
        </div>
        <button
          type="button"
          onClick={() => runScan(false)}
          disabled={scanning || noFiles}
          className="flex shrink-0 items-center gap-1 rounded-md border border-wps-brand bg-white px-3 py-1.5 text-xs font-medium text-wps-brand hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon name={scanning ? 'restore' : 'search'} size={14} />
          {scanning ? '扫描中…' : summary.unscannedCount > 0 ? `扫描剩余 ${summary.unscannedCount} 个` : '重新扫描一批'}
        </button>
      </header>

      {/* 汇总四张卡 */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryTile
          icon="file"
          label="文件总数"
          value={String(summary.totalFiles)}
          caption={`${summary.hashedCount} 已算 hash`}
        />
        <SummaryTile
          icon="copy"
          label="重复组"
          value={String(summary.duplicateGroupCount)}
          caption={
            summary.duplicateGroupCount > 0
              ? `可释放 ${formatBytes(summary.reclaimableBytes)}`
              : '暂无完全相同文件'
          }
          tone={summary.duplicateGroupCount > 0 ? 'warn' : 'normal'}
        />
        <SummaryTile
          icon="shield"
          label="敏感文件"
          value={String(summary.highCount + summary.mediumCount)}
          caption={
            summary.highCount > 0
              ? `高危 ${summary.highCount} · 中危 ${summary.mediumCount}`
              : `中危 ${summary.mediumCount}`
          }
          tone={summary.highCount > 0 ? 'danger' : summary.mediumCount > 0 ? 'warn' : 'normal'}
        />
        <SummaryTile
          icon="tag"
          label="待扫描"
          value={String(summary.unscannedCount)}
          caption={summary.scanCompleted ? '已完成一轮启发式扫描' : '首次进入自动扫描'}
          tone={summary.unscannedCount > 0 ? 'warn' : 'normal'}
        />
      </section>

      {/* 你可能想找 */}
      <SectionCard
        icon="zap"
        title="你可能想找"
        subtitle="按最近打开 / 编辑 / 高频访问综合排序 · 首页顶部也会展示同一份"
        empty={recommendations.length === 0}
        emptyText="还没有明显的偏好信号 — 打开或编辑几个文件后这里会出现。"
      >
        <ul className="divide-y divide-wps-border">
          {recommendations.map(r => (
            <li key={r.fileId} className="flex items-center justify-between py-2">
              <Link
                href={fileOpenRoute({ id: r.fileId, kind: r.kind })}
                className="flex min-w-0 flex-1 items-center gap-2 text-sm text-wps-text hover:text-wps-brand"
              >
                <FileKindIcon kind={r.kind} ext={r.extension} size={16} rounded={false} />
                <span className="truncate">{r.name}</span>
                <ReasonChip reason={r.reason} />
              </Link>
              <div className="ml-2 shrink-0 text-[11px] text-wps-subtext tabular-nums">
                {r.accessCount > 0 ? `${r.accessCount} 次` : '新'}
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>

      {/* 重复文件 */}
      <SectionCard
        icon="copy"
        title="重复文件"
        subtitle="sha256 完全一致 · 每组保留最早的一份，其余你可以按需清理"
        empty={duplicates.length === 0}
        emptyText={
          summary.hashedCount === 0
            ? '还没有可比较的 hash — 上传几个文件后回来看看。'
            : '目前没有发现内容完全相同的文件。'
        }
      >
        <div className="space-y-2">
          {duplicates.map(g => (
            <DuplicateRow key={g.contentHash} group={g} />
          ))}
        </div>
      </SectionCard>

      {/* 敏感内容预警 */}
      <SectionCard
        icon="shield"
        title="敏感内容预警"
        subtitle={
          hasSensitive
            ? '分享前请再确认接收方 — 我们只按文件名 / 正文关键词启发式判定，不做全文上传'
            : '目前没有发现敏感关键词命中'
        }
        empty={!hasSensitive}
        emptyText="上传或扫描后，包含身份证 / 银行卡 / 私钥 / 合同等关键词的文件会出现在这里。"
      >
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            <div>
              <p>
                检测到 <b>{summary.highCount}</b> 个高危、<b>{summary.mediumCount}</b> 个中危文件。
                分享弹窗会自动展示对应预警，你依然可以决定是否发送。
              </p>
              <p className="mt-1 text-amber-800/80">
                v0.7 覆盖：txt / md / html / htm / csv 正文扫描 + 全类型文件名关键词。docx / pdf 正文解析在 v0.8 路线图上。
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 标签建议 */}
      <SectionCard
        icon="tag"
        title="智能标签建议"
        subtitle="基于扩展名 + 文件名 + 目录上下文的启发式；v0.8 会把选中的标签正式写入 FileTag 表"
        empty={suggestions.length === 0}
        emptyText="还没发现值得建议的关键词命中，多上传几个办公文档就会丰富起来。"
      >
        <ul className="divide-y divide-wps-border">
          {suggestions.map(s => (
            <li key={s.fileId} className="py-2">
              <div className="flex items-center gap-2">
                <FileKindIcon
                  kind={
                    s.extension === 'docx'
                      ? 'jitword'
                      : s.extension === 'pdf'
                      ? 'previewable'
                      : 'other'
                  }
                  ext={s.extension}
                  size={14}
                  rounded={false}
                />
                <Link
                  href={`${DRIVE_HOME}?highlight=${s.fileId}`}
                  className="min-w-0 flex-1 truncate text-sm text-wps-text hover:text-wps-brand"
                  title={s.name}
                >
                  {s.name}
                </Link>
                <ConfidenceBadge level={s.confidence} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
                {s.tags.map(t => (
                  <span
                    key={t}
                    className="rounded-full border border-wps-border bg-slate-50 px-2 py-0.5 text-[11px] text-wps-text"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

// ---------- 子组件 ----------

function SummaryTile({
  icon,
  label,
  value,
  caption,
  tone = 'normal'
}: {
  icon: 'file' | 'copy' | 'shield' | 'tag'
  label: string
  value: string
  caption: string
  tone?: 'normal' | 'warn' | 'danger'
}) {
  const toneCls =
    tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : tone === 'warn'
      ? 'border-amber-200 bg-amber-50'
      : 'border-wps-border bg-white'
  const textCls =
    tone === 'danger' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-wps-text'
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="flex items-center gap-1 text-[11px] text-wps-subtext">
        <Icon name={icon} size={12} />
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${textCls}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-wps-subtext">{caption}</div>
    </div>
  )
}

function SectionCard({
  icon,
  title,
  subtitle,
  empty,
  emptyText,
  children
}: {
  icon: 'zap' | 'copy' | 'shield' | 'tag'
  title: string
  subtitle?: string
  empty?: boolean
  emptyText?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md border border-wps-border bg-white p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <Icon name={icon} size={14} className="text-wps-brand" />
        <h2 className="text-sm font-semibold text-wps-text">{title}</h2>
        {subtitle && <span className="ml-1 text-[11px] text-wps-subtext">{subtitle}</span>}
      </div>
      {empty ? (
        <div className="rounded border border-dashed border-wps-border p-6 text-center text-xs text-wps-subtext">
          {emptyText}
        </div>
      ) : (
        children
      )}
    </section>
  )
}

function DuplicateRow({ group }: { group: DuplicateGroup }) {
  const [open, setOpen] = useState(false)
  const total = group.files.length
  const reclaimable = (total - 1) * group.size
  const fmtDate = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const sorted = useMemo(() => group.files, [group.files])
  return (
    <div className="rounded border border-wps-border">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon name={open ? 'chevron' : 'chevronRight'} size={12} className="shrink-0 text-wps-subtext" />
          <span className="truncate font-medium text-wps-text">{sorted[0]?.name}</span>
          <span className="shrink-0 text-wps-subtext">× {total} 份</span>
          <span className="shrink-0 text-wps-subtext tabular-nums">
            可释放 {formatBytes(reclaimable)}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-wps-subtext font-mono">
          {group.contentHash.slice(0, 8)}…
        </span>
      </button>
      {open && (
        <ul className="divide-y divide-wps-border border-t border-wps-border bg-slate-50">
          {sorted.map((f, idx) => (
            <li key={f.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ' +
                    (idx === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600')
                  }
                >
                  {idx === 0 ? '原件' : '重复'}
                </span>
                <Link
                  href={fileOpenRoute({ id: f.id, kind: f.extension === 'docx' ? 'jitword' : 'other' })}
                  className="truncate text-wps-text hover:text-wps-brand"
                >
                  {f.name}
                </Link>
                <span className="shrink-0 text-[10px] text-wps-subtext">
                  {f.parentName ? `在 ${f.parentName}` : '根目录'}
                </span>
              </div>
              <div className="ml-2 shrink-0 text-[11px] text-wps-subtext tabular-nums">
                {fmtDate(f.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ReasonChip({ reason }: { reason: RecommendationItem['reason'] }) {
  const map: Record<RecommendationItem['reason'], { label: string; cls: string }> = {
    recently_opened: { label: '最近打开', cls: 'bg-blue-50 text-blue-700' },
    recently_edited: { label: '最近编辑', cls: 'bg-emerald-50 text-emerald-700' },
    frequently_opened: { label: '常打开', cls: 'bg-violet-50 text-violet-700' }
  }
  const it = map[reason]
  return (
    <span className={`ml-2 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${it.cls}`}>
      {it.label}
    </span>
  )
}

function ConfidenceBadge({ level }: { level: TagSuggestion['confidence'] }) {
  const map = {
    high: { label: '高置信', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    medium: { label: '中置信', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    low: { label: '参考', cls: 'bg-slate-50 text-slate-600 border-slate-200' }
  }[level]
  return (
    <span className={`ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${map.cls}`}>
      {map.label}
    </span>
  )
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
