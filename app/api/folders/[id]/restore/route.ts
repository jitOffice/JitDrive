import { NextResponse } from 'next/server'
import { restoreFolder } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

/** POST /api/folders/[id]/restore → undelete a folder (cascades to marked descendants). */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const rec = await restoreFolder(ctx.params.id, getActorId())
  if (!rec) return NextResponse.json({ code: 403, message: '无法还原（文件夹不存在或无权限）' }, { status: 403 })
  return NextResponse.json({ code: 200, data: rec })
}
