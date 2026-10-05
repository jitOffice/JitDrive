import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { scanBatch } from '@/lib/smart/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** 一批 20 条，text-family 每条 <50ms（4MB body 上限），全批最多 1s。
 *  非 text-family 走纯 filename 匹配近乎瞬时。给 15s 余量应对慢盘。 */
export const maxDuration = 15

/** POST /api/smart/scan — 触发一批懒扫描。
 *  Body: `{ batchSize?: number }`（默认 20，最大 100）
 *  返回 `ScanReport`。UI 拿到 remaining>0 会提示"还剩 N 条待扫描"。
 *
 *  安全：actor 只能扫自己的文件；扫描函数内部 `ownerId = actorId` 强绑定。
 *  幂等：每次只挑 sensitivity IS NULL 的行，重复调用安全。 */
export async function POST(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  let body: { batchSize?: number } = {}
  try {
    body = await req.json()
  } catch {
    /* 允许空 body */
  }
  const raw = Number(body?.batchSize ?? 20)
  const batchSize = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 20
  const report = await scanBatch(actor, batchSize)
  return NextResponse.json({ code: 200, data: report })
}
