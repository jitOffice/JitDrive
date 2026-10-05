// v0.7 · P0 · Smart-layer DB access.
//
// Everything smart-related that touches Prisma lives here so the routes stay
// thin and lib/smart/{hash,sensitive,tags,recommend}.ts remain pure.
//
// Key rules:
//   • **Owner-scoped** every query. We never aggregate across owners — a
//     duplicate detected in Bob's drive must not leak into Alice's summary
//     (or vice versa). Composite index `@@index([ownerId, contentHash])` makes
//     this cheap.
//   • **Deleted files excluded** everywhere except duplicate groups where we
//     include soft-deleted rows *only if* they share a hash with an active
//     row (so "回收站里那份是原版的重复"提示可以引导用户 purge).
//   • **No bulk UPDATE inside a scan loop**. We persist one row at a time via
//     `setSensitivity` / `setContentHash` so a mid-scan crash leaves the
//     remaining files as "unscanned" (idempotent retry).
import prisma from '../db'
import { resolveReadPath } from '../storage'
import { kindOfExt } from '../filetypes'
import { listDrive } from '../store'
import type { FileRecord, SensitivityLabel, SmartSummary, DuplicateGroup, TagSuggestion, RecommendationItem } from '../types'
import { scanFile } from './sensitive'
import { sha256OfFile } from './hash'
import { suggestTags } from './tags'
import { rankRecommendations } from './recommend'

const DAY = 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// 汇总（SmartPanel 顶部四张卡）
// ---------------------------------------------------------------------------
export async function getSmartSummary(actorId: string): Promise<SmartSummary> {
  // 一次算完，全部 Promise.all — 单个 COUNT 都是 index-only scan。
  const [totalFiles, hashedCount, highCount, mediumCount, unscannedCount, dupRaw] = await Promise.all([
    prisma.file.count({ where: { ownerId: actorId, deleted: false } }),
    prisma.file.count({ where: { ownerId: actorId, deleted: false, contentHash: { not: null } } }),
    prisma.file.count({ where: { ownerId: actorId, deleted: false, sensitivity: 'high' } }),
    prisma.file.count({ where: { ownerId: actorId, deleted: false, sensitivity: 'medium' } }),
    prisma.file.count({ where: { ownerId: actorId, deleted: false, sensitivity: null } }),
    // 重复组：只在有 hash 的行里 GROUP BY，HAVING count > 1。
    prisma.$queryRaw<Array<{ contentHash: string; cnt: bigint; size: number; totalSize: bigint }>>`
      SELECT contentHash,
             COUNT(*) AS cnt,
             MIN(size) AS size,
             SUM(size) AS totalSize
        FROM File
       WHERE ownerId = ${actorId}
         AND deleted = 0
         AND contentHash IS NOT NULL
       GROUP BY contentHash
      HAVING COUNT(*) > 1
    `
  ])

  // BigInt 转换 & 冗余计算：保留最早 createdAt 的一份，其余 size 之和 = 可回收。
  // 简化：totalSize - size（每组一份原件）；这在同 hash 同 size 情况下精确
  // （sha256 冲突不存在，同 hash 必然同 size），可以直接用 (cnt-1) * size。
  let dupFileCount = 0
  let reclaimable = 0
  for (const row of dupRaw) {
    const cnt = Number(row.cnt)
    const size = Number(row.size)
    dupFileCount += cnt
    reclaimable += (cnt - 1) * size
  }

  // scanCompleted 的判定：只要有任何一条 sensitivity IS NOT NULL 的行就算完成过一轮。
  // 这个语义略宽松，但对 UI 有意义：只要用户点过一次扫描，横幅就不催了。
  const scannedAny = totalFiles - unscannedCount

  return {
    totalFiles,
    hashedCount,
    duplicateFileCount: dupFileCount,
    duplicateGroupCount: dupRaw.length,
    reclaimableBytes: reclaimable,
    highCount,
    mediumCount,
    unscannedCount,
    scanCompleted: scannedAny > 0
  }
}

// ---------------------------------------------------------------------------
// 重复文件组
// ---------------------------------------------------------------------------
export async function findDuplicateGroups(actorId: string, limit = 50): Promise<DuplicateGroup[]> {
  const rows = await prisma.$queryRaw<Array<{ contentHash: string; cnt: bigint }>>`
    SELECT contentHash, COUNT(*) AS cnt
      FROM File
     WHERE ownerId = ${actorId}
       AND deleted = 0
       AND contentHash IS NOT NULL
     GROUP BY contentHash
    HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC, contentHash ASC
     LIMIT ${limit}
  `
  if (rows.length === 0) return []

  const hashes = rows.map(r => r.contentHash)
  const files = await prisma.file.findMany({
    where: { ownerId: actorId, deleted: false, contentHash: { in: hashes } },
    select: {
      id: true,
      name: true,
      extension: true,
      parentId: true,
      createdAt: true,
      size: true,
      contentHash: true
    }
  })

  // 一次拉齐 parent 名，避免 N 次查询。
  const parentIds = Array.from(new Set(files.map(f => f.parentId).filter((x): x is string => !!x)))
  const parents = parentIds.length
    ? await prisma.folder.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } })
    : []
  const parentName = new Map(parents.map(p => [p.id, p.name]))

  // 按 hash 分桶
  const byHash = new Map<string, typeof files>()
  for (const f of files) {
    if (!f.contentHash) continue
    const arr = byHash.get(f.contentHash) || []
    arr.push(f)
    byHash.set(f.contentHash, arr)
  }

  return rows.map(r => {
    const bucket = (byHash.get(r.contentHash) || []).slice().sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
    return {
      contentHash: r.contentHash,
      size: Number(bucket[0]?.size ?? 0),
      files: bucket.map(f => ({
        id: f.id,
        name: f.name,
        extension: f.extension || '',
        parentId: f.parentId ?? null,
        parentName: f.parentId ? parentName.get(f.parentId) ?? null : null,
        createdAt: Number(f.createdAt)
      }))
    }
  })
}

// ---------------------------------------------------------------------------
// 标签建议（运行时，不落库）
// ---------------------------------------------------------------------------
export async function getSuggestions(actorId: string, limit = 20): Promise<TagSuggestion[]> {
  const files = await listDrive(actorId)
  // 只保留 active 且非纯媒体（媒体标签就是类别标签，价值不大）
  const candidates = files
    .filter(f => !f.deleted)
    .filter(f => ['jitword', 'previewable', 'other'].includes(f.kind))
    .slice(0, limit * 3)

  // 批量拿 parent 名，避免 N 次。
  const parentIds = Array.from(new Set(candidates.map(f => f.parentId).filter((x): x is string => !!x)))
  const parents = parentIds.length
    ? await prisma.folder.findMany({ where: { id: { in: parentIds } }, select: { id: true, name: true } })
    : []
  const parentName = new Map(parents.map(p => [p.id, p.name]))

  const suggestions = candidates.map(f => {
    const s = suggestTags(
      { name: f.name, extension: f.extension, parentId: f.parentId },
      f.parentId ? parentName.get(f.parentId) ?? null : null
    )
    return {
      fileId: f.id,
      name: f.name,
      extension: f.extension,
      tags: s.tags,
      confidence: s.confidence
    }
  })

  // 优先展示 medium / high 命中（只有类别 tag 的低置信度文件往后放）
  const rank = { high: 0, medium: 1, low: 2 } as const
  suggestions.sort((a, b) => rank[a.confidence] - rank[b.confidence])
  return suggestions.slice(0, limit)
}

// ---------------------------------------------------------------------------
// 推荐（"你可能想找"）
// ---------------------------------------------------------------------------
export async function getRecommendations(actorId: string, limit = 5): Promise<RecommendationItem[]> {
  const files = await listDrive(actorId)
  return rankRecommendations(files, { limit })
}

// ---------------------------------------------------------------------------
// 扫描（懒触发）— 每次最多扫 batchSize 条，剩下的下次点扫描继续。
// ---------------------------------------------------------------------------
export interface ScanReport {
  scanned: number
  hashedBackfilled: number
  sensitiveHigh: number
  sensitiveMedium: number
  failed: number
  remaining: number
}

/**
 * 扫一批未扫过的 active 文件（sensitivity IS NULL）。同时把 contentHash 回填。
 * batchSize 默认 20，UI 每次点扫描就跑一批。
 *
 * 顺序：createdAt DESC（新先扫），因为推荐面板更关心近期。
 * 排除：软删 & 无 originalPath 的行（无法读磁盘）。
 */
export async function scanBatch(actorId: string, batchSize = 20): Promise<ScanReport> {
  const rows = await prisma.file.findMany({
    where: {
      ownerId: actorId,
      deleted: false,
      sensitivity: null,
      originalPath: { not: null }
    },
    orderBy: { createdAt: 'desc' },
    take: batchSize
  })

  let hashedBackfilled = 0
  let sensitiveHigh = 0
  let sensitiveMedium = 0
  let failed = 0

  for (const row of rows) {
    try {
      // row 本身是 Prisma.File 全字段。构造 FileRecord 只用于 resolveReadPath。
      const fakeRec: Pick<FileRecord, 'id' | 'extension' | 'originalPath'> = {
        id: row.id,
        extension: row.extension || 'docx',
        originalPath: row.originalPath ?? undefined
      }
      const abs = resolveReadPath(fakeRec)
      if (!abs) {
        failed++
        // 没路径也标一次，避免死循环永远选中它。
        await prisma.file.update({ where: { id: row.id }, data: { sensitivity: 'low' } })
        continue
      }

      // 1) 顺便补 hash（v0.7 之前的老数据）
      if (!row.contentHash) {
        const h = await sha256OfFile(abs)
        await prisma.file.update({ where: { id: row.id }, data: { contentHash: h } })
        hashedBackfilled++
      }

      // 2) sensitivity 扫描
      const ext = (row.extension || '').toLowerCase()
      const result = await scanFile(abs, ext, row.name)
      if (!result) {
        failed++
        continue
      }
      await prisma.file.update({
        where: { id: row.id },
        data: { sensitivity: result.label }
      })
      if (result.label === 'high') sensitiveHigh++
      else if (result.label === 'medium') sensitiveMedium++
    } catch (e) {
      console.warn('[smart/store] scan row failed:', row.id, (e as Error).message)
      failed++
    }
  }

  const remaining = await prisma.file.count({
    where: { ownerId: actorId, deleted: false, sensitivity: null }
  })

  return {
    scanned: rows.length,
    hashedBackfilled,
    sensitiveHigh,
    sensitiveMedium,
    failed,
    remaining
  }
}

// ---------------------------------------------------------------------------
// 单文件写入（供 upload / 其他路径回调）
// ---------------------------------------------------------------------------
export async function setContentHash(fileId: string, hash: string): Promise<void> {
  await prisma.file.update({ where: { id: fileId }, data: { contentHash: hash } })
}

export async function setSensitivity(fileId: string, label: SensitivityLabel): Promise<void> {
  await prisma.file.update({ where: { id: fileId }, data: { sensitivity: label } })
}

// ---------------------------------------------------------------------------
// 单文件当前 sensitivity（供 LinkPane 分享预警 banner 用）
// ---------------------------------------------------------------------------
export async function getSensitivityFor(fileId: string, actorId: string): Promise<SensitivityLabel | null> {
  const row = await prisma.file.findFirst({
    where: { id: fileId, ownerId: actorId },
    select: { sensitivity: true }
  })
  if (!row?.sensitivity) return null
  if (row.sensitivity === 'low' || row.sensitivity === 'medium' || row.sensitivity === 'high') {
    return row.sensitivity
  }
  return null
}

/** 供 API 层快速判断"是否所有 active 文件都扫过了"，用于 SmartPanel 显示"✅ 全部已扫描"。 */
export async function hasUnscanned(actorId: string): Promise<boolean> {
  const n = await prisma.file.count({ where: { ownerId: actorId, deleted: false, sensitivity: null } })
  return n > 0
}

/** 兜底：kindOfExt 从 filetypes 里导出，这里再 re-export 一次方便 API 层判类型；
 *  避免 routes 里同时 import 两个 seam。 */
export { kindOfExt }
/** 供 UI 展示"多久前"（比如 banner 判断是否显示 48 小时前的冷启动推荐）。 */
export const DAY_MS = DAY
