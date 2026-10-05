import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { getSuggestions } from '@/lib/smart/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/smart/suggestions?limit=20 — 每文件的运行时标签建议。
 *  v0.7 不落库，纯前端"看着像就自己复制"的辅助提示。FileTag 表 v0.8 引入。 */
export async function GET(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const url = new URL(req.url)
  const raw = Number(url.searchParams.get('limit') ?? 20)
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 20
  const items = await getSuggestions(actor, limit)
  return NextResponse.json({ code: 200, data: { items } })
}
