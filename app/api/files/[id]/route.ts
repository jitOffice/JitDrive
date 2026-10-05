import { NextResponse } from 'next/server'
import { getFile, patchFile, softDeleteFile, canReadFolder } from '@/lib/store'
import { getActorId } from '@/lib/users'
import type { FileRecord } from '@/lib/types'

export const runtime = 'nodejs'

function canAccess(rec: FileRecord, actor: string): boolean {
  return rec.ownerSubject === actor || rec.sharedWith.includes(actor)
}

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await getFile(ctx.params.id)
  if (!rec || !canAccess(rec, actor)) return NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 })
  return NextResponse.json({ code: 200, data: rec })
}

/** PATCH accepts { name?, parentId? }. `parentId: null` moves to root.
 *  Owner-only. Moving to a folder the actor doesn't own returns 403. */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await getFile(ctx.params.id)
  if (!rec) return NextResponse.json({ code: 404, message: 'file not found' }, { status: 404 })
  if (rec.ownerSubject !== actor) return NextResponse.json({ code: 403, message: '仅所有者可修改' }, { status: 403 })
  let body: { name?: string; parentId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: 400, message: 'invalid json' }, { status: 400 })
  }
  const patch: Partial<FileRecord> = { updatedAt: Date.now() }
  let touched = false
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ code: 400, message: 'name 不能为空' }, { status: 400 })
    patch.name = name
    touched = true
  }
  if (body.parentId !== undefined) {
    const next = body.parentId === 'root' ? null : body.parentId
    if (next === rec.id) return NextResponse.json({ code: 400, message: '不能移动到自身' }, { status: 400 })
    if (next) {
      const ok = await canReadFolder(next, actor)
      if (!ok) return NextResponse.json({ code: 403, message: '目标目录不存在或无权限' }, { status: 403 })
    }
    patch.parentId = next
    touched = true
  }
  if (!touched) return NextResponse.json({ code: 400, message: '未提供任何变更' }, { status: 400 })
  const next = await patchFile(rec.id, patch)
  return NextResponse.json({ code: 200, data: next })
}

/** DELETE → soft delete into the recycle bin (owner only). Physical bytes stay
 *  on disk untouched; a later 彻底删除 (/purge) relocates them to the OS trash. */
export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const rec = await softDeleteFile(ctx.params.id, actor)
  if (!rec) return NextResponse.json({ code: 403, message: '无法删除（文件不存在或无权限）' }, { status: 403 })
  return NextResponse.json({ code: 200, data: { deleted: true, inTrash: true } })
}
