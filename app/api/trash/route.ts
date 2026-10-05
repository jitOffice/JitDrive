import { NextResponse } from 'next/server'
import { emptyTrash } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

/** DELETE /api/trash → 清空回收站（仅彻底删除当前身份拥有的文档）。 */
export async function DELETE() {
  const n = await emptyTrash(getActorId())
  return NextResponse.json({ code: 200, data: { purged: n } })
}
