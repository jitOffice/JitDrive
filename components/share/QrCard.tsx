'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface Props {
  /** Absolute URL to encode. Empty string is a no-op (renders nothing). */
  value: string
  /** Pixel size for the rendered SVG (viewBox is square). Default 168. */
  size?: number
  className?: string
}

/** Renders a QR code inline as SVG. Uses `qrcode.toString({type:'svg'})` —
 *  client-side only, no server call, no CDN. Kept in a small isolated
 *  component so LinkPane doesn't have to reason about async state. */
export default function QrCard({ value, size = 168, className = '' }: Props) {
  const [svg, setSvg] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (!value) {
      setSvg('')
      setErr(null)
      return
    }
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#00000000' }
    })
      .then(s => {
        if (!alive) return
        setSvg(s)
        setErr(null)
      })
      .catch(e => {
        if (!alive) return
        setErr((e as Error).message || '生成失败')
      })
    return () => {
      alive = false
    }
  }, [value, size])

  if (!value) return null
  if (err) {
    return (
      <div
        className={`grid place-items-center rounded border border-wps-border bg-slate-50 text-[10px] text-wps-subtext ${className}`}
        style={{ width: size, height: size }}
      >
        {err}
      </div>
    )
  }
  if (!svg) {
    return (
      <div
        className={`animate-pulse rounded border border-wps-border bg-slate-50 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={`rounded border border-wps-border bg-white p-1 ${className}`}
      style={{ width: size + 8, height: size + 8 }}
      // SAFETY: `svg` comes from `qrcode.toString` — our own deterministic
      // SVG output, not user-supplied markup.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
