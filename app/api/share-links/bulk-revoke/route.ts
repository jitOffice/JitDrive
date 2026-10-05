import { NextResponse } from 'next/server'
import { getActorId } from '@/lib/users'
import { getShareLinkForOwner, revokeAllMyShareLinks, revokeShareLink } from '@/lib/share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/share-links/bulk-revoke — v0.5.3 · S3 "撤销" / "撤销全部".
//
// Body: { codes?: string[] }
//   · codes provided → revoke exactly those, but ONLY ones the actor owns.
//     Any code that isn't the caller's is silently skipped (we never 403 or
//     report which ones weren't theirs — mirrors the v0.5 anti-enumeration
//     rule so this endpoint can't be used to probe others' link codes).
//   · codes omitted / empty → revoke every active link the actor owns.
// Response: { code:200, data:{ revoked: number } }.
export async function POST(req: Request) {
  const actor = getActorId()
  if (!actor) {
    return NextResponse.json({ code: 401, message: '未登录' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    const parsed = await req.json()
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    /* treat as revoke-all (no codes) */
  }

  const rawCodes = body.codes
  if (rawCodes === undefined || (Array.isArray(rawCodes) && rawCodes.length === 0)) {
    const revoked = await revokeAllMyShareLinks(actor)
    return NextResponse.json({ code: 200, data: { revoked } })
  }

  if (!Array.isArray(rawCodes) || rawCodes.some(c => typeof c !== 'string')) {
    return NextResponse.json({ code: 400, message: 'codes 需为字符串数组' }, { status: 400 })
  }
  const codes = Array.from(new Set((rawCodes as string[]).filter(Boolean))).slice(0, 500)

  let revoked = 0
  for (const code of codes) {
    const link = await getShareLinkForOwner(code, actor)
    if (!link) continue // not found OR not owned → skip, no oracle
    await revokeShareLink(link.id)
    revoked++
  }
  return NextResponse.json({ code: 200, data: { revoked } })
}
