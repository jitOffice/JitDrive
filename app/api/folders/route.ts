import { NextResponse } from 'next/server'
import { createFolder, canReadFolder, listFoldersFlat } from '@/lib/store'
import { newId } from '@/lib/id'
import { getActorId } from '@/lib/users'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

/** GET /api/folders → flat list of live folders owned by the actor.
 *  Used by the Move-to-folder picker to render the whole tree at once. */
export async function GET() {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const folders = await listFoldersFlat(actor)
  return NextResponse.json({ code: 200, data: folders })
}

/** POST /api/folders  body: { name: string, parentId?: string | null }
 *  Creates a folder under the actor's drive. `parentId: "root"` / missing ⇒ root.
 *  Owner-only (folders are private to the creator in v0.4 — see ARCHITECTURE §4.18). */
export async function POST(req: Request) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  let body: { name?: string; parentId?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: 400, message: 'invalid json' }, { status: 400 })
  }
  const name = (body.name || '').trim()
  if (!name) return NextResponse.json({ code: 400, message: 'name is required' }, { status: 400 })
  if (name.length > 100) return NextResponse.json({ code: 400, message: 'name 过长（≤100 字符）' }, { status: 400 })
  const parentId = !body.parentId || body.parentId === 'root' ? null : body.parentId
  if (parentId && !(await canReadFolder(parentId, actor))) {
    return NextResponse.json({ code: 403, message: '目标目录不存在或无权限' }, { status: 403 })
  }
  const me = await getCurrentUser()
  try {
    const rec = await createFolder({
      id: newId(),
      ownerId: actor,
      ownerName: me?.name || actor,
      parentId,
      name
    })
    return NextResponse.json({ code: 200, data: rec })
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'invalid-name') return NextResponse.json({ code: 400, message: '名称无效' }, { status: 400 })
    if (msg === 'invalid-parent') return NextResponse.json({ code: 403, message: '目标目录不存在或无权限' }, { status: 403 })
    if (msg === 'duplicate-name') return NextResponse.json({ code: 409, message: '同级目录已有同名文件夹' }, { status: 409 })
    return NextResponse.json({ code: 500, message: `创建失败：${msg}` }, { status: 500 })
  }
}
