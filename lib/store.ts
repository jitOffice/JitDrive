// File + folder metadata repository — Prisma-backed (SQLite today, Postgres later).
//
// The exported function signatures and the FileRecord DTO were stable from the
// JSON store through v0.3; v0.4 keeps the same seam but adds:
//   • FileKind is derived on the way out (lib/filetypes.kindOf) and never stored.
//   • docId / jwSubject become optional — non-jitword files carry neither.
//   • Folder CRUD with cascade soft-delete (deletedViaParentId batches).
//   • Directory-aware listing (listChildren / getBreadcrumb).
//   • Cycle-safe moveFolder (walks ancestor chain, depth-capped at 64).
//
// Ownership is a real user id (File.ownerId / Folder.ownerId); the viewer roster
// stays a join table (FileShare) so "sharedWith" is portable across engines.
//
// "Delete" is a SOFT delete (deleted=true) surfaced under the recycle bin. Only
// an explicit 彻底删除 (purge) drops the row AND moves physical bytes to the OS
// trash via lib/storage.removeBlobs → lib/fsafe.moveToTrash (never fs.unlink).
import { Prisma } from '@prisma/client'
import type { File as FileRow, FileShare, Folder as FolderRow } from '@prisma/client'
import prisma from './db'
import { kindOfExt } from './filetypes'
import { removeBlobs } from './storage'
import { moveToTrash } from './fsafe'
import type {
  Crumb,
  FileKind,
  FileRecord,
  FolderRecord,
  FileStatus,
  StorageUsage,
  SensitivityLabel
} from './types'
export type { StorageUsage, SensitivityLabel } from './types'

type FileWithShares = FileRow & { shares: FileShare[] }

// BigInt timestamp columns come back as JS bigint; the DTO stays in plain ms numbers.
const ms = (b: bigint): number => Number(b)
const msOpt = (b: bigint | null): number | undefined => (b == null ? undefined : Number(b))

// DB stores File.sensitivity as String? (portable across SQLite/Postgres).
// Anything that's not one of the three known buckets downgrades to null so
// the summary treats it as "not yet scanned" instead of crashing the UI.
const SENSITIVITY_VALUES = new Set<SensitivityLabel>(['low', 'medium', 'high'])
function narrowSensitivity(v: string | null | undefined): SensitivityLabel | null | undefined {
  if (v == null) return undefined
  if (SENSITIVITY_VALUES.has(v as SensitivityLabel)) return v as SensitivityLabel
  return null
}

function toRecord(f: FileWithShares): FileRecord {
  // extension is populated at write time; legacy rows all predate v0.4 so
  // they were docx — default is safe. Kind derives from extension (never
  // stored), which means whitelist drift automatically reclassifies rows.
  const ext = f.extension || 'docx'
  const kind: FileKind = kindOfExt(ext)
  return {
    id: f.id,
    name: f.name,
    docId: f.docId ?? null,
    extension: ext,
    kind,
    size: f.size,
    mime: f.mime,
    parentId: f.parentId ?? null,
    ownerSubject: f.ownerId,
    ownerName: f.ownerName,
    jwSubject: f.jwSubject ?? undefined,
    sharedWith: f.shares.map(s => s.userId),
    createdAt: ms(f.createdAt),
    updatedAt: ms(f.updatedAt),
    lastEditedAt: msOpt(f.lastEditedAt),
    deleted: f.deleted,
    deletedAt: msOpt(f.deletedAt),
    deletedViaParentId: f.deletedViaParentId ?? undefined,
    lastAccessedAt: msOpt(f.lastAccessedAt),
    accessCount: f.accessCount,
    originalPath: f.originalPath ?? undefined,
    pendingHtmlPath: f.pendingHtmlPath ?? undefined,
    pendingImport: f.pendingImport,
    status: f.status as FileStatus,
    category: f.category as 'docx',
    // v0.7 · P0 columns. contentHash always present on new uploads (POST
    // writes inline); legacy rows show up as null until /api/smart/scan
    // backfills. sensitivity null = "not yet scanned"; the smart panel
    // surfaces the pending count so users know to hit 扫描.
    contentHash: f.contentHash ?? undefined,
    sensitivity: narrowSensitivity(f.sensitivity)
  }
}

function toFolderRecord(f: FolderRow): FolderRecord {
  return {
    id: f.id,
    name: f.name,
    ownerId: f.ownerId,
    ownerName: '', // populated lazily by list views that care; see withOwnerName
    parentId: f.parentId ?? null,
    createdAt: ms(f.createdAt),
    updatedAt: ms(f.updatedAt),
    deleted: f.deleted,
    deletedAt: msOpt(f.deletedAt),
    deletedViaParentId: f.deletedViaParentId ?? undefined
  }
}

const withShares = { shares: true } as const satisfies Prisma.FileInclude

// Column payload shared by create/update. `sharedWith` is handled separately.
function columns(rec: Partial<FileRecord> & { ownerSubject?: string }) {
  const data: Prisma.FileUncheckedUpdateInput = {}
  if (rec.name !== undefined) data.name = rec.name
  if ('docId' in rec) data.docId = rec.docId ?? null
  if (rec.extension !== undefined) data.extension = rec.extension
  if (rec.size !== undefined) data.size = rec.size
  if (rec.mime !== undefined) data.mime = rec.mime
  if ('parentId' in rec) data.parentId = rec.parentId ?? null
  if (rec.ownerSubject !== undefined) data.ownerId = rec.ownerSubject
  if (rec.ownerName !== undefined) data.ownerName = rec.ownerName
  if ('jwSubject' in rec) data.jwSubject = rec.jwSubject ?? null
  if (rec.createdAt !== undefined) data.createdAt = rec.createdAt
  if (rec.updatedAt !== undefined) data.updatedAt = rec.updatedAt
  if (rec.lastEditedAt !== undefined) data.lastEditedAt = rec.lastEditedAt ?? null
  if (rec.deleted !== undefined) data.deleted = rec.deleted
  if ('deletedAt' in rec) data.deletedAt = rec.deletedAt ?? null
  if ('deletedViaParentId' in rec) data.deletedViaParentId = rec.deletedViaParentId ?? null
  if ('lastAccessedAt' in rec) data.lastAccessedAt = rec.lastAccessedAt ?? null
  if (rec.accessCount !== undefined) data.accessCount = rec.accessCount
  if ('originalPath' in rec) data.originalPath = rec.originalPath ?? null
  if ('pendingHtmlPath' in rec) data.pendingHtmlPath = rec.pendingHtmlPath ?? null
  if (rec.pendingImport !== undefined) data.pendingImport = rec.pendingImport
  if (rec.status !== undefined) data.status = rec.status
  if (rec.category !== undefined) data.category = rec.category
  // v0.7 · P0. 'in rec' semantics so we don't wipe smart columns when a route
  // PATCHes unrelated fields (rename, move folder, share roster, etc.).
  if ('contentHash' in rec) data.contentHash = rec.contentHash ?? null
  if ('sensitivity' in rec) data.sensitivity = rec.sensitivity ?? null
  return data
}

async function syncShares(
  tx: Prisma.TransactionClient,
  fileId: string,
  ownerId: string,
  sharedWith: string[]
) {
  await tx.fileShare.deleteMany({ where: { fileId } })
  const targets = Array.from(new Set(sharedWith.filter(Boolean))).filter(u => u !== ownerId)
  if (targets.length) await tx.fileShare.createMany({ data: targets.map(userId => ({ fileId, userId })) })
}

/** Throw when (ownerId, parentId, name) is already taken by a live row. */
async function assertNameFree(
  tx: Prisma.TransactionClient,
  kind: 'file' | 'folder',
  ownerId: string,
  parentId: string | null,
  name: string,
  selfId?: string
) {
  const trimmed = name.trim()
  const where = {
    ownerId,
    deleted: false,
    name: trimmed,
    parentId: parentId ?? null
  }
  if (kind === 'file') {
    const hit = await tx.file.findFirst({ where, select: { id: true } })
    if (hit && hit.id !== selfId) throw new Error('duplicate-name')
  } else {
    const hit = await tx.folder.findFirst({ where, select: { id: true } })
    if (hit && hit.id !== selfId) throw new Error('duplicate-name')
  }
}

// ---------------- File CRUD ----------------

export async function getFile(id: string): Promise<FileRecord | null> {
  const f = await prisma.file.findUnique({ where: { id }, include: withShares })
  return f ? toRecord(f) : null
}

export async function listFiles(): Promise<FileRecord[]> {
  const rows = await prisma.file.findMany({ include: withShares, orderBy: { createdAt: 'desc' } })
  return rows.map(toRecord)
}

export async function putFile(rec: FileRecord): Promise<FileRecord> {
  await prisma.$transaction(async tx => {
    const create: Prisma.FileUncheckedCreateInput = {
      id: rec.id,
      name: rec.name,
      docId: rec.docId ?? null,
      extension: rec.extension || 'docx',
      size: rec.size,
      mime: rec.mime,
      parentId: rec.parentId ?? null,
      ownerId: rec.ownerSubject,
      ownerName: rec.ownerName,
      jwSubject: rec.jwSubject ?? null,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      lastEditedAt: rec.lastEditedAt ?? null,
      deleted: rec.deleted ?? false,
      deletedAt: rec.deletedAt ?? null,
      deletedViaParentId: rec.deletedViaParentId ?? null,
      lastAccessedAt: rec.lastAccessedAt ?? null,
      accessCount: rec.accessCount ?? 0,
      originalPath: rec.originalPath ?? null,
      pendingHtmlPath: rec.pendingHtmlPath ?? null,
      pendingImport: rec.pendingImport,
      status: rec.status,
      category: rec.category,
      // v0.7 · P0 — 上传时就带的两个新列。update 分支走 columns() 已覆盖，
      // create 分支必须显式列出，否则 upsert 新建时 Prisma 会静默省略 → DB
      // contentHash=null → 首页重复检测永远错过刚上传的文件。踩过这个坑。
      contentHash: rec.contentHash ?? null,
      sensitivity: rec.sensitivity ?? null
    }
    await tx.file.upsert({ where: { id: rec.id }, create, update: columns(rec) })
    await syncShares(tx, rec.id, rec.ownerSubject, rec.sharedWith || [])
  })
  return (await getFile(rec.id))!
}

export async function patchFile(id: string, patch: Partial<FileRecord>): Promise<FileRecord | null> {
  await prisma.$transaction(async tx => {
    const cur = await tx.file.findUnique({ where: { id } })
    if (!cur) return
    if (patch.name && patch.name !== cur.name) {
      await assertNameFree(
        tx,
        'file',
        cur.ownerId,
        patch.parentId !== undefined ? patch.parentId ?? null : cur.parentId,
        patch.name,
        id
      )
    } else if (patch.parentId !== undefined && (patch.parentId ?? null) !== cur.parentId) {
      await assertNameFree(tx, 'file', cur.ownerId, patch.parentId ?? null, cur.name, id)
    }
    const data = columns(patch)
    if (Object.keys(data).length) await tx.file.update({ where: { id }, data })
    if (patch.sharedWith) await syncShares(tx, id, patch.ownerSubject ?? cur.ownerId, patch.sharedWith)
  })
  return getFile(id)
}

// ---------------- Folder CRUD ----------------

export async function getFolder(id: string): Promise<FolderRecord | null> {
  const f = await prisma.folder.findUnique({ where: { id } })
  return f ? toFolderRecord(f) : null
}

export async function createFolder(opts: {
  id: string
  ownerId: string
  ownerName: string
  parentId: string | null
  name: string
}): Promise<FolderRecord> {
  const name = opts.name.trim()
  if (!name) throw new Error('invalid-name')
  await prisma.$transaction(async tx => {
    if (opts.parentId) {
      const parent = await tx.folder.findUnique({ where: { id: opts.parentId } })
      if (!parent || parent.ownerId !== opts.ownerId || parent.deleted) {
        throw new Error('invalid-parent')
      }
    }
    await assertNameFree(tx, 'folder', opts.ownerId, opts.parentId, name)
    const now = Date.now()
    await tx.folder.create({
      data: {
        id: opts.id,
        name,
        ownerId: opts.ownerId,
        parentId: opts.parentId,
        createdAt: now,
        updatedAt: now
      }
    })
  })
  const rec = await getFolder(opts.id)
  if (!rec) throw new Error('folder-create-failed')
  rec.ownerName = opts.ownerName
  return rec
}

export async function renameFolder(id: string, actorId: string, name: string): Promise<FolderRecord | null> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('invalid-name')
  await prisma.$transaction(async tx => {
    const cur = await tx.folder.findUnique({ where: { id } })
    if (!cur || cur.ownerId !== actorId || cur.deleted) throw new Error('not-found')
    if (cur.name !== trimmed) {
      await assertNameFree(tx, 'folder', actorId, cur.parentId, trimmed, id)
    }
    await tx.folder.update({ where: { id }, data: { name: trimmed, updatedAt: Date.now() } })
  })
  return getFolder(id)
}

/**
 * Move a folder to a new parent (null = root). Rejects:
 *   • parent not owned by actor / not exists / deleted
 *   • cycle: new parent is the folder itself or one of its descendants
 *     (walks up from the new parent via the parentId chain, depth-capped at 64)
 */
export async function moveFolder(
  id: string,
  actorId: string,
  newParentId: string | null
): Promise<FolderRecord | null> {
  await prisma.$transaction(async tx => {
    const cur = await tx.folder.findUnique({ where: { id } })
    if (!cur || cur.ownerId !== actorId || cur.deleted) throw new Error('not-found')
    if (newParentId) {
      const parent = await tx.folder.findUnique({ where: { id: newParentId } })
      if (!parent || parent.ownerId !== actorId || parent.deleted) throw new Error('invalid-parent')
      let cursor: FolderRow | null = parent
      let depth = 0
      while (cursor) {
        if (cursor.id === id) throw new Error('cycle-detected')
        if (depth++ > 64) throw new Error('depth-limit')
        cursor = cursor.parentId
          ? await tx.folder.findUnique({ where: { id: cursor.parentId } })
          : null
      }
    }
    if ((cur.parentId ?? null) !== newParentId) {
      await assertNameFree(tx, 'folder', actorId, newParentId, cur.name, id)
      await tx.folder.update({ where: { id }, data: { parentId: newParentId, updatedAt: Date.now() } })
    }
  })
  return getFolder(id)
}

/**
 * Soft-delete a folder AND its whole subtree. Every descendant folder + file
 * is stamped with `deletedViaParentId = <this folder id>` so restore on the
 * top folder can find the batch. Individual softDeleteFile is *not* marked
 * that way (its `deletedViaParentId` stays null).
 */
export async function softDeleteFolder(
  id: string,
  actorId: string
): Promise<FolderRecord | null> {
  const cur = await prisma.folder.findUnique({ where: { id } })
  if (!cur || cur.ownerId !== actorId) return null
  if (cur.deleted) return await getFolder(id)
  const now = Date.now()
  await prisma.$transaction(async tx => {
    await tx.folder.update({
      where: { id },
      data: { deleted: true, deletedAt: now, updatedAt: now }
    })
    await cascadeMarkDelete(tx, id, id, actorId, now)
  })
  return getFolder(id)
}

async function cascadeMarkDelete(
  tx: Prisma.TransactionClient,
  currentFolderId: string,
  topFolderId: string,
  actorId: string,
  ts: number
) {
  // Mark all live files inside `currentFolderId`.
  await tx.file.updateMany({
    where: { parentId: currentFolderId, deleted: false },
    data: { deleted: true, deletedAt: ts, deletedViaParentId: topFolderId }
  })
  // Recurse into live child folders.
  const kids = await tx.folder.findMany({
    where: { parentId: currentFolderId, deleted: false },
    select: { id: true }
  })
  for (const k of kids) {
    await tx.folder.update({
      where: { id: k.id },
      data: { deleted: true, deletedAt: ts, deletedViaParentId: topFolderId, updatedAt: ts }
    })
    await cascadeMarkDelete(tx, k.id, topFolderId, actorId, ts)
  }
}

/**
 * Restore a folder + its cascade-marked descendants. If the parent folder is
 * still deleted, that's the caller's problem — UI hides restore for cascade
 * children so users only invoke this on the top folder.
 */
export async function restoreFolder(
  id: string,
  actorId: string
): Promise<FolderRecord | null> {
  const cur = await prisma.folder.findUnique({ where: { id } })
  if (!cur || cur.ownerId !== actorId) return null
  if (!cur.deleted) return await getFolder(id)
  await prisma.$transaction(async tx => {
    await tx.folder.update({
      where: { id },
      data: { deleted: false, deletedAt: null, deletedViaParentId: null, updatedAt: Date.now() }
    })
    await cascadeRestore(tx, id)
  })
  return getFolder(id)
}

async function cascadeRestore(tx: Prisma.TransactionClient, topFolderId: string) {
  await tx.file.updateMany({
    where: { deletedViaParentId: topFolderId },
    data: { deleted: false, deletedAt: null, deletedViaParentId: null }
  })
  const kids = await tx.folder.findMany({
    where: { deletedViaParentId: topFolderId },
    select: { id: true }
  })
  for (const k of kids) {
    await tx.folder.update({
      where: { id: k.id },
      data: { deleted: false, deletedAt: null, deletedViaParentId: null }
    })
    await cascadeRestore(tx, k.id).catch(() => undefined)
  }
  // Safety net: descendants of descendants may have their deletedViaParentId
  // pointing at an intermediate folder id. Walk one more level via parentId.
  for (const k of kids) {
    await cascadeRestoreDeep(tx, k.id)
  }
}

async function cascadeRestoreDeep(tx: Prisma.TransactionClient, folderId: string) {
  await tx.file.updateMany({
    where: { parentId: folderId, deleted: true, deletedViaParentId: { not: null } },
    data: { deleted: false, deletedAt: null, deletedViaParentId: null }
  })
  const kids = await tx.folder.findMany({
    where: { parentId: folderId, deleted: true, deletedViaParentId: { not: null } },
    select: { id: true }
  })
  for (const k of kids) {
    await tx.folder.update({
      where: { id: k.id },
      data: { deleted: false, deletedAt: null, deletedViaParentId: null }
    })
    await cascadeRestoreDeep(tx, k.id)
  }
}

/**
 * Purge a folder + its whole subtree (rows + physical bytes). Owner-only.
 * Bytes move to OS trash via storage.removeBlobs (never fs.unlink).
 */
export async function purgeFolder(id: string, actorId: string): Promise<{ folders: number; files: number }> {
  const cur = await prisma.folder.findUnique({ where: { id } })
  if (!cur || cur.ownerId !== actorId) return { folders: 0, files: 0 }
  const folderIds = [id]
  const fileIds: string[] = []
  // BFS collect (rows are already-deleted or not, doesn't matter for purge).
  const stack = [id]
  while (stack.length) {
    const fid = stack.pop()!
    const kids = await prisma.folder.findMany({ where: { parentId: fid }, select: { id: true } })
    for (const k of kids) {
      folderIds.push(k.id)
      stack.push(k.id)
    }
    const files = await prisma.file.findMany({ where: { parentId: fid }, select: { id: true } })
    for (const f of files) fileIds.push(f.id)
  }
  const filesHere = await prisma.file.findMany({ where: { parentId: id }, select: { id: true } })
  for (const f of filesHere) if (!fileIds.includes(f.id)) fileIds.push(f.id)

  let purgedFiles = 0
  for (const fid of fileIds) {
    await removeBlobs(fid).catch(() => undefined)
    const pending = await prisma.file.findUnique({ where: { id: fid }, select: { pendingHtmlPath: true } })
    if (pending?.pendingHtmlPath) await moveToTrash(pending.pendingHtmlPath).catch(() => undefined)
    await prisma.file.delete({ where: { id: fid } }).catch(() => undefined)
    purgedFiles++
  }
  // Delete deepest-first so FK restrict doesn't bite.
  folderIds.sort((a, b) => (a === id ? -1 : b === id ? 1 : 0))
  const order = folderIds.filter(x => x !== id).concat(id)
  for (const fid of order) {
    await prisma.folder.delete({ where: { id: fid } }).catch(() => undefined)
  }
  return { folders: folderIds.length, files: purgedFiles }
}

// ---------------- View queries ----------------

/** 我的云盘: everything the actor owns and has not trashed (root + all folders). */
export async function listDrive(actorId: string): Promise<FileRecord[]> {
  const rows = await prisma.file.findMany({
    where: { ownerId: actorId, deleted: false },
    include: withShares,
    orderBy: { createdAt: 'desc'
    }
  })
  return rows.map(toRecord)
}

/**
 * List direct children (folders + files) of a container. parentId=null ⇒ root.
 * Folders come first (sorted by name asc), then files (also name asc).
 * Used by the v0.4 drive page for the "current folder" view.
 */
export async function listChildren(
  actorId: string,
  parentId: string | null
): Promise<{ folders: FolderRecord[]; files: FileRecord[] }> {
  if (parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parentId } })
    if (!parent || parent.ownerId !== actorId || parent.deleted) {
      return { folders: [], files: [] }
    }
  }
  const owner = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
  const [folderRows, fileRows] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId: actorId, deleted: false, parentId: parentId ?? null },
      orderBy: { name: 'asc' }
    }),
    prisma.file.findMany({
      where: { ownerId: actorId, deleted: false, parentId: parentId ?? null },
      include: withShares,
      orderBy: { name: 'asc' }
    })
  ])
  const counts = folderRows.length
    ? await Promise.all(
        folderRows.map(async f => {
          const [kids, files] = await Promise.all([
            prisma.folder.count({ where: { parentId: f.id, deleted: false } }),
            prisma.file.count({ where: { parentId: f.id, deleted: false } })
          ])
          return { id: f.id, n: kids + files }
        })
      )
    : []
  const cntMap = new Map(counts.map(c => [c.id, c.n]))
  return {
    folders: folderRows.map(f => {
      const r = toFolderRecord(f)
      r.ownerName = owner?.name || ''
      r.childCount = cntMap.get(f.id) || 0
      return r
    }),
    files: fileRows.map(toRecord)
  }
}

/**
 * Breadcrumb from the given folder up to the user's root. Returns an array
 * starting with {id:null, name:'我的云盘'} then each ancestor root-first.
 * Malformed cycles bail out after 64 hops (defensive).
 */
export async function getBreadcrumb(
  actorId: string,
  folderId: string | null
): Promise<Crumb[]> {
  const chain: FolderRow[] = []
  let cursor = folderId
  let hops = 0
  while (cursor && hops++ < 64) {
    const f = await prisma.folder.findUnique({ where: { id: cursor } })
    if (!f || f.ownerId !== actorId || f.deleted) break
    chain.unshift(f)
    cursor = f.parentId
  }
  return [
    { id: null, name: '我的云盘' },
    ...chain.map(f => ({ id: f.id, name: f.name }))
  ]
}

/** 共享给我: documents owned by someone else but shared to the actor. */
export async function listSharedWithMe(actorId: string): Promise<FileRecord[]> {
  const rows = await prisma.file.findMany({
    where: { deleted: false, NOT: { ownerId: actorId }, shares: { some: { userId: actorId } } },
    include: withShares,
    orderBy: { createdAt: 'desc' }
  })
  return rows.map(toRecord)
}

/** 最近打开: accessible (owned or shared) docs with an access stamp. */
export async function listRecent(actorId: string): Promise<FileRecord[]> {
  const rows = await prisma.file.findMany({
    where: {
      deleted: false,
      lastAccessedAt: { not: null },
      OR: [{ ownerId: actorId }, { shares: { some: { userId: actorId } } }]
    },
    include: withShares,
    orderBy: { lastAccessedAt: 'desc' }
  })
  return rows.map(toRecord)
}

/**
 * 回收站: trashed items visible to the actor.
 * v0.4 returns mixed files + folders; UI differentiates by shape. Folders that
 * were cascade-marked (deletedViaParentId != null) are filtered out so we don't
 * show the same "整包" 多次; only the top folder appears as a whole unit.
 */
export async function listTrash(
  actorId: string
): Promise<{ files: FileRecord[]; folders: FolderRecord[] }> {
  const [fileRows, folderRows] = await Promise.all([
    prisma.file.findMany({
      where: {
        deleted: true,
        deletedViaParentId: null,
        OR: [{ ownerId: actorId }, { shares: { some: { userId: actorId } } }]
      },
      include: withShares,
      orderBy: { deletedAt: 'desc' }
    }),
    prisma.folder.findMany({
      where: { deleted: true, deletedViaParentId: null, ownerId: actorId },
      orderBy: { deletedAt: 'desc' }
    })
  ])
  const owner = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
  return {
    files: fileRows.map(toRecord),
    folders: folderRows.map(f => {
      const r = toFolderRecord(f)
      r.ownerName = owner?.name || ''
      return r
    })
  }
}

/** Global title search across everything the actor can access (not trashed). */
export async function searchFiles(actorId: string, q: string): Promise<FileRecord[]> {
  const term = q.trim()
  if (!term) return []
  const rows = await prisma.file.findMany({
    where: {
      deleted: false,
      name: { contains: term },
      OR: [{ ownerId: actorId }, { shares: { some: { userId: actorId } } }]
    },
    include: withShares,
    orderBy: { updatedAt: 'desc' },
    take: 20
  })
  return rows.map(toRecord)
}

// ---------------- File lifecycle ----------------

/** Record an open of the editor/preview for 最近打开. */
export async function touchFile(id: string): Promise<FileRecord | null> {
  const cur = await prisma.file.findUnique({ where: { id } })
  if (!cur) return null
  await prisma.file.update({
    where: { id },
    data: { lastAccessedAt: Date.now(), accessCount: { increment: 1 } }
  })
  return getFile(id)
}

/** Soft delete → recycle bin (owner only). */
export async function softDeleteFile(id: string, actorId: string): Promise<FileRecord | null> {
  const cur = await prisma.file.findUnique({ where: { id } })
  if (!cur) return null
  if (cur.ownerId !== actorId) return null
  if (cur.deleted) return await getFile(id)
  await prisma.file.update({
    where: { id },
    data: { deleted: true, deletedAt: Date.now(), deletedViaParentId: null }
  })
  return getFile(id)
}

/** Restore from recycle bin (owner or a shared viewer). */
export async function restoreFile(id: string, actorId: string): Promise<FileRecord | null> {
  const cur = await prisma.file.findUnique({ where: { id }, include: withShares })
  if (!cur) return null
  const accessible = cur.ownerId === actorId || cur.shares.some(s => s.userId === actorId)
  if (!accessible) return null
  if (!cur.deleted) return toRecord(cur)
  await prisma.file.update({
    where: { id },
    data: { deleted: false, deletedAt: null, deletedViaParentId: null }
  })
  return getFile(id)
}

/** 彻底删除: drop the row AND move physical bytes to the OS trash (owner only). */
export async function purgeFile(id: string, actorId: string): Promise<boolean> {
  const cur = await prisma.file.findUnique({ where: { id } })
  if (!cur || cur.ownerId !== actorId) return false
  await removeBlobs(id).catch(() => undefined)
  await moveToTrash(cur.pendingHtmlPath ?? undefined).catch(() => undefined)
  await prisma.file.delete({ where: { id } })
  return true
}

/** 清空回收站: purge every trashed item (file + folder) the actor owns. */
export async function emptyTrash(actorId: string): Promise<number> {
  const { files, folders } = await listTrash(actorId)
  let n = 0
  for (const f of files) if (f.ownerSubject === actorId && (await purgeFile(f.id, actorId))) n++
  for (const d of folders) {
    const r = await purgeFolder(d.id, actorId)
    n += r.folders
  }
  return n
}

export interface ReapResult {
  folders: number
  files: number
}

/**
 * S14 · 回收站到期自动清理 (system job, cross-owner).
 *
 * Permanently purges any trashed item whose soft-delete clock (`deletedAt`)
 * started before `now - retentionDays`. This is what makes the "回收站保留 30 天
 * 后自动清理 / 剩 X 天" copy we've shown since v0.3 actually true.
 *
 * Design notes:
 * - Only TOP-LEVEL trashed rows are scanned (`deletedViaParentId: null`). A
 *   file/folder that was soft-deleted as part of an ancestor folder's cascade
 *   carries a non-null `deletedViaParentId` and is purged transitively when we
 *   `purgeFolder` its top folder — scanning it separately would double-count.
 * - `purgeFolder` walks the whole subtree by parentId (regardless of each
 *   child's own deletedAt), so an expired top folder reliably sweeps everything
 *   nested inside it.
 * - `purge*` enforce ownership internally; we pass each row's OWN `ownerId` so
 *   the guard is a no-op for this trusted system path (it's not an access check
 *   here, just the shared helper signature).
 * - Physical bytes go to the OS trash via storage.removeBlobs / moveToTrash —
 *   never `fs.unlink` — matching the file-protection policy everywhere else.
 *
 * Returns counts of folders + files purged. Idempotent: a second pass finds
 * nothing past the cutoff until new items age in.
 */
export async function reapExpiredTrash(
  opts: { now?: number; retentionDays?: number } = {}
): Promise<ReapResult> {
  const now = opts.now ?? Date.now()
  const retentionDays = opts.retentionDays ?? 30
  const cutoff = BigInt(now - retentionDays * 24 * 60 * 60 * 1000)

  const [trashedFolders, trashedFiles] = await Promise.all([
    prisma.folder.findMany({
      where: { deleted: true, deletedViaParentId: null, deletedAt: { not: null, lt: cutoff } },
      select: { id: true, ownerId: true }
    }),
    prisma.file.findMany({
      where: { deleted: true, deletedViaParentId: null, deletedAt: { not: null, lt: cutoff } },
      select: { id: true, ownerId: true }
    })
  ])

  let folders = 0
  let files = 0
  // Purge folders first so their cascades swallow nested files before the
  // standalone-file pass (a nested file already has deletedViaParentId set, so
  // it isn't in `trashedFiles` anyway — this ordering is just defensive).
  for (const f of trashedFolders) {
    const r = await purgeFolder(f.id, f.ownerId)
    folders += r.folders
    files += r.files
  }
  for (const fl of trashedFiles) {
    if (await purgeFile(fl.id, fl.ownerId)) files++
  }

  if (folders || files) {
    console.log(
      `[reap] purged ${folders} folder(s), ${files} file(s) older than ${retentionDays}d`
    )
  }
  return { folders, files }
}

/** Set the shared-with viewer roster for a doc (owner only). */
export async function shareFile(
  id: string,
  actorId: string,
  subjectIds: string[]
): Promise<FileRecord | null> {
  const cur = await prisma.file.findUnique({ where: { id } })
  if (!cur || cur.ownerId !== actorId) return null
  await prisma.$transaction(async tx => {
    await syncShares(tx, id, actorId, subjectIds)
    await tx.file.update({ where: { id }, data: { updatedAt: Date.now() } })
  })
  return getFile(id)
}

/** Removes ONLY the DB row (no byte handling). Kept for admin/testing;
 *  the user-facing delete path uses softDeleteFile / purgeFile. */
export async function deleteFileRecord(id: string): Promise<boolean> {
  try {
    await prisma.file.delete({ where: { id } })
    return true
  } catch {
    return false
  }
}

// ---------------- Reachability helpers (used by API routes) ----------------

/** Can this actor read the file (owner or shared viewer)? */
export async function canReadFile(fileId: string, actorId: string): Promise<boolean> {
  const f = await prisma.file.findUnique({
    where: { id: fileId },
    select: { ownerId: true, deleted: true, shares: { where: { userId: actorId }, select: { userId: true } } }
  })
  if (!f) return false
  if (f.ownerId === actorId) return !f.deleted
  return !f.deleted && f.shares.length > 0
}

/** Can this actor read the folder (owner only in v0.4; folder ACL is v0.5)? */
export async function canReadFolder(folderId: string, actorId: string): Promise<boolean> {
  const f = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { ownerId: true, deleted: true }
  })
  if (!f) return false
  return f.ownerId === actorId && !f.deleted
}

/** Flat list of every live folder owned by the actor. Used by the "移动到"
 *  tree picker client-side — depth-capped traversal avoids re-querying. */
export async function listFoldersFlat(actorId: string): Promise<FolderRecord[]> {
  const rows = await prisma.folder.findMany({
    where: { ownerId: actorId, deleted: false },
    orderBy: { name: 'asc' }
  })
  const owner = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } })
  return rows.map(f => {
    const r = toFolderRecord(f)
    r.ownerName = owner?.name || ''
    return r
  })
}

/** Ancestor ids of a folder (root-most first). Returns [] for null / invalid.
 *  Used by the move picker to hide "descendants of self" candidates. */
export async function folderAncestors(actorId: string, folderId: string | null): Promise<string[]> {
  const chain: string[] = []
  let cursor = folderId
  let hops = 0
  while (cursor && hops++ < 64) {
    const f = await prisma.folder.findUnique({ where: { id: cursor }, select: { id: true, parentId: true, ownerId: true, deleted: true } })
    if (!f || f.ownerId !== actorId || f.deleted) break
    chain.unshift(f.id)
    cursor = f.parentId
  }
  return chain
}

/**
 * Actor's storage footprint, split by whether the bytes are "live" (visible
 * in the drive) or parked in the recycle bin. Both buckets count toward quota
 * because trashed files still occupy disk until `purgeFile` / 30-day reap —
 * pretending otherwise would let users game the bar with bulk soft-deletes.
 *
 * Quota defaults to 1 GB per user; override with STORAGE_QUOTA_BYTES (bytes)
 * in .env.local to model paid tiers without a schema change.
 */
const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024 // 1 GB

function readQuota(): number {
  const raw = process.env.STORAGE_QUOTA_BYTES
  if (!raw) return DEFAULT_QUOTA_BYTES
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_QUOTA_BYTES
}

export async function getStorageUsage(actorId: string): Promise<StorageUsage> {
  const [activeAgg, trashAgg] = await Promise.all([
    prisma.file.aggregate({
      where: { ownerId: actorId, deleted: false },
      _sum: { size: true }
    }),
    prisma.file.aggregate({
      where: { ownerId: actorId, deleted: true },
      _sum: { size: true }
    })
  ])
  // SQLite SUM on an empty set returns NULL; Prisma types it as `number | null`.
  const usedActive = Number(activeAgg._sum.size ?? 0)
  const usedTrash = Number(trashAgg._sum.size ?? 0)
  const totalUsed = usedActive + usedTrash
  const quotaBytes = readQuota()
  const ratio = quotaBytes > 0 ? Math.min(1, Math.max(0, totalUsed / quotaBytes)) : 0
  return { usedActive, usedTrash, totalUsed, quotaBytes, ratio }
}
