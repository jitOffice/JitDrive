import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/track — anonymous-safe analytics ingest (v0.5.3 · S4).
//
// Body: { event: string, props?: object, ts?: number }
// Demo scope: structured-log only — nothing persisted. The contract is the
// point: a real deployment pipes this into an analytics pipeline. Deliberately
// 202 + no auth so the beacon never blocks a visitor's navigation; inputs are
// bounded defensively so a spammy / malformed payload can't blow up the log.

const MAX_EVENT_LEN = 64

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ code: 202 }, { status: 202 })
    }
    const { event, props } = body as { event?: unknown; props?: unknown }
    if (typeof event !== 'string' || !event) {
      return NextResponse.json({ code: 202 }, { status: 202 })
    }
    const safeEvent = event.slice(0, MAX_EVENT_LEN)
    const safeProps =
      props && typeof props === 'object' ? (props as Record<string, unknown>) : {}
    // One line of structured JSON per event — greppable + trivially forwarded.
    console.log('[track]', JSON.stringify({ event: safeEvent, props: safeProps }))
  } catch {
    /* swallow — a tracking beacon must never 500 into the visitor's face */
  }
  // Always accept; never reveal anything about the payload shape.
  return NextResponse.json({ code: 202 }, { status: 202 })
}
