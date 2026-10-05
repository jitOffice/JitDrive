import { NextResponse } from 'next/server'
import {
  getShareLinkPublic,
  evaluateShare,
  verifySharePassword,
  setUnlockCookie,
  isLocked,
  recordFail,
  resetFails,
  clientIp
} from '@/lib/share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/share/[code]/unlock { password: string } → sets a signed unlock
// cookie (30 min) so subsequent /raw and /ticket calls can stream without
// re-entering it. Deliberately NOT routed through `authorizePublic` — we need
// to allow the password-gate-closed branch through here (that's the whole
// point of this endpoint) while still rejecting revoked / expired / etc.
//
// Brute-force defence: in-memory 5-fails-per-(ip,code) for 15 min (demo
// grade — swap for Redis INCR+EXPIRE in production). Successful unlock
// resets the counter; wrong attempts extend the window once MAX_FAILS hit.

function noStore() {
  return { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow' }
}

function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ code: status, message, ...extra }, { status, headers: noStore() })
}

export async function POST(req: Request, ctx: { params: { code: string } }) {
  const code = ctx.params.code
  const ip = clientIp(req)

  const row = await getShareLinkPublic(code)
  if (!row) return fail(404, '分享链接不存在')
  const target = row.file ?? row.folder
  if (!target) return fail(410, '该分享链接已失效')
  const status = evaluateShare(row.link, target)
  if (status === 'revoked') return fail(410, '该分享链接已被撤销')
  if (status === 'expired') return fail(410, '该分享链接已过期')
  if (status === 'view-limit') return fail(410, '该分享链接访问次数已用完')
  if (status === 'file-gone') return fail(410, '文件已不可用')
  if (status === 'folder-gone') return fail(410, '目录已不可用')
  if (!row.link.hasPassword) return fail(400, '该分享未设置密码')

  if (isLocked(ip, code)) {
    return fail(429, '尝试次数过多，请稍后再试', { retryAfter: 900 })
  }

  let body: Record<string, unknown> = {}
  try {
    const parsed = await req.json()
    if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>
  } catch {
    return fail(400, 'invalid json')
  }
  const pw = typeof body.password === 'string' ? body.password : ''
  if (!pw) return fail(400, '请填写密码')

  const ok = verifySharePassword(pw, row.passwordHash)
  if (!ok) {
    recordFail(ip, code)
    return fail(401, '密码不正确')
  }
  resetFails(ip, code)
  setUnlockCookie(code)
  return NextResponse.json(
    { code: 200, data: { unlocked: true } },
    { headers: noStore() }
  )
}

/** Optional client-side cleanup — clears the unlock cookie without touching
 *  server state (owner can still revoke independently). */
export async function DELETE(_req: Request, _ctx: { params: { code: string } }) {
  // Import kept lazy so this file doesn't set an unused cookie on module load.
  const { clearUnlockCookie } = await import('@/lib/share')
  clearUnlockCookie()
  return NextResponse.json({ code: 200, data: { unlocked: false } }, { headers: noStore() })
}
