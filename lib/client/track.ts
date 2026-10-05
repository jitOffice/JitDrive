// Client-side analytics shim (v0.5.3 · S4). Fire-and-forget event beacon to
// /api/track. Demo-grade: the endpoint just structured-logs; the CALL CONTRACT
// (event name + props) is what we lock in now so swapping in a real analytics
// provider (GA / 神策 / 自建仓) later is a one-file change here.
//
// Never throws into the UI — a blocked ad-extension or offline network must not
// break a click. Uses sendBeacon when available (survives page navigation),
// falling back to a keepalive fetch.

export type TrackProps = Record<string, string | number | boolean | null | undefined>

export function track(event: string, props: TrackProps = {}): void {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({ event, props, ts: Date.now() })
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }))
      if (ok) return
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(() => undefined)
  } catch {
    /* noop */
  }
}
