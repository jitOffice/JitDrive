import { NextResponse } from 'next/server'
import { listDrive, listFoldersFlat } from '@/lib/store'
import { getActorId } from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/tree — flat roster of every non-deleted folder + file the actor
 *  owns, used by the client-side <FileTree> to build a nested view without
 *  one HTTP request per expand. Deliberately not paginated for the demo; a
 *  production drive would switch to lazy `?parent=` fetches. */
export async function GET() {
  const actor = getActorId()
  if (!actor) return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  const [folders, files] = await Promise.all([listFoldersFlat(actor), listDrive(actor)])
  return NextResponse.json({ code: 200, data: { folders, files } })
}
