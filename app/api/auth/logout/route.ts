import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/auth/logout → clear the session cookie. */
export async function POST() {
  clearSessionCookie()
  return NextResponse.json({ code: 200, data: { ok: true } })
}
