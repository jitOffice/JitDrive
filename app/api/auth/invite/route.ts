import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { createInviteCode, listMyInviteCodes } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/auth/invite → codes this user minted + redemption status. */
export async function GET() {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rows = await listMyInviteCodes(actor)
  return NextResponse.json({ code: 200, data: rows.map(r => ({ code: r.code, used: !!r.usedById, createdAt: Number(r.createdAt) })) })
}

/** POST /api/auth/invite → mint a new single-use code for this user. */
export async function POST() {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const code = await createInviteCode(actor)
  return NextResponse.json({ code: 200, data: { code } })
}
