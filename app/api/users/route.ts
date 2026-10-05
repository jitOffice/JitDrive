import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { listShareableUsers } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/users → other accounts the current user can share a doc with.
 *
 *  v0.5.1 adds server-side search so the share picker can invite *anyone* by
 *  name/email instead of scrolling a fixed roster:
 *    • ?q=<keyword>   — case-insensitive substring match on name OR email.
 *    • ?limit=<1..100> — cap the result set (default 30 when q present, else 50).
 *  Empty q returns the full (capped) list, so the picker's initial paint still
 *  shows suggestions without a keystroke. */
export async function GET(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim() || undefined
  const limitRaw = Number(url.searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : undefined
  const users = await listShareableUsers(actor, { keyword: q, limit })
  return NextResponse.json({ code: 200, data: users })
}
