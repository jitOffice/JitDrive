import { NextResponse } from 'next/server'
import { restoreFile } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

/** POST /api/files/[id]/restore → undelete from recycle bin. */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const rec = await restoreFile(ctx.params.id, getActorId())
  if (!rec) return NextResponse.json({ code: 403, message: '无法还原（文件不存在或无权限）' }, { status: 403 })
  return NextResponse.json({ code: 200, data: rec })
}
