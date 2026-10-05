// One-time bootstrap for the real user system (runs at most once per process).
//
// Two jobs, both idempotent and guarded by "does any User exist yet?":
//   1. Seed the demo accounts — the primary owner (徐晓溪) plus three colleagues
//      (李四/王五/赵六) — with a shared DEMO_USER_PASSWORD so the drive has
//      collaborators out of the box (共享给我 / read-only previews work).
//   2. Migrate the pre-auth JSON store (data/files.json). Those documents were
//      owned by synthetic personas (demo-alice …). We remap each persona id to the
//      corresponding real user id and re-put every record through the repository,
//      then rename the JSON aside so it never runs twice. Physical bytes and the
//      existing JitWord docIds are untouched — only ownership metadata changes.
//
// Failures are swallowed (logged): the app still boots and works, the demo data
// just may be empty. This keeps a bad JSON file from bricking the whole drive.
import fs from 'node:fs/promises'
import path from 'node:path'
import prisma from './db'
import { DB_FILE } from './paths'
import { hashPassword } from './auth'
import { putFile } from './store'
import { newId } from './id'
import { extensionOf, kindOf } from './filetypes'
import type { FileRecord } from './types'

// persona id (from the old JSON / demo roster) → real account.
const PERSONA: Record<string, { email: string; name: string; color: string }> = {
  'demo-alice': { email: 'alice@jitdrive.dev', name: '徐晓溪', color: '#E64C3D' },
  'demo-bob': { email: 'bob@jitdrive.dev', name: '李四', color: '#3D7EDB' },
  'demo-carol': { email: 'carol@jitdrive.dev', name: '王五', color: '#3EA36B' },
  'demo-dave': { email: 'dave@jitdrive.dev', name: '赵六', color: '#F0A030' }
}

const FALLBACK_SELF = 'demo-alice'
let started: Promise<void> | null = null

export function ensureBootstrap(): Promise<void> {
  if (!started) started = doBootstrap().catch(e => console.error('[bootstrap] skipped:', (e as Error).message))
  return started
}

async function doBootstrap() {
  const existing = await prisma.user.count()
  if (existing === 0) {
    const password = process.env.DEMO_USER_PASSWORD || 'demo1234'
    const passwordHash = hashPassword(password)
    const now = Date.now()

    // persona → real user id
    const idByPersona: Record<string, string> = {}
    for (const [persona, info] of Object.entries(PERSONA)) {
      const u = await prisma.user.create({
        data: { email: info.email, name: info.name, color: info.color, passwordHash, createdAt: now }
      })
      idByPersona[persona] = u.id
    }
    const resolve = (id: string): string => idByPersona[id] || idByPersona[FALLBACK_SELF]
    const nameOf = (id: string): string => PERSONA[id]?.name || '徐晓溪'

    await migrateJson(resolve, nameOf).catch(e => console.error('[bootstrap] json migrate skipped:', (e as Error).message))
    console.log('[bootstrap] demo accounts + migration complete')
  }
  // Always heal the jwSubject column, whether we seeded just now or the DB
  // predates the column addition. Cheap: single null-filtered findMany.
  await backfillJwSubject().catch(e => console.error('[bootstrap] jwSubject backfill skipped:', (e as Error).message))
  // v0.4: put every pre-existing root-level file into a "我的文档（已归档）" folder
  // so the drive page lands on a clean directory tree instead of a wall of files.
  //
  // IMPORTANT — this must be truly one-shot. The `started` memo at the top of
  // this function is module-scoped, so any Next.js dev-mode hot reload of a
  // server file resets it and re-runs doBootstrap(). Without a persistent
  // marker, every reload would sweep the user's *newly uploaded* root files
  // into the archive folder — which is exactly what we saw in dev (uploads
  // made seconds before a hot reload would silently disappear from the drive
  // and reappear inside 我的文档（已归档）).
  await archiveLooseFilesOnce().catch(e =>
    console.error('[bootstrap] archive loose files skipped:', (e as Error).message)
  )
}

const ARCHIVE_FOLDER_NAME = '我的文档（已归档）'
const ARCHIVE_MARKER = path.resolve(process.cwd(), 'data', '.archive-v0.4.done')

/** Reads the on-disk one-shot marker. Returns true if the v0.4 archive
 *  migration has already completed on this data directory. */
async function archiveAlreadyDone(): Promise<boolean> {
  try {
    await fs.access(ARCHIVE_MARKER)
    return true
  } catch {
    return false
  }
}

async function markArchiveDone(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(ARCHIVE_MARKER), { recursive: true })
    await fs.writeFile(ARCHIVE_MARKER, `${new Date().toISOString()}\n`, 'utf8')
  } catch (e) {
    // Non-fatal — worst case we re-run once more next boot.
    console.error('[bootstrap] failed to write archive marker:', (e as Error).message)
  }
}

async function archiveLooseFilesOnce(): Promise<void> {
  if (await archiveAlreadyDone()) return
  await archiveLooseFiles()
  await markArchiveDone()
}

/**
 * One-shot folder archive introduced in v0.4. For each owner that still has
 * loose root-level files, ensure a "我的文档（已归档）" folder exists at their
 * root, then bulk-move all their root-level (parentId=null, !deleted) files
 * under it. Runs after migrateJson so freshly-imported rows are included.
 *
 * Idempotency: the second pass finds zero rows at parentId=null and exits.
 * Trashed rows are skipped (they stay trashed at the root level of their
 * owner's recycle bin, which is folder-agnostic anyway).
 *
 * Collision handling: if a folder named 我的文档（已归档）already exists at
 * root and is not deleted, we reuse it. If it's soft-deleted, we skip the
 * user (their manual organization wins).
 */
async function archiveLooseFiles(): Promise<void> {
  const ownersWithLoose = await prisma.file.groupBy({
    by: ['ownerId'],
    where: { parentId: null, deleted: false },
    _count: { _all: true }
  })
  if (ownersWithLoose.length === 0) return
  for (const g of ownersWithLoose) {
    const ownerId = g.ownerId
    const existing = await prisma.folder.findFirst({
      where: { ownerId, parentId: null, name: ARCHIVE_FOLDER_NAME, deleted: false }
    })
    let folderId: string
    if (existing) {
      folderId = existing.id
    } else {
      const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } })
      const now = Date.now()
      const created = await prisma.folder.create({
        data: {
          id: newId(),
          name: ARCHIVE_FOLDER_NAME,
          ownerId,
          parentId: null,
          createdAt: now,
          updatedAt: now
        }
      })
      folderId = created.id
      void owner // (owner name is not stored on Folder — resolved at read time)
    }
    const res = await prisma.file.updateMany({
      where: { ownerId, parentId: null, deleted: false },
      data: { parentId: folderId }
    })
    if (res.count > 0) {
      console.log(`[bootstrap] archived ${res.count} loose file(s) of ${ownerId} into "${ARCHIVE_FOLDER_NAME}" (${folderId})`)
    }
  }
}

// Reverse-lookup demo persona ids by email so legacy rows (whose owner is now a
// real cuid) can recover the persona id we originally passed to /embed/documents.
// Any File not covered by the persona roster gets its current ownerId — that's
// correct for docs created by real accounts (which is exactly what we sent to
// JitWord at creation time).
async function backfillJwSubject() {
  const missing = await prisma.file.findMany({
    where: { jwSubject: null },
    select: { id: true, ownerId: true }
  })
  if (missing.length === 0) return
  const personaIdByEmail: Record<string, string> = {}
  for (const [persona, info] of Object.entries(PERSONA)) personaIdByEmail[info.email] = persona
  const owners = await prisma.user.findMany({
    where: { id: { in: Array.from(new Set(missing.map(m => m.ownerId))) } },
    select: { id: true, email: true }
  })
  const personaByCuid: Record<string, string> = {}
  for (const u of owners) {
    const pid = personaIdByEmail[u.email]
    if (pid) personaByCuid[u.id] = pid
  }
  for (const m of missing) {
    await prisma.file.update({
      where: { id: m.id },
      data: { jwSubject: personaByCuid[m.ownerId] || m.ownerId }
    })
  }
  console.log(`[bootstrap] backfilled jwSubject on ${missing.length} file(s)`)
}

async function migrateJson(
  resolve: (personaId: string) => string,
  nameOf: (personaId: string) => string
) {
  const raw = await fs.readFile(DB_FILE, 'utf8').catch(() => null)
  if (!raw) return

  const fileCount = await prisma.file.count()
  if (fileCount > 0) {
    // Someone already wrote to the DB — don't double-import; just retire the file.
    await retireJson()
    return
  }

  let records: Partial<FileRecord>[]
  try {
    const parsed = JSON.parse(raw)
    records = Array.isArray(parsed) ? parsed : []
  } catch {
    await retireJson()
    return
  }

  for (const r of records) {
    if (!r || !r.id || !r.docId) continue
    const ownerPersona = r.ownerSubject || FALLBACK_SELF
    const name = r.name || '未命名文档.docx'
    const ext = extensionOf(name) || 'docx'
    const rec: FileRecord = {
      id: r.id,
      name,
      docId: r.docId,
      extension: ext,
      kind: kindOf(name),
      size: r.size ?? 0,
      mime: r.mime || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      parentId: r.parentId ?? null,
      ownerSubject: resolve(ownerPersona),
      ownerName: nameOf(ownerPersona),
      // Preserve the original JitWord-side creator so /embed/tickets keeps
      // authorising us for these legacy docs even though ownerId is now a cuid.
      jwSubject: ownerPersona,
      sharedWith: (r.sharedWith || []).map(resolve),
      createdAt: r.createdAt ?? Date.now(),
      updatedAt: r.updatedAt ?? Date.now(),
      lastEditedAt: r.lastEditedAt,
      deleted: r.deleted ?? false,
      deletedAt: r.deletedAt,
      lastAccessedAt: r.lastAccessedAt,
      accessCount: r.accessCount ?? 0,
      originalPath: r.originalPath,
      pendingHtmlPath: r.pendingHtmlPath,
      pendingImport: r.pendingImport ?? false,
      status: r.status || 'ready',
      category: 'docx'
    }
    await putFile(rec)
  }
  await retireJson()
}

// Rename the JSON aside instead of deleting it (file-protection: nothing destroyed).
async function retireJson() {
  await fs.rename(DB_FILE, `${DB_FILE}.migrated`).catch(() => undefined)
}
