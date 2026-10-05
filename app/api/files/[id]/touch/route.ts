import { NextResponse } from 'next/server'
import { touchFile } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

/** POST /api/files/[id]/touch → bump lastAccessedAt / accessCount (最近打开). */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  if (!getActorId()) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await touchFile(ctx.params.id)
  if (!rec) return NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 })
  return NextResponse.json({ code: 200, data: { lastAccessedAt: rec.lastAccessedAt, accessCount: rec.accessCount } })
}
