import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { getSmartSummary } from '@/lib/smart/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/smart/summary — SmartPanel 顶部四张卡所需计数。
 *  page.tsx 里 server component 也直接调 getSmartSummary；本 route 主要用于
 *  扫描完后的客户端 refresh（fetch 一次即可，避免整页 RSC 重挂）。 */
export async function GET() {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const summary = await getSmartSummary(actor)
  return NextResponse.json({ code: 200, data: summary })
}
