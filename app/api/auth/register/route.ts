import { NextResponse } from 'next/server'
import { registerUser, setSessionCookie } from '@/lib/auth'
import type { User } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pub(u: User) {
  return { id: u.id, email: u.email, name: u.name, color: u.color }
}

/** POST /api/auth/register { email, password, name?, inviteCode }
 *  Creates an account (invite-gated) and signs the caller in. */
export async function POST(req: Request) {
  let body: { email?: string; password?: string; name?: string; inviteCode?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: 400, message: 'invalid json' }, { status: 400 })
  }
  const res = await registerUser({
    email: body.email || '',
    password: body.password || '',
    name: body.name,
    inviteCode: body.inviteCode || ''
  })
  if (!res.ok) return NextResponse.json({ code: 400, message: res.error }, { status: 400 })
  setSessionCookie(res.user.id)
  return NextResponse.json({ code: 200, data: pub(res.user) })
}
