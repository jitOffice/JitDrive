import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import type { User } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pub(u: User) {
  return { id: u.id, email: u.email, name: u.name, color: u.color }
}

/** GET /api/auth/me → current signed-in user (or data:null). */
export async function GET() {
  const u = await getCurrentUser()
  return NextResponse.json({ code: 200, data: u ? pub(u) : null })
}
