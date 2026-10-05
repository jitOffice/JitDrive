import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { findDuplicateGroups } from '@/lib/smart/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/smart/duplicates?limit=50 — 列出当前 actor 的 sha256 相同文件组。
 *  limit 默认 50，硬上限 200（防 UI 卡）。每组按 createdAt 升序。 */
export async function GET(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const url = new URL(req.url)
  const raw = Number(url.searchParams.get('limit') ?? 50)
  const limit = Number.isFinite(raw) ? Math.min(200, Math.max(1, Math.floor(raw))) : 50
  const items = await findDuplicateGroups(actor, limit)
  return NextResponse.json({ code: 200, data: { items } })
}
