// Server-only share-link layer (v0.5). Public, read-only distribution of a
// file via a short opaque code — no account needed on the visitor side.
//
// Design mirrors lib/auth.ts: framework-free crypto so the whole trust model is
// auditable in one place. Everything here runs on the server (node:crypto +
// next/headers + Prisma). NEVER import this into a 'use client' file.
//
// Two coexisting share channels:
//   ① FileShare roster (login-scoped viewer) — untouched by this module.
//   ② ShareLink (this file) — public /s/[code], optionally password + expiry.
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import prisma from './db'
import { hashPassword, verifyPassword } from './auth'

export const SHARE_COOKIE = 'jw_share'
const UNLOCK_MAX_AGE = 60 * 30 // 30 min, fixed TTL — no sliding renewal.
const CODE_LEN = 8
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

// ---------- short code ----------
// 8-char base62 ≈ 48 bits of entropy (62^8). crypto.randomBytes rejection-sample
// to avoid modulo bias. Collision-retry against the unique index in the caller.
function randomCode(len = CODE_LEN): string {
  const bytes = randomBytes(len * 2)
  let out = ''
  let i = 0
  while (out.length < len && i < bytes.length) {
    const b = bytes[i++]
    if (b < 248) out += BASE62[b % 62] // reject >=248 to keep uniform
  }
  while (out.length < len) out += BASE62[randomBytes(1)[0] % 62]
  return out
}

/** Mint a globally-unique share code, retrying on the (rare) collision. */
export async function newShareCode(retries = 5): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const code = randomCode()
    const exists = await prisma.shareLink.findUnique({ where: { code }, select: { id: true } })
    if (!exists) return code
  }
  throw new Error('share code generation failed (collision)')
}

// ---------- password (optional, per-link) ----------
// Reuse the same scrypt format as user passwords (scrypt:salt:key) but stored on
// ShareLink.passwordHash. Empty / null passwordHash means "link-only, no gate".
export function hashSharePassword(pw: string): string {
  return hashPassword(pw)
}
export function verifySharePassword(pw: string, stored: string | null): boolean {
  if (!stored) return true // no password set → open
  return verifyPassword(pw, stored)
}

// ---------- signed unlock cookie (stateless) ----------
// Value = `code.exp.hmac`. Proves "this browser already entered the password for
// <code>" without a server-side session. HMAC'd with SESSION_SECRET.
function secret(): string {
  return process.env.SESSION_SECRET || 'dev-insecure-session-secret-change-me'
}
function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}
export function signUnlock(code: string): string {
  const exp = Date.now() + UNLOCK_MAX_AGE * 1000
  const payload = `${code}.${exp}`
  return `${payload}.${sign(payload)}`
}
export function verifyUnlock(token: string | undefined | null, forCode: string): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [code, exp, sig] = parts
  if (code !== forCode) return false
  const expect = sign(`${code}.${exp}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  return Number(exp) > Date.now()
}

export function setUnlockCookie(code: string): void {
  cookies().set(SHARE_COOKIE, signUnlock(code), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: UNLOCK_MAX_AGE,
    secure: process.env.NODE_ENV === 'production'
  })
}
export function clearUnlockCookie(): void {
  cookies().set(SHARE_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}
export function isUnlocked(code: string): boolean {
  try {
    return verifyUnlock(cookies().get(SHARE_COOKIE)?.value, code)
  } catch {
    return false
  }
}

// ---------- password brute-force throttle (single-process, in-memory) ----------
// Demo-grade: 5 wrong tries per (ip, code) locks further tries for 15 min.
// Production replacement: Redis / DB with `INCR + EXPIRE`, same interface.
const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 5
const buckets = new Map<string, { fails: number; windowStart: number }>()
function bucketKey(ip: string, code: string) {
  return `${ip}|${code}`
}
export function isLocked(ip: string, code: string): boolean {
  const b = buckets.get(bucketKey(ip, code))
  if (!b) return false
  // Sliding window: if the first fail is older than the window, we reset.
  if (b.windowStart + WINDOW_MS <= Date.now()) {
    buckets.delete(bucketKey(ip, code))
    return false
  }
  return b.fails >= MAX_FAILS
}
export function recordFail(ip: string, code: string): void {
  const k = bucketKey(ip, code)
  const now = Date.now()
  const b = buckets.get(k)
  if (!b || b.windowStart + WINDOW_MS <= now) {
    buckets.set(k, { fails: 1, windowStart: now })
  } else {
    b.fails += 1
  }
}
export function resetFails(ip: string, code: string): void {
  buckets.delete(bucketKey(ip, code))
}
/** Best-effort client IP from proxy headers; falls back to a stable 'unknown'. */
export function clientIp(req: Request): string {
  const h = req.headers
  return (
    h.get('x-forwarded-for')?.split(',')[0].trim() ||
    h.get('x-real-ip') ||
    h.get('cf-connecting-ip') ||
    'unknown'
  )
}

// ---------- repository / DTO ----------
export interface ShareInvitee {
  id: string
  name: string
  color: string
}

export interface ShareLinkView {
  code: string
  /** v0.5.2 · XOR with folderId — exactly one of the two is non-null. */
  fileId: string | null
  folderId: string | null
  /** Relative path the client turns into an absolute URL (origin on the browser). */
  url: string
  hasPassword: boolean
  expiresAt: number | null
  maxViews: number | null
  viewCount: number
  allowDownload: boolean
  revokedAt: number | null
  createdAt: number
  lastViewedAt: number | null
  /** v0.5.1 invite-only allowlist. When non-empty the public gate requires a
   *  logged-in visitor whose userId appears here. */
  invitees: ShareInvitee[]
}

type ShareRow = {
  code: string
  fileId: string | null
  folderId: string | null
  passwordHash: string | null
  expiresAt: bigint | null
  maxViews: number | null
  viewCount: number
  allowDownload: boolean
  revokedAt: bigint | null
  createdAt: bigint
  lastViewedAt: bigint | null
  invitees?: { user: { id: string; name: string; color: string } }[]
}

function toView(r: ShareRow): ShareLinkView {
  return {
    code: r.code,
    fileId: r.fileId,
    folderId: r.folderId,
    url: `/s/${r.code}`,
    hasPassword: !!r.passwordHash,
    expiresAt: r.expiresAt == null ? null : Number(r.expiresAt),
    maxViews: r.maxViews,
    viewCount: r.viewCount,
    allowDownload: r.allowDownload,
    revokedAt: r.revokedAt == null ? null : Number(r.revokedAt),
    createdAt: Number(r.createdAt),
    lastViewedAt: r.lastViewedAt == null ? null : Number(r.lastViewedAt),
    invitees: (r.invitees || []).map(row => ({
      id: row.user.id,
      name: row.user.name,
      color: row.user.color
    }))
  }
}

const PUBLIC_INCLUDE = {
  invitees: { select: { user: { select: { id: true, name: true, color: true } } }, take: 100 }
} as const

export type ShareStatus =
  | 'ok'
  | 'not-found'
  | 'revoked'
  | 'expired'
  | 'view-limit'
  | 'file-gone'
  | 'folder-gone'

export interface CreateLinkInput {
  /** v0.5.2 · XOR with folderId. Both present or both missing → throws. */
  fileId?: string | null
  folderId?: string | null
  createdBy: string
  password?: string | null
  expiresAt?: number | null
  maxViews?: number | null
  allowDownload?: boolean
  /** v0.5.1 invite-only allowlist. Non-empty ⇒ this link becomes a
   *  login-required + whitelist-gated share (mutually exclusive with
   *  `password`; callers should validate before invoking). Duplicates are
   *  dropped server-side. */
  inviteeIds?: string[]
}

export async function createShareLink(input: CreateLinkInput): Promise<ShareLinkView> {
  const hasFile = !!input.fileId
  const hasFolder = !!input.folderId
  if (hasFile === hasFolder) {
    // Both set or both unset → invalid. Kept at the app layer (not a DB CHECK)
    // because SQLite's ALTER TABLE doesn't add constraints cleanly and we
    // don't want the migration surface for a semantic-only invariant.
    throw new Error('SHARE_TARGET_XOR: exactly one of fileId / folderId must be set')
  }
  const code = await newShareCode()
  const now = Date.now()
  const inviteeIds = Array.from(new Set((input.inviteeIds || []).filter(Boolean)))
  const row = await prisma.$transaction(async tx => {
    const created = await tx.shareLink.create({
      data: {
        code,
        fileId: input.fileId ?? null,
        folderId: input.folderId ?? null,
        createdBy: input.createdBy,
        passwordHash: input.password ? hashSharePassword(input.password) : null,
        expiresAt: input.expiresAt == null ? null : BigInt(input.expiresAt),
        maxViews: input.maxViews == null ? null : input.maxViews,
        allowDownload: input.allowDownload ?? true,
        createdAt: BigInt(now)
      }
    })
    if (inviteeIds.length) {
      // SQLite's Prisma driver doesn't support `createMany.skipDuplicates`,
      // but `inviteeIds` is deduped above and the parent link was just
      // created so the composite PK (linkId,userId) can't collide here.
      await tx.shareLinkUser.createMany({
        data: inviteeIds.map(userId => ({ linkId: created.id, userId, createdAt: BigInt(now) }))
      })
    }
    return tx.shareLink.findUnique({ where: { id: created.id }, include: PUBLIC_INCLUDE })
  })
  return toView(row as ShareRow)
}

/** Active (non-revoked) links for a file, newest first. */
export async function listShareLinksByFile(fileId: string): Promise<ShareLinkView[]> {
  const rows = await prisma.shareLink.findMany({
    where: { fileId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    include: PUBLIC_INCLUDE
  })
  return rows.map(toView)
}

/** v0.5.2 · Active (non-revoked) links for a folder, newest first. */
export async function listShareLinksByFolder(folderId: string): Promise<ShareLinkView[]> {
  const rows = await prisma.shareLink.findMany({
    where: { folderId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
    include: PUBLIC_INCLUDE
  })
  return rows.map(toView)
}

/** Owner-scoped: find one link by code, verify the caller owns the parent
 *  file OR folder. Returns null on missing / foreign — handlers turn this
 *  into 404 (never 403) to prevent link-code enumeration. */
export async function getShareLinkForOwner(
  code: string,
  actorId: string
): Promise<(ShareLinkView & { id: string }) | null> {
  const row = await prisma.shareLink.findUnique({
    where: { code },
    include: {
      ...PUBLIC_INCLUDE,
      file: { select: { ownerId: true } },
      folder: { select: { ownerId: true } }
    }
  })
  if (!row) return null
  const owner = row.file?.ownerId ?? row.folder?.ownerId
  if (!owner || owner !== actorId) return null
  return { ...toView(row), id: row.id }
}

export interface UpdateLinkInput {
  password?: string | null
  /** Explicit null clears the password gate. */
  clearPassword?: boolean
  expiresAt?: number | null
  clearExpires?: boolean
  maxViews?: number | null
  clearMaxViews?: boolean
  allowDownload?: boolean
  /** v0.5.3 · S5 invite-only roster edit. Presence of this key (even an empty
   *  array) means "replace the whole allowlist". Omit it to leave the roster
   *  untouched. Ids that don't resolve to a real user are dropped server-side
   *  so a tampered payload can't seed phantom invitees. */
  inviteeIds?: string[]
}

export async function updateShareLink(id: string, patch: UpdateLinkInput): Promise<ShareLinkView> {
  const data: Record<string, unknown> = {}
  if (patch.clearPassword) data.passwordHash = null
  else if (patch.password) data.passwordHash = hashSharePassword(patch.password)
  if (patch.clearExpires) data.expiresAt = null
  else if (patch.expiresAt != null) data.expiresAt = BigInt(patch.expiresAt)
  if (patch.clearMaxViews) data.maxViews = null
  else if (patch.maxViews != null) data.maxViews = patch.maxViews
  if (patch.allowDownload != null) data.allowDownload = patch.allowDownload

  // Roster untouched → plain scalar update (unchanged v0.5.2 path).
  if (patch.inviteeIds === undefined) {
    const row = await prisma.shareLink.update({ where: { id }, data, include: PUBLIC_INCLUDE })
    return toView(row)
  }

  // Roster replace: scalar update + deleteMany + createMany in one tx so a
  // half-applied whitelist can never be observed. Requested ids are first
  // intersected with real users; duplicates dropped.
  const requested = Array.from(new Set(patch.inviteeIds.filter(Boolean)))
  const existingUsers = requested.length
    ? await prisma.user.findMany({ where: { id: { in: requested } }, select: { id: true } })
    : []
  const validIds = existingUsers.map(u => u.id)
  const now = BigInt(Date.now())

  const row = await prisma.$transaction(async tx => {
    await tx.shareLink.update({ where: { id }, data })
    await tx.shareLinkUser.deleteMany({ where: { linkId: id } })
    if (validIds.length) {
      await tx.shareLinkUser.createMany({
        data: validIds.map(userId => ({ linkId: id, userId, createdAt: now }))
      })
    }
    return tx.shareLink.findUnique({ where: { id }, include: PUBLIC_INCLUDE })
  })
  return toView(row as ShareRow)
}

export async function revokeShareLink(id: string): Promise<void> {
  await prisma.shareLink.update({ where: { id }, data: { revokedAt: BigInt(Date.now()) } })
}

// ---------- v0.5.3 · S3 owner share dashboard ----------

export interface MyShareLink extends ShareLinkView {
  id: string
  /** Which entity this link points to (file or folder) — XOR guaranteed. */
  targetKind: 'file' | 'folder'
  targetId: string
  targetName: string
  /** Total granular views from the S2 ShareView table; falls back to the
   *  denormalized gate counter for links created before S2 so the dashboard
   *  never under-reports legacy traffic. */
  viewTotal: number
}

type MyShareRow = ShareRow & {
  id: string
  file: { id: string; name: string } | null
  folder: { id: string; name: string } | null
  _count?: { views: number }
}

function toMyShare(r: MyShareRow): MyShareLink {
  const view = toView(r)
  const target = r.file ?? r.folder
  return {
    ...view,
    id: r.id,
    targetKind: r.file ? 'file' : 'folder',
    targetId: target?.id ?? '',
    targetName: target?.name ?? '（内容已删除）',
    viewTotal: Math.max(view.viewCount, r._count?.views ?? 0)
  }
}

/** All share links the actor owns (through their file OR folder), newest first.
 *  Revoked links are hidden unless `includeRevoked`. */
export async function listMyShareLinks(
  actorId: string,
  opts: { includeRevoked?: boolean } = {}
): Promise<MyShareLink[]> {
  const rows = await prisma.shareLink.findMany({
    where: {
      ...(opts.includeRevoked ? {} : { revokedAt: null }),
      OR: [{ file: { ownerId: actorId } }, { folder: { ownerId: actorId } }]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      ...PUBLIC_INCLUDE,
      file: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      _count: { select: { views: true } }
    }
  })
  return (rows as unknown as MyShareRow[]).map(toMyShare)
}

/** Soft-revoke every still-active link the actor owns. Returns how many were
 *  flipped. Powers the dashboard's "撤销全部". */
export async function revokeAllMyShareLinks(actorId: string): Promise<number> {
  const res = await prisma.shareLink.updateMany({
    where: {
      revokedAt: null,
      OR: [{ file: { ownerId: actorId } }, { folder: { ownerId: actorId } }]
    },
    data: { revokedAt: BigInt(Date.now()) }
  })
  return res.count
}

/** Public lookup by code — no ownership filter. Includes parent file OR folder
 *  basics AND the invitee allowlist so `authorizePublic` can gate invite-only
 *  links with a single query. Kept `file` nullable + `folder` nullable to
 *  mirror the XOR at the row level; downstream gate code narrows via `kind`. */
export async function getShareLinkPublic(code: string) {
  const row = await prisma.shareLink.findUnique({
    where: { code },
    include: {
      ...PUBLIC_INCLUDE,
      file: {
        select: {
          id: true,
          name: true,
          extension: true,
          mime: true,
          size: true,
          docId: true,
          jwSubject: true,
          ownerId: true,
          deleted: true,
          owner: { select: { name: true } }
        }
      },
      folder: {
        select: {
          id: true,
          name: true,
          ownerId: true,
          deleted: true,
          owner: { select: { name: true } }
        }
      }
    }
  })
  if (!row) return null
  return {
    link: toView(row),
    id: row.id,
    passwordHash: row.passwordHash,
    file: row.file,
    folder: row.folder
  }
}

/** Visitor context captured on a successful view (S2). Server-side only; ip /
 *  ua / referrer are stored for risk/audit and deliberately not shown in owner
 *  UI. userId is set for invite-only (logged-in) visitors, null when anonymous. */
export interface ViewMeta {
  userId?: string | null
  ip?: string | null
  ua?: string | null
  referrer?: string | null
}

/** Count a view. Called only on a successful /s/[code] render, not on raw/ticket.
 *  v0.5.3 · S2 also drops a granular `ShareView` row in the same transaction so
 *  the O(1) `viewCount` gate column and the audit detail never drift apart. */
export async function recordView(id: string, meta: ViewMeta = {}): Promise<void> {
  const now = BigInt(Date.now())
  await prisma.$transaction([
    prisma.shareLink.update({
      where: { id },
      data: { viewCount: { increment: 1 }, lastViewedAt: now }
    }),
    prisma.shareView.create({
      data: {
        linkId: id,
        userId: meta.userId || null,
        ip: meta.ip || null,
        ua: meta.ua || null,
        referrer: meta.referrer || null,
        ts: now
      }
    })
  ])
}

/** v0.5.3 · S2 owner-facing aggregate stats for one link. Derived purely from
 *  the ShareView detail table (source of truth for analytics), independent of
 *  the denormalized gate counter. `uniqueLogins` counts distinct logged-in
 *  visitors (invite-only traffic); anonymous views collapse to one signal via
 *  `total`. */
export async function getShareViewStats(linkId: string): Promise<{
  total: number
  lastViewedAt: number | null
  uniqueLogins: number
}> {
  const [total, last, distinct] = await Promise.all([
    prisma.shareView.count({ where: { linkId } }),
    prisma.shareView.findFirst({
      where: { linkId },
      orderBy: { ts: 'desc' },
      select: { ts: true }
    }),
    prisma.shareView.findMany({
      where: { linkId, userId: { not: null } },
      distinct: ['userId'],
      select: { userId: true }
    })
  ])
  return {
    total,
    lastViewedAt: last ? Number(last.ts) : null,
    uniqueLogins: distinct.length
  }
}

/** Gate used by every public endpoint. Password unlock is checked separately.
 *  `target` narrows to whichever of {file, folder} the link points to. */
export function evaluateShare(
  link: ShareLinkView,
  target: { deleted: boolean }
): ShareStatus {
  if (target.deleted) return link.fileId ? 'file-gone' : 'folder-gone'
  if (link.revokedAt != null) return 'revoked'
  if (link.expiresAt != null && link.expiresAt < Date.now()) return 'expired'
  if (link.maxViews != null && link.viewCount >= link.maxViews) return 'view-limit'
  return 'ok'
}

// ---------- public-endpoint gate ----------
// Every /api/share/[code]/* handler funnels through `authorizePublic` so the
// rejection branches (not-found / revoked / expired / view-limit / file-gone /
// folder-gone) and the password-unlock branch stay in one place. Handlers then
// only decide the shape of their success payload.

export interface PublicFileRow {
  id: string
  name: string
  extension: string
  mime: string
  size: number
  docId: string | null
  jwSubject: string | null
  ownerId: string
  deleted: boolean
  owner: { name: string }
}

export interface PublicFolderRow {
  id: string
  name: string
  ownerId: string
  deleted: boolean
  owner: { name: string }
}

export type PublicGateOk =
  /** File-scoped link. Kept the exact shape (no `kind` tag) v0.5 consumers
   *  relied on, so the /api/share/[code]/raw route didn't need any change.
   *  `kind` is added as an optional tag for folder-aware routes. */
  | {
      ok: true
      kind: 'file'
      id: string
      link: ShareLinkView
      file: PublicFileRow
      unlocked: boolean
    }
  | {
      ok: true
      kind: 'folder'
      id: string
      link: ShareLinkView
      folder: PublicFolderRow
      unlocked: boolean
    }

export type PublicGateErr = {
  ok: false
  /** HTTP status to bubble up. */
  status: number
  /** Machine-readable tag the UI uses to pick the right message. */
  reason:
    | 'not-found'
    | 'revoked'
    | 'expired'
    | 'view-limit'
    | 'file-gone'
    | 'folder-gone'
    | 'need-login'
    | 'not-invited'
  message: string
}

/** Gate a public share request.
 *
 *  Pass the current `viewerUserId` (from `getSessionUserId()` on the server) so
 *  invite-only links — those with ≥1 ShareLinkUser row — can enforce login +
 *  membership. When the link has no allowlist the argument is ignored, keeping
 *  the "fully anonymous" path byte-identical to v0.5. The target's owner is
 *  always treated as invited so they can preview their own link without
 *  adding themselves to the list.
 *
 *  v0.5.2 · Folder links return a `kind:'folder'` arm; file links return
 *  `kind:'file'` — everything else (revoked / expired / view-limit / unlock
 *  cookie / invite-only whitelist) is identical between the two arms. */
export async function authorizePublic(
  code: string,
  viewerUserId: string | null = null
): Promise<PublicGateOk | PublicGateErr> {
  const row = await getShareLinkPublic(code)
  if (!row) {
    return { ok: false, status: 404, reason: 'not-found', message: '分享链接不存在' }
  }
  // XOR was enforced at creation; the row should always have exactly one.
  // Defensive fallback: treat a link with neither side set as revoked.
  const target = row.file ?? row.folder
  if (!target) {
    return { ok: false, status: 410, reason: 'revoked', message: '该分享链接已失效' }
  }
  const status = evaluateShare(row.link, target)
  if (status === 'revoked') {
    return { ok: false, status: 410, reason: 'revoked', message: '该分享链接已被撤销' }
  }
  if (status === 'expired') {
    return { ok: false, status: 410, reason: 'expired', message: '该分享链接已过期' }
  }
  if (status === 'view-limit') {
    return { ok: false, status: 410, reason: 'view-limit', message: '该分享链接访问次数已用完' }
  }
  if (status === 'file-gone') {
    // File moved to trash — behave as revoked (410) without leaking owner state.
    return { ok: false, status: 410, reason: 'file-gone', message: '文件已不可用' }
  }
  if (status === 'folder-gone') {
    return { ok: false, status: 410, reason: 'folder-gone', message: '目录已不可用' }
  }
  const targetOwnerId = target.ownerId
  // v0.5.1 invite-only branch. Non-empty allowlist ⇒ login required + member.
  if (row.link.invitees.length > 0) {
    if (!viewerUserId) {
      return { ok: false, status: 401, reason: 'need-login', message: '此分享仅对指定用户可见，请先登录' }
    }
    const isOwner = viewerUserId === targetOwnerId
    const isInvited = row.link.invitees.some(u => u.id === viewerUserId)
    if (!isOwner && !isInvited) {
      return { ok: false, status: 403, reason: 'not-invited', message: '分享者未把你加入可见名单' }
    }
    // Invite-only fully replaces the password gate — treat as unlocked.
    if (row.file) {
      return { ok: true, kind: 'file', id: row.id, link: row.link, file: row.file, unlocked: true }
    }
    return { ok: true, kind: 'folder', id: row.id, link: row.link, folder: row.folder!, unlocked: true }
  }
  const unlocked = !row.link.hasPassword || isUnlocked(code)
  if (row.file) {
    return { ok: true, kind: 'file', id: row.id, link: row.link, file: row.file, unlocked }
  }
  return { ok: true, kind: 'folder', id: row.id, link: row.link, folder: row.folder!, unlocked }
}

// ---------- v0.5.2 folder-subtree helpers ----------
// A folder-scoped link recursively covers its whole subtree at view time — no
// snapshot. When an anonymous visitor asks to stream a specific file
// (`/api/share/[code]/raw?fileId=…`), we need to verify the file is genuinely
// a descendant of the shared folder. Same goes for folder browsing: given the
// link's root folder and a sub folderId, prove the sub folder is inside.

/** Walk a file's parent-folder chain upward; return true if we hit `rootId`
 *  before reaching null. Stops at 64 hops defensively against cycles (v0.4's
 *  moveFolder already rejects cycles, so this is just belt-and-braces).
 *  Returns false when the file is missing / soft-deleted / not owned by the
 *  folder's owner (defensive: cross-tenant links can't leak). */
export async function folderSubtreeHasFile(
  rootId: string,
  fileId: string
): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { parentId: true, deleted: true }
  })
  if (!file || file.deleted) return false
  let cursor = file.parentId
  let hops = 0
  while (cursor && hops++ < 64) {
    if (cursor === rootId) return true
    const parent = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { parentId: true, deleted: true }
    })
    if (!parent || parent.deleted) return false
    cursor = parent.parentId
  }
  return false
}

/** Same as folderSubtreeHasFile but for a sub-folder target — walks parent
 *  chain from `subId` up to see if we hit `rootId`. `subId === rootId` is
 *  considered inside (self). */
export async function folderSubtreeHasFolder(
  rootId: string,
  subId: string
): Promise<boolean> {
  if (rootId === subId) return true
  let cursor: string | null = subId
  let hops = 0
  while (cursor && hops++ < 64) {
    const cur: { parentId: string | null; deleted: boolean } | null = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { parentId: true, deleted: true }
    })
    if (!cur || cur.deleted) return false
    if (cur.parentId === rootId) return true
    cursor = cur.parentId
  }
  return false
}

/** Fields we care about for a "public" folder row — deliberately excludes
 *  ownerId / createdAt etc. so if a caller dumps the response nothing extra
 *  leaks. */
const PUBLIC_FOLDER_CHILD_SELECT = {
  id: true,
  name: true
} as const

const PUBLIC_FILE_CHILD_SELECT = {
  id: true,
  name: true,
  extension: true,
  size: true,
  mime: true,
  docId: true
} as const

/** List the immediate children (sub-folders + files) of a folder inside a
 *  shared tree. Callers must first ensure `folderId` is inside the link root
 *  via `folderSubtreeHasFolder`. Deleted items are filtered out.
 *
 *  Kept owner-agnostic (no owner check) because the link's owner is already
 *  the effective owner here; the folderId being inside the shared subtree is
 *  the trust anchor. */
export async function listPublicFolderChildren(
  folderId: string
): Promise<{ folders: { id: string; name: string }[]; files: { id: string; name: string; extension: string; size: number; mime: string; docId: string | null }[] }> {
  const [folderRows, fileRows] = await Promise.all([
    prisma.folder.findMany({
      where: { parentId: folderId, deleted: false },
      select: PUBLIC_FOLDER_CHILD_SELECT,
      orderBy: { name: 'asc' }
    }),
    prisma.file.findMany({
      where: { parentId: folderId, deleted: false },
      select: PUBLIC_FILE_CHILD_SELECT,
      orderBy: { name: 'asc' }
    })
  ])
  return { folders: folderRows, files: fileRows }
}

/** Get a minimal folder row for the anonymous landing page — name + owner
 *  name + soft-delete state. Callers already know the folderId is the link's
 *  root or inside its subtree. */
export async function getPublicFolderInfo(folderId: string): Promise<{
  id: string
  name: string
  parentId: string | null
  deleted: boolean
  ownerName: string
} | null> {
  const f = await prisma.folder.findUnique({
    where: { id: folderId },
    select: {
      id: true,
      name: true,
      parentId: true,
      deleted: true,
      owner: { select: { name: true } }
    }
  })
  if (!f) return null
  return {
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    deleted: f.deleted,
    ownerName: f.owner.name
  }
}

/** Walk up from a sub folder inside a shared tree back to the link root, so
 *  the anonymous folder-browse UI can render a breadcrumb. Returns root-first
 *  chain EXCLUDING the shared root (the root itself is displayed separately
 *  via the link's folder-name). Stops at 64 hops. */
export async function breadcrumbWithinShare(
  rootId: string,
  currentId: string
): Promise<{ id: string; name: string }[]> {
  const chain: { id: string; name: string }[] = []
  let cursor: string | null = currentId
  let hops = 0
  while (cursor && hops++ < 64) {
    if (cursor === rootId) break
    const f: { id: string; name: string; parentId: string | null; deleted: boolean } | null =
      await prisma.folder.findUnique({
        where: { id: cursor },
        select: { id: true, name: true, parentId: true, deleted: true }
      })
    if (!f || f.deleted) break
    chain.unshift({ id: f.id, name: f.name })
    cursor = f.parentId
  }
  return chain
}

/** Minimal file row for the folder-scoped file preview page — same shape as
 *  what `getShareLinkPublic` returns for a file-link, so the render code can
 *  be shared. Returns null if the file is missing. */
export async function getPublicFileRow(fileId: string): Promise<PublicFileRow | null> {
  const f = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      extension: true,
      mime: true,
      size: true,
      docId: true,
      jwSubject: true,
      ownerId: true,
      deleted: true,
      owner: { select: { name: true } }
    }
  })
  return f
}
