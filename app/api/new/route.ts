import { NextResponse } from 'next/server'
import { putFile, canReadFolder } from '@/lib/store'
import { newId } from '@/lib/id'
import { createDocument } from '@/lib/jitword'
import { getActorId } from '@/lib/users'
import { getCurrentUser } from '@/lib/auth'
import type { FileRecord } from '@/lib/types'

/** POST /api/new  body: { name?: string, folderId?: string | null }
 *  Creates a blank JitWord document (no uploaded .docx). */
export async function POST(req: Request) {
  let body: { name?: string; folderId?: string | null } = {}
  try {
    body = await req.json()
  } catch {
    /* tolerate empty body */
  }
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const me = await getCurrentUser()
  const name =
    (body.name || '').trim() ||
    `未命名文档-${new Date().toISOString().slice(5, 16).replace('T', ' ').replace(':', '')}.docx`

  const rawParent = body.folderId === undefined ? null : body.folderId
  const parentId = rawParent && rawParent !== 'root' ? rawParent : null
  if (parentId && !(await canReadFolder(parentId, actor))) {
    return NextResponse.json({ code: 404, message: '目录不存在或无权限' }, { status: 404 })
  }

  let docId: string
  try {
    const c = await createDocument({ name, externalSubject: actor })
    docId = c.docId
  } catch (e) {
    return NextResponse.json(
      { code: 502, message: `JitWord 建文档失败：${(e as Error).message}` },
      { status: 502 }
    )
  }

  const now = Date.now()
  const rec: FileRecord = {
    id: newId(),
    name,
    docId,
    extension: 'docx',
    kind: 'jitword',
    size: 0,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    parentId,
    ownerSubject: actor,
    ownerName: me?.name || actor,
    jwSubject: actor,
    sharedWith: [],
    createdAt: now,
    updatedAt: now,
    deleted: false,
    accessCount: 0,
    pendingImport: false,
    status: 'ready',
    category: 'docx'
  }
  const final = await putFile(rec)
  return NextResponse.json({ code: 200, data: final })
}
