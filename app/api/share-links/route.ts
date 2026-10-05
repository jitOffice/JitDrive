import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { listMyShareLinks } from '@/lib/share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/share-links?mine=1 — v0.5.3 · S3 owner share dashboard.
//
// Returns every share link the signed-in actor owns (through their file OR
// folder), newest first, each carrying target name + granular view total
// (S2). Revoked links are omitted unless `includeRevoked=1`. Requires a
// session — anonymous callers get 401 (there is nothing to enumerate here,
// but the dashboard is inherently owner-scoped).
export async function GET(req: Request) {
  const actor = getActorId()
  if (!actor) {
    return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  }
  const url = new URL(req.url)
  const includeRevoked = url.searchParams.get('includeRevoked') === '1'
  const items = await listMyShareLinks(actor, { includeRevoked })
  return NextResponse.json({ code: 200, data: { items, total: items.length } })
}
