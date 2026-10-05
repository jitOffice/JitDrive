// Server-only auth layer: password hashing, a signed (stateless) session cookie,
// invite-code redemption, and thin user lookups over Prisma.
//
// Deliberately framework-free (no next-auth) so the whole trust model is auditable
// in one file. The cookie stores `userId.exp.hmac` — verified with SESSION_SECRET,
// no DB round-trip needed to read "who am I". Swapping to a session table or JWT
// later only touches this module.
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { cookies } from 'next/headers'
import { Prisma, type User } from '@prisma/client'
import prisma from './db'
import type { ActorUser } from './types'

export const SESSION_COOKIE = 'jw_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const SCRYPT_KEYLEN = 64
const COLORS = ['#E64C3D', '#3D7EDB', '#3EA36B', '#F0A030', '#8B5CF6', '#0EA5E9', '#EC4899', '#14B8A6']

class AuthError extends Error {}

// ---------- passwords ----------
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  const key = scryptSync(pw, salt, SCRYPT_KEYLEN).toString('hex')
  return `scrypt:${salt}:${key}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [scheme, salt, key] = stored.split(':')
    if (scheme !== 'scrypt') return false
    const cand = scryptSync(pw, salt, SCRYPT_KEYLEN)
    const ref = Buffer.from(key, 'hex')
    return cand.length === ref.length && timingSafeEqual(cand, ref)
  } catch {
    return false
  }
}

// ---------- signed session token ----------
function secret(): string {
  return process.env.SESSION_SECRET || 'dev-insecure-session-secret-change-me'
}
function hmac(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}
export function signToken(userId: string): string {
  const exp = Date.now() + SESSION_MAX_AGE * 1000
  const payload = `${userId}.${exp}`
  return `${payload}.${hmac(payload)}`
}
export function verifyToken(token: string | undefined | null): string | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, exp, sig] = parts
  const expect = hmac(`${userId}.${exp}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (Number(exp) < Date.now()) return null
  return userId || null
}

// ---------- cookie helpers (request-scoped) ----------
export function getSessionUserId(): string | null {
  try {
    return verifyToken(cookies().get(SESSION_COOKIE)?.value)
  } catch {
    return null
  }
}
export function setSessionCookie(userId: string): void {
  cookies().set(SESSION_COOKIE, signToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === 'production'
  })
}
export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

// ---------- lookups ----------
export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase()
}
export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
}

export async function getCurrentUser(): Promise<User | null> {
  const id = getSessionUserId()
  if (!id) return null
  return prisma.user.findUnique({ where: { id } })
}

export async function listShareableUsers(
  excludeId?: string,
  opts: { keyword?: string; limit?: number } = {}
): Promise<ActorUser[]> {
  const { keyword, limit = 50 } = opts
  const kw = (keyword || '').trim()
  const where: Prisma.UserWhereInput = {}
  if (excludeId) where.id = { not: excludeId }
  // SQLite LIKE is case-insensitive for ASCII; CJK has no case to fold. One
  // `contains` OR-group covers both display name and email without needing
  // Postgres' `mode: 'insensitive'`.
  if (kw) {
    where.OR = [{ name: { contains: kw } }, { email: { contains: kw } }]
  }
  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: limit
  })
  return rows.map(u => ({ id: u.id, name: u.name, color: u.color, email: u.email }))
}

export async function userExists(id: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  return !!u
}

// ---------- invite codes ----------
function masterInviteCodes(): string[] {
  return (process.env.DEMO_INVITE_CODE || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
}

/** Returns an error string, or null on success. Master codes never get consumed. */
async function redeemInvite(tx: Prisma.TransactionClient, code: string, userId: string): Promise<string | null> {
  const upper = (code || '').trim().toUpperCase()
  if (!upper) return '请填写邀请码'
  if (masterInviteCodes().includes(upper)) return null
  const inv = await tx.inviteCode.findUnique({ where: { code: upper } })
  if (!inv) return '邀请码无效'
  if (inv.usedById) return '邀请码已被使用'
  await tx.inviteCode.update({ where: { code: upper }, data: { usedById: userId } })
  return null
}

export function generateInviteCode(): string {
  const raw = randomBytes(6).toString('hex').toUpperCase()
  return `JW-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

/** Mint a fresh single-use invite code for a logged-in user to share. */
export async function createInviteCode(byUserId: string): Promise<string> {
  const code = generateInviteCode()
  await prisma.inviteCode.create({ data: { code, createdAt: Date.now(), createdById: byUserId } })
  return code
}

export async function listMyInviteCodes(byUserId: string) {
  return prisma.inviteCode.findMany({
    where: { createdById: byUserId },
    orderBy: { createdAt: 'desc' },
    select: { code: true, usedById: true, createdAt: true }
  })
}

// ---------- register / login ----------
export type AuthResult = { ok: true; user: User } | { ok: false; error: string }

export async function registerUser(input: {
  email: string
  password: string
  name?: string
  inviteCode: string
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email)
  if (!validEmail(email)) return { ok: false, error: '邮箱格式不正确' }
  if ((input.password || '').length < 6) return { ok: false, error: '密码至少 6 位' }
  const name = (input.name || '').trim() || email.split('@')[0]

  try {
    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          email,
          name,
          passwordHash: hashPassword(input.password),
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          createdAt: Date.now()
        }
      })
      const err = await redeemInvite(tx, input.inviteCode, created.id)
      if (err) throw new AuthError(err)
      return created
    })
    return { ok: true, user }
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message }
    const code = (e as { code?: string })?.code
    if (code === 'P2002') return { ok: false, error: '该邮箱已注册' }
    return { ok: false, error: '注册失败，请重试' }
  }
}

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const u = await findUserByEmail(email)
  if (!u || !verifyPassword(password || '', u.passwordHash)) {
    return { ok: false, error: '邮箱或密码错误' }
  }
  return { ok: true, user: u }
}
