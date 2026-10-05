import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { getRecommendations } from '@/lib/smart/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/smart/recommendations?limit=5 — 首页横幅 / SmartPanel 顶部推荐。
 *  limit 默认 5，硬上限 20。冷启动（无 lastAccessedAt）走基于 createdAt 的
 *  回退评分，保证横幅永远不空。 */
export async function GET(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const url = new URL(req.url)
  const raw = Number(url.searchParams.get('limit') ?? 5)
  const limit = Number.isFinite(raw) ? Math.min(20, Math.max(1, Math.floor(raw))) : 5
  const items = await getRecommendations(actor, limit)
  return NextResponse.json({ code: 200, data: { items } })
}
