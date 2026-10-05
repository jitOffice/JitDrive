import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { searchFiles } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/search?q= → title matches across everything the actor can access.
 *  Returns a compact shape for the top-bar dropdown (no leak of other users'
 *  metadata beyond "shared with you" docs where ownerName is meaningful). */
export async function GET(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim()
  if (!q) return NextResponse.json({ code: 200, data: [] })
  const files = await searchFiles(actor, q)
  const data = files.map(f => ({
    id: f.id,
    name: f.name,
    ownerName: f.ownerName,
    isOwner: f.ownerSubject === actor,
    updatedAt: f.updatedAt
  }))
  return NextResponse.json({ code: 200, data })
}
