import { NextResponse } from 'next/server'
import { getFolder, renameFolder, moveFolder, softDeleteFolder } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await getFolder(ctx.params.id)
  if (!rec || rec.ownerId !== actor || rec.deleted) {
    return NextResponse.json({ code: 404, message: 'folder not found' }, { status: 404 })
  }
  return NextResponse.json({ code: 200, data: rec })
}

/** PATCH accepts { name?, parentId? }. `parentId: null` / `"root"` moves to root.
 *  Owner-only. Cycle prevention lives in lib/store.ts::moveFolder. */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  let body: { name?: string; parentId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: 400, message: 'invalid json' }, { status: 400 })
  }
  try {
    let next = null as null | Awaited<ReturnType<typeof getFolder>>
    if (body.name !== undefined) {
      next = await renameFolder(ctx.params.id, actor, body.name)
      if (!next) return NextResponse.json({ code: 404, message: 'folder not found' }, { status: 404 })
    }
    if (body.parentId !== undefined) {
      const target = body.parentId === 'root' ? null : body.parentId
      next = await moveFolder(ctx.params.id, actor, target)
      if (!next) return NextResponse.json({ code: 404, message: 'folder not found' }, { status: 404 })
    }
    if (!next) return NextResponse.json({ code: 400, message: '未提供任何变更' }, { status: 400 })
    return NextResponse.json({ code: 200, data: next })
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'invalid-name') return NextResponse.json({ code: 400, message: '名称无效' }, { status: 400 })
    if (msg === 'duplicate-name') return NextResponse.json({ code: 409, message: '同级目录已有同名文件夹' }, { status: 409 })
    if (msg === 'invalid-parent') return NextResponse.json({ code: 403, message: '目标目录不存在或无权限' }, { status: 403 })
    if (msg === 'cycle-detected') return NextResponse.json({ code: 409, message: '不能把文件夹移动到它自己的子目录下' }, { status: 409 })
    if (msg === 'depth-limit') return NextResponse.json({ code: 400, message: '目录层级过深' }, { status: 400 })
    if (msg === 'not-found') return NextResponse.json({ code: 404, message: 'folder not found' }, { status: 404 })
    return NextResponse.json({ code: 500, message: `操作失败：${msg}` }, { status: 500 })
  }
}

/** DELETE → soft delete folder + cascade descendants into trash. */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await softDeleteFolder(ctx.params.id, actor)
  if (!rec) return NextResponse.json({ code: 403, message: '无法删除（文件夹不存在或无权限）' }, { status: 403 })
  return NextResponse.json({ code: 200, data: { deleted: true, inTrash: true } })
}
