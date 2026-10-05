import { NextResponse } from 'next/server'
import { loginUser, setSessionCookie } from '@/lib/auth'
import type { User } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pub(u: User) {
  return { id: u.id, email: u.email, name: u.name, color: u.color }
}

/** POST /api/auth/login { email, password } → establish a session cookie. */
export async function POST(req: Request) {
  let body: { email?: string; password?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: 400, message: 'invalid json' }, { status: 400 })
  }
  const res = await loginUser(body.email || '', body.password || '')
  if (!res.ok) return NextResponse.json({ code: 401, message: res.error }, { status: 401 })
  setSessionCookie(res.user.id)
  return NextResponse.json({ code: 200, data: pub(res.user) })
}
