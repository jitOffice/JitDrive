import { NextResponse } from 'next/server'
import { getFolder } from '@/lib/store'
import { getActorId } from '@/lib/users'
import { userExists } from '@/lib/auth'
import { createShareLink, listShareLinksByFolder } from '@/lib/share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// v0.5.2 · Owner-side management of folder-scoped public share links.
// Sibling to /api/files/[id]/share-links — same shape, but the link's target
// is a Folder row and the anonymous landing page recursively covers the whole
// subtree (dynamic membership, no snapshot).
//
// Semantics inherited from files:
//   · Password / expiresAt / maxViews / allowDownload / inviteeIds (XOR with
//     password) all behave identically.
//   · Revoked / deleted folders short-circuit through `authorizePublic` — no
//     special-case here.
//   · Only the folder's owner can mint / list / mutate its links. Foreign
//     actor → 403 (mirrors the file-scoped handler).

function badRequest(message: string) {
  return NextResponse.json({ code: 400, message }, { status: 400 })
}

async function requireOwner(
  id: string
): Promise<
  | { ok: true; rec: NonNullable<Awaited<ReturnType<typeof getFolder>>>; actor: string }
  | { ok: false; res: NextResponse }
> {
  const actor = getActorId()
  if (!actor) {
    return { ok: false, res: NextResponse.json({ code: 401, message: '未登录' }, { status: 401 }) }
  }
  const rec = await getFolder(id)
  if (!rec) {
    return { ok: false, res: NextResponse.json({ code: 404, message: 'folder not found' }, { status: 404 }) }
  }
  if (rec.ownerId !== actor) {
    return {
      ok: false,
      res: NextResponse.json({ code: 403, message: '仅所有者可管理目录分享链接' }, { status: 403 })
    }
  }
  return { ok: true, rec, actor }
}

/** POST /api/folders/[id]/share-links → mint a new link (owner only).
 *  Body (all optional): { password?, expiresAt?, maxViews?, allowDownload?, inviteeIds? }
 *  inviteeIds non-empty ⇒ invite-only (login required + whitelist), mutually
 *  exclusive with password. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const gate = await requireOwner(ctx.params.id)
  if (!gate.ok) return gate.res
  if (gate.rec.deleted) return badRequest('目录在回收站中，无法分享')

  let body: Record<string, unknown> = {}
  try {
    const parsed = await req.json()
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    return badRequest('invalid json')
  }

  let password: string | null = null
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 4) return badRequest('密码至少 4 位')
    if (body.password.length > 64) return badRequest('密码过长')
    password = body.password
  } else if (body.password !== undefined && body.password !== null && body.password !== '') {
    return badRequest('password 需为字符串')
  }

  let expiresAt: number | null = null
  if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const n = body.expiresAt
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return badRequest('expiresAt 需为正数毫秒时间戳')
    if (n <= Date.now()) return badRequest('过期时间必须在未来')
    expiresAt = Math.floor(n)
  }

  let maxViews: number | null = null
  if (body.maxViews !== undefined && body.maxViews !== null) {
    const n = body.maxViews
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 10000) {
      return badRequest('maxViews 需为 1–10000 的整数')
    }
    maxViews = n
  }

  let allowDownload = true
  if (typeof body.allowDownload === 'boolean') allowDownload = body.allowDownload
  else if (body.allowDownload !== undefined) return badRequest('allowDownload 需为布尔值')

  let inviteeIds: string[] = []
  if (body.inviteeIds !== undefined && body.inviteeIds !== null) {
    if (!Array.isArray(body.inviteeIds)) return badRequest('inviteeIds 需为字符串数组')
    const arr = body.inviteeIds as unknown[]
    if (arr.some(x => typeof x !== 'string' || !(x as string).trim())) {
      return badRequest('inviteeIds 中存在非法项')
    }
    const deduped = Array.from(new Set(arr.map(x => (x as string).trim())))
    if (deduped.length > 100) return badRequest('可见名单最多 100 人')
    inviteeIds = deduped
  }
  if (inviteeIds.length > 0 && password) {
    return badRequest('「仅指定用户」和「密码保护」不能同时启用')
  }
  for (const uid of inviteeIds) {
    if (!(await userExists(uid))) {
      return badRequest(`用户不存在：${uid}`)
    }
  }

  const view = await createShareLink({
    folderId: gate.rec.id,
    createdBy: gate.actor,
    password,
    expiresAt,
    maxViews,
    allowDownload,
    inviteeIds
  })
  return NextResponse.json({ code: 200, data: view })
}

/** GET /api/folders/[id]/share-links → list active links for this folder. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const gate = await requireOwner(ctx.params.id)
  if (!gate.ok) return gate.res
  const items = await listShareLinksByFolder(gate.rec.id)
  return NextResponse.json({ code: 200, data: { items } })
}
