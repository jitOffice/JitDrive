import { NextResponse } from 'next/server'
import { purgeFolder } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

/** DELETE /api/folders/[id]/purge → 彻底删除：连同子文件夹与所有文档一起移除记录，
 *  原始字节走 storage.removeBlobs → 系统废纸篓。 */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const result = await purgeFolder(ctx.params.id, actor)
  if (result.folders === 0 && result.files === 0) {
    return NextResponse.json({ code: 403, message: '无法彻底删除（仅所有者可执行）' }, { status: 403 })
  }
  return NextResponse.json({
    code: 200,
    data: { ...result, note: '相关文件已移入系统废纸篓，可恢复' }
  })
}
