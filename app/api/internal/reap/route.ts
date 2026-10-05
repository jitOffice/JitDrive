import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { reapExpiredTrash } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/internal/reap — v0.5.3 · S14 production hook.
//
// The drive layout already sweeps expired recycle-bin items in-process
// (~once/6h, fire-and-forget). This endpoint exists so a REAL external cron /
// scheduled job (Vercel Cron, k8s CronJob, systemd timer…) can trigger the same
// purge on demand instead of relying on page traffic to kick it.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`. If CRON_SECRET is not
// configured we return 503 rather than opening an unauthenticated destructive
// endpoint — better to disable the hook than to let anyone trigger purges.
//
// Body (optional JSON): { retentionDays?: number } — override the 30-day window
// (e.g. for ops backfills / testing). Clamped to a sane 1..3650.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  const given = m?.[1] || ''
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { code: 503, message: 'reap hook 未启用：服务端未配置 CRON_SECRET' },
      { status: 503 }
    )
  }
  if (!authorized(req)) {
    return NextResponse.json({ code: 401, message: 'invalid cron secret' }, { status: 401 })
  }

  let retentionDays: number | undefined
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && 'retentionDays' in body) {
      const n = Number((body as Record<string, unknown>).retentionDays)
      if (Number.isFinite(n) && n > 0) retentionDays = Math.min(3650, Math.max(1, Math.floor(n)))
    }
  } catch {
    /* body optional → default retention */
  }

  const result = await reapExpiredTrash({ retentionDays })
  return NextResponse.json({ code: 200, data: { ...result, retentionDays: retentionDays ?? 30 } })
}
