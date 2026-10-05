'use client'

import { useCallback, useEffect, useState } from 'react'
import Icon from '@/components/Icon'
import { track } from '@/lib/client/track'

/** Two QR codes surfaced in the contact modal. External CDN URLs — we use plain
 *  <img> (not next/image) so we don't have to whitelist remote patterns; these
 *  are static brand assets, not something we need to optimize per-request. */
const QR = [
  {
    label: '作者微信',
    hint: '扫码添加作者，1v1 咨询与定制',
    src: 'https://next.jitword.com/uploads/WechatIMG246_19d428a664c.jpg'
  },
  {
    label: '公众号',
    hint: '关注「JitWord」获取更新与案例',
    src: 'https://next.jitword.com/uploads/qrcode_19d716f2d29.jpg'
  }
]

type Variant = 'fab' | 'inline'

/**
 * Single source of truth for the "联系咨询" affordance. `fab` renders the fixed
 * bottom-right pill used on the marketing landing page; `inline` renders a
 * compact toolbar button for the drive top bar. Both toggle the same QR modal
 * (backdrop + Esc close, body scroll lock), so the contact copy/images live in
 * exactly one place.
 */
export default function ContactButton({
  variant = 'fab',
  className = ''
}: {
  variant?: Variant
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const from = variant === 'fab' ? 'fab' : 'topbar'

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  const trigger =
    variant === 'fab' ? (
      <button
        type="button"
        onClick={() => {
          track('contact_open', { from })
          setOpen(true)
        }}
        className={
          'group fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-wps-brand to-wps-brandDark px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-wps-brand/25 ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-wps-brand/50 ' +
          className
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="message" size={19} className="transition group-hover:rotate-6" />
        <span>联系咨询</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          track('contact_open', { from })
          setOpen(true)
        }}
        className={
          'inline-flex items-center gap-1.5 rounded-md border border-wps-border bg-white px-2.5 py-1.5 text-sm font-medium text-wps-text transition hover:border-wps-brand/40 hover:bg-slate-50 ' +
          className
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="message" size={16} />
        <span className="hidden sm:inline">联系咨询</span>
      </button>
    )

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="联系咨询"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-[jw-fadeIn_0.15s_ease-out]"
            onClick={close}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 animate-[jw-popIn_0.18s_ease-out]">
            <div className="flex items-start gap-3 bg-gradient-to-br from-wps-brand to-wps-brandDark px-5 py-4 text-white">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <Icon name="message" size={20} />
              </span>
              <div className="leading-tight">
                <div className="text-base font-semibold">联系我们</div>
                <div className="mt-0.5 text-[12.5px] text-white/80">
                  扫码添加作者微信或关注公众号，获取产品演示与定制方案
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/85 transition hover:bg-white/15 hover:text-white"
                aria-label="关闭"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 px-5 py-5">
              {QR.map(q => (
                <figure key={q.label} className="flex flex-col items-center text-center">
                  <div className="rounded-xl border border-wps-border bg-white p-2 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={q.src}
                      alt={`${q.label}二维码`}
                      width={148}
                      height={148}
                      loading="lazy"
                      className="h-[148px] w-[148px] rounded-lg object-contain"
                    />
                  </div>
                  <figcaption className="mt-2.5">
                    <span className="block text-sm font-semibold text-wps-text">{q.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-wps-subtext">{q.hint}</span>
                  </figcaption>
                </figure>
              ))}
            </div>

            <div className="border-t border-wps-border bg-slate-50 px-5 py-3 text-center text-[12px] text-wps-subtext">
              工作日 9:00–19:00 · 通常 2 小时内回复
            </div>
          </div>
        </div>
      )}
    </>
  )
}
