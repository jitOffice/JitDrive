// v0.7 · P0 · "你可能想找" 推荐打分。
//
// 纯函数，接受已经加载好的 FileRecord[]，返回加权排序后的 top-N。数据库
// 层不做任何计算 — 未来切 Postgres 或加 Redis 缓存时，这个函数完全不用动。
//
// 权重公式（PRD §11.3 "最近智能推荐"）：
//   score = recency_term × frequency_term × edit_term
//     recency_term   = 1 / (days_since_lastAccess + 1)   ← 越近越高分，最小 0
//     frequency_term = 1 + log(1 + accessCount)          ← 常用文件加权，log 抑制爆款
//     edit_term      = lastEditedAt ? 1.5 : 1.0          ← 编过 > 只看过
//
// 冷启动（从未打开过 accessCount=0 & lastAccessedAt=null）：
//   给一个基于 createdAt 的回退分（"你刚上传的可能想找"），保证首页横幅
//   永远不会空。
//
// Reason 分类（UI 展示 & 埋点归因）：
//   'recently_opened'  — 7 天内打开过
//   'recently_edited'  — 3 天内编辑过（优先级高于 opened）
//   'frequently_opened' — 打开 ≥3 次的老熟人（即使不在 7 天窗口）
import type { FileRecord } from '../types'
import type { RecommendationItem } from '../types'

const DAY = 24 * 60 * 60 * 1000

/** 主打分函数。file 必须非软删（调用方过滤）。now 由 caller 传入以便测试。 */
export function scoreFile(
  f: Pick<
    FileRecord,
    'id' | 'name' | 'extension' | 'kind' | 'parentId' | 'lastAccessedAt' | 'accessCount' | 'lastEditedAt' | 'createdAt'
  >,
  now: number
): RecommendationItem {
  const la = f.lastAccessedAt ?? null
  const le = f.lastEditedAt ?? null
  const daysSinceOpen = la != null ? Math.max(0, (now - la) / DAY) : Infinity
  const recency = la != null ? 1 / (daysSinceOpen + 1) : coldStartRecency(f.createdAt, now)
  const frequency = 1 + Math.log(1 + Math.max(0, f.accessCount))
  const editBoost = le != null ? 1.5 : 1.0
  const score = recency * frequency * editBoost

  // 决定 reason 标签（互斥优先级：edited > frequently_opened > recently_opened > cold_start）
  let reason: RecommendationItem['reason'] = 'recently_opened'
  if (le != null && (now - le) / DAY <= 3) reason = 'recently_edited'
  else if (f.accessCount >= 3 && (la == null || (now - la) / DAY > 7)) reason = 'frequently_opened'
  else if (la == null) reason = 'recently_opened' // 冷启动归到 opened，UI 文案统一

  return {
    fileId: f.id,
    name: f.name,
    extension: f.extension,
    kind: f.kind,
    parentId: f.parentId ?? null,
    lastAccessedAt: la,
    accessCount: f.accessCount,
    lastEditedAt: le,
    score,
    reason
  }
}

/** 冷启动：刚上传的文件按小时衰减。48 小时后基本归零，避免永远霸屏。 */
function coldStartRecency(createdAt: number, now: number): number {
  const hoursSince = Math.max(0, (now - createdAt) / (60 * 60 * 1000))
  if (hoursSince >= 48) return 0.01
  // 0 → 1, 48h → ~0.02，用 (48 - h) / 48 的平方让衰减前段平缓后段陡。
  const t = (48 - hoursSince) / 48
  return Math.max(0.01, t * t)
}

/** Top-N（默认 5）。score <= 0 的会被剔除（老数据完全没人打开过就别打扰用户）。 */
export function rankRecommendations(
  files: FileRecord[],
  opts: { limit?: number; now?: number } = {}
): RecommendationItem[] {
  const now = opts.now ?? Date.now()
  const limit = Math.max(1, opts.limit ?? 5)
  return files
    .filter(f => !f.deleted)
    .map(f => scoreFile(f, now))
    .filter(r => Number.isFinite(r.score) && r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
