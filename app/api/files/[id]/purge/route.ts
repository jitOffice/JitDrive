import { NextResponse } from 'next/server'
import { purgeFile } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

/** DELETE /api/files/[id]/purge → 彻底删除：移除记录并把物理文件移入系统废纸篓。 */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const ok = await purgeFile(ctx.params.id, getActorId())
  if (!ok) return NextResponse.json({ code: 403, message: '无法彻底删除（仅所有者可执行）' }, { status: 403 })
  return NextResponse.json({ code: 200, data: { purged: true, note: '原始文件已移入系统废纸篓，可恢复' } })
}
