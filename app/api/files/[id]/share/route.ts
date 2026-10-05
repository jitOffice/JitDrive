import { NextResponse } from 'next/server'
import { shareFile } from '@/lib/store'
import { getActorId } from '@/lib/users'
import { userExists } from '@/lib/auth'

export const runtime = 'nodejs'

/** POST /api/files/[id]/share { subjectIds: string[] } → set viewer roster (owner only). */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  let body: { subjectIds?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ code: 400, message: 'invalid json' }, { status: 400 })
  }
  const ids = Array.isArray(body.subjectIds) ? (body.subjectIds as unknown[]).map(String) : null
  if (!ids) return NextResponse.json({ code: 400, message: 'subjectIds[] required' }, { status: 400 })
  const valid: string[] = []
  for (const id of ids) if (id !== actor && (await userExists(id))) valid.push(id)
  const rec = await shareFile(ctx.params.id, actor, valid)
  if (!rec) return NextResponse.json({ code: 403, message: '仅所有者可设置共享' }, { status: 403 })
  return NextResponse.json({ code: 200, data: rec })
}
