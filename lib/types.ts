// Shared types used across server routes and client components.
//
// The drive models a multi-user collaboration layer on top of the single-tenant
// JitWord backend: every document has an owner (a real user account) and a
// FileShare viewer roster, plus recycle-bin and recency metadata. Identity comes
// from a signed session cookie (see lib/auth.ts); ownership and access are
// enforced server-side, and data is persisted via Prisma/SQLite (see lib/store.ts).
//
// v0.4 additions:
//   • FileKind is *derived* from File.extension via lib/filetypes.kindOf() —
//     never stored, so whitelist drift auto-reclassifies rows to `other`.
//   • FileRecord.docId is nullable (only kind='jitword' has one).
//   • FileRecord.parentId is the folder container; null ⇒ root.
//   • FileRecord.deletedViaParentId is a cascade marker set when a folder was
//     soft-deleted with its descendants; restore batches look up by it.

export type FileStatus = 'ready' | 'importing' | 'error'

/** v0.7 · P0 heuristic sensitivity bucket written by lib/smart/sensitive.ts.
 *  Three levels (not five) so the UI copy can commit to a real warning at
 *  'high' without diluting attention. Rows never scanned are null (legacy
 *  data or files whose bytes are not readable text-family). Stored on
 *  File.sensitivity as a String; enum is enforced at write time in
 *  lib/smart/store.ts, not the DB, to keep SQLite ↔ Postgres portable. */
export type SensitivityLabel = 'low' | 'medium' | 'high'

/** Derived file category — see lib/filetypes.ts. */
export type FileKind =
  | 'jitword'    // docx → opens in JitWord editor + ticket flow
  | 'previewable'// xlsx/pptx/pdf/ofd/txt/md/html → JitWord-Preview SDK
  | 'image'      // png/jpg/… → native <img>
  | 'audio'      // mp3/wav/… → native <audio controls>
  | 'video'      // mp4/webm/… → native <video controls>
  | 'archive'    // zip/rar/7z → download-only (zip-bomb guard on Preview SDK)
  | 'other'      // anything else → download-only card

export interface FileRecord {
  id: string
  name: string
  /** JitWord document id. Null for non-jitword files (see FileKind). */
  docId: string | null
  /** Lower-case extension without leading dot, e.g. "docx", "pdf", "png". */
  extension: string
  /** Derived from extension. Not persisted; recomputed on every read. */
  kind: FileKind
  size: number
  mime: string
  /** Containing folder id. null ⇒ user's root. */
  parentId: string | null
  ownerSubject: string   // id of the persona that created/owns the doc
  ownerName: string      // display name of the owner (denormalized for lists)
  // Creator subject as JitWord knows it. Distinct from ownerSubject after the
  // v0.3 account migration (which remapped persona → real user id for app ACL
  // but left the underlying JitWord docs bound to their original persona id).
  // The ticket route must send this verbatim; if missing, falls back to actor.
  // Only meaningful when kind='jitword'.
  jwSubject?: string
  sharedWith: string[]   // subject ids this doc is shared to (viewer access)
  createdAt: number
  updatedAt: number
  lastEditedAt?: number
  // Recycle-bin state. deleted=true hides the file from drive/shared/recent and
  // surfaces it under /trash with a restore / permanent-delete action.
  deleted: boolean
  deletedAt?: number
  // Set when this file was soft-deleted as part of an ancestor folder's
  // cascade. Restore on that folder batches by this field.
  deletedViaParentId?: string
  // Recency tracking ("最近打开"): bumped on each open of the editor/preview.
  lastAccessedAt?: number
  accessCount: number
  // Absolute path to the stored original bytes on disk. For docx this stays
  // `data/uploads/<id>.docx`; other kinds live under
  // `data/uploads/<id>/<rev>/<safeName>` (see lib/storage.ts).
  originalPath?: string
  /** @deprecated v0.4.1 — Word 解析已迁移到浏览器端 iframe-sdk 1.1
   *  `document.importDocx`，不再暂存 mammoth HTML。列保留仅为向后兼容老数据，
   *  新写入一律留空；purge/delete 时顺手清理遗留文件。 */
  pendingHtmlPath?: string
  // Freshly uploaded docx whose bytes are stored but not yet imported into the
  // JitWord document. EditorClient streams them back via /raw and calls
  // importDocx on first ready, then POSTs /content to clear this flag.
  // For non-jitword files this is always false (no pending pipeline).
  pendingImport: boolean
  status: FileStatus
  /** Legacy alias kept for pre-v0.4 UI components; new code should read
   *  `kind` + `extension`. */
  category: 'docx'
  /** v0.7 · P0 · sha256 hex of the stored bytes (lower-case, no prefix).
   *  Written inline on POST /api/files (both docx and generic branches),
   *  because we already hold the Buffer in memory. Null on legacy rows until
   *  /api/smart/scan backfills. Duplicates = same owner + same hash. */
  contentHash?: string | null
  /** v0.7 · P0 · Heuristic sensitivity bucket. Null means "not yet scanned"
   *  (not "safe"); the smart summary panel distinguishes the two. Body scan
   *  covers txt/md/html/csv/json/xml/log; everything else falls back to a
   *  filename keyword heuristic (contract/身份证/密码/密钥/…). docx/pdf body
   *  scan deferred to v0.8 with pdf-parse. */
  sensitivity?: SensitivityLabel | null
}

export interface FolderRecord {
  id: string
  name: string
  ownerId: string
  ownerName: string
  parentId: string | null
  createdAt: number
  updatedAt: number
  deleted: boolean
  deletedAt?: number
  deletedViaParentId?: string
  /** Populated by list views: direct non-deleted child count (folders + files).
   *  UI shows "包含 N 项" from this. */
  childCount?: number
}

export interface TicketResponse {
  ticket: string
  expiresAt: number
  docId: string
  origin: string
  scopes?: string[]
}

// A user row exposed to the share picker (GET /api/users roster).
export interface ActorUser {
  id: string
  name: string
  color: string
  /** Populated by /api/users (search/roster) for the share picker subtitle.
   *  Optional so avatar-only consumers don't need to fetch it. */
  email?: string
}

/** Single crumb in a folder path. `id=null` denotes the user's root. */
export interface Crumb {
  id: string | null
  name: string
}

/**
 * Per-actor storage footprint, returned by `getStorageUsage` in lib/store.ts.
 * Both buckets count toward the quota (recycle-bin files still occupy disk
 * until purge / 30-day reap). `ratio` is already clamped to [0,1] so the UI
 * can set bar width without another `Math.min`. Kept as a plain type here so
 * client components can `import type` without pulling the Prisma module.
 */
export interface StorageUsage {
  usedActive: number
  usedTrash: number
  totalUsed: number
  quotaBytes: number
  ratio: number
}

// ---------------------------------------------------------------------------
// v0.7 · P0 "AI 智能" 派生数据（smart 层）
// 类型全部为纯 interface（server / client 都能 `import type`）。
// 生产实现见 lib/smart/{hash,sensitive,tags,recommend,store}.ts；API 见
// app/api/smart/*；页面见 app/(drive)/drive/smart/page.tsx + SmartPanel。
// ---------------------------------------------------------------------------

/** /drive/smart 顶部四张汇总卡所需的全量画像。所有计数都是当前 actor 的
 *  私有域，绝不跨 owner 聚合——避免侧信道猜别人上传了什么。 */
export interface SmartSummary {
  /** 已入库文件总数（不含软删）。 */
  totalFiles: number
  /** 已算过 sha256 的文件数（v0.7 之后新建 ≈ 100%；老数据未回填 → null）。 */
  hashedCount: number
  /** 至少存在一份同 hash 兄弟文件的 file 数（owner 域内）。 */
  duplicateFileCount: number
  /** 独立重复组数量；hash 相同即一组，UI 用组数显示"发现 N 组重复"。 */
  duplicateGroupCount: number
  /** 可释放字节数（每组保留最早 createdAt，其余 size 之和）。 */
  reclaimableBytes: number
  /** sensitivity='high' 的 file 数（顶栏 & 分享弹窗红条依据）。 */
  highCount: number
  /** sensitivity='medium' 数。 */
  mediumCount: number
  /** 尚未扫过 sensitivity 的 file 数（含纯二进制/未回填）。UI 显示"待扫描 N"。 */
  unscannedCount: number
  /** 是否已经跑过一次 scan（懒标记：true 后 SmartPanel 不再自动触发扫描）。 */
  scanCompleted: boolean
}

/** 一个 sha256 相同文件组。UI 展开后展示 path + createdAt，帮用户判断保留哪个。
 *  `files` 按 createdAt 升序（最早 = 事实上的"原件"，其他都是"重复"）。 */
export interface DuplicateGroup {
  contentHash: string
  size: number
  files: Array<{
    id: string
    name: string
    extension: string
    parentId: string | null
    parentName: string | null
    createdAt: number
  }>
}

/** 单文件标签建议。tags 是"我们觉得应该加"，currentTags 是"文件已经有"（v0.7
 *  永远是空数组——File 表没有 tag 列，UI 保持 disable 添加按钮并提示 v0.8 落地）。 */
export interface TagSuggestion {
  fileId: string
  name: string
  extension: string
  tags: string[]
  confidence: 'high' | 'medium' | 'low'
}

/** 单个推荐项，出现在首页 "你可能想找" 横幅。reason 是给 UI 的短语标签，
 *  score 保留给调试；用户永远看不到数字。 */
export interface RecommendationItem {
  fileId: string
  name: string
  extension: string
  kind: FileKind
  parentId: string | null
  lastAccessedAt: number | null
  accessCount: number
  lastEditedAt: number | null
  score: number
  reason: 'recently_opened' | 'recently_edited' | 'frequently_opened'
}
