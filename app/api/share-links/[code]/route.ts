import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import {
  getShareLinkForOwner,
  updateShareLink,
  revokeShareLink,
  type UpdateLinkInput
} from '@/lib/share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Owner-side mutation of a single share link, addressed by its public code so
// the browser doesn't need to remember the internal row id. Every handler
// starts by resolving `code → (link, ownership-check)`; a link owned by
// someone else returns 404 (not 403) to avoid code-enumeration oracles.

async function requireOwner(code: string) {
  const actor = getActorId()
  if (!actor) {
    return { ok: false as const, res: NextResponse.json({ code: 401, message: '未登录' }, { status: 401 }) }
  }
  const link = await getShareLinkForOwner(code, actor)
  if (!link) {
    return { ok: false as const, res: NextResponse.json({ code: 404, message: 'link not found' }, { status: 404 }) }
  }
  return { ok: true as const, link, actor }
}

function bad(message: string) {
  return NextResponse.json({ code: 400, message }, { status: 400 })
}

/** PATCH /api/share-links/[code]
 *  Body: { password?: string, clearPassword?: boolean,
 *          expiresAt?: number, clearExpires?: boolean,
 *          maxViews?: number, clearMaxViews?: boolean,
 *          allowDownload?: boolean }
 *  Only provided fields change. To *remove* a password / expiry / cap, send
 *  the matching `clear*` flag — `null` alone is ambiguous with "unset". */
export async function PATCH(req: Request, ctx: { params: { code: string } }) {
  const gate = await requireOwner(ctx.params.code)
  if (!gate.ok) return gate.res

  let body: Record<string, unknown> = {}
  try {
    const parsed = await req.json()
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    return bad('invalid json')
  }

  const patch: UpdateLinkInput = {}

  if (typeof body.clearPassword === 'boolean' && body.clearPassword) {
    patch.clearPassword = true
  } else if (typeof body.password === 'string') {
    if (body.password.length < 4) return bad('密码至少 4 位')
    if (body.password.length > 64) return bad('密码过长')
    patch.password = body.password
  }

  if (typeof body.clearExpires === 'boolean' && body.clearExpires) {
    patch.clearExpires = true
  } else if (body.expiresAt !== undefined && body.expiresAt !== null) {
    const n = body.expiresAt
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return bad('expiresAt 需为正数毫秒时间戳')
    if (n <= Date.now()) return bad('过期时间必须在未来')
    patch.expiresAt = Math.floor(n)
  }

  if (typeof body.clearMaxViews === 'boolean' && body.clearMaxViews) {
    patch.clearMaxViews = true
  } else if (body.maxViews !== undefined && body.maxViews !== null) {
    const n = body.maxViews
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 10000) {
      return bad('maxViews 需为 1–10000 的整数')
    }
    patch.maxViews = n
  }

  if (typeof body.allowDownload === 'boolean') patch.allowDownload = body.allowDownload

  // v0.5.3 · S5 invite-only roster edit. Presence of the key replaces the whole
  // list; [] clears it (link falls back to public / password semantics). Ids
  // are validated to exist + de-duplicated inside updateShareLink.
  if (body.inviteeIds !== undefined) {
    if (!Array.isArray(body.inviteeIds) || body.inviteeIds.some(x => typeof x !== 'string')) {
      return bad('inviteeIds 需为字符串数组')
    }
    if (body.inviteeIds.length > 200) return bad('可见名单人数过多（上限 200）')
    patch.inviteeIds = body.inviteeIds as string[]
  }

  if (Object.keys(patch).length === 0) return bad('未提供任何变更')

  const next = await updateShareLink(gate.link.id, patch)
  return NextResponse.json({ code: 200, data: next })
}

/** DELETE /api/share-links/[code] → soft revoke (row kept for audit). */
export async function DELETE(_req: Request, ctx: { params: { code: string } }) {
  const gate = await requireOwner(ctx.params.code)
  if (!gate.ok) return gate.res
  await revokeShareLink(gate.link.id)
  return NextResponse.json({ code: 200, data: { revoked: true } })
}

/** GET /api/share-links/[code] → owner view of a single link (fresh counters). */
export async function GET(_req: Request, ctx: { params: { code: string } }) {
  const gate = await requireOwner(ctx.params.code)
  if (!gate.ok) return gate.res
  return NextResponse.json({ code: 200, data: gate.link })
}
