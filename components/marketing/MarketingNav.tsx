'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Icon, { type IconName } from '@/components/Icon'
import GithubButton from '@/components/marketing/GithubButton'
import { track } from '@/lib/client/track'
import { DRIVE, LOGIN, REGISTER } from '@/lib/routes'

/** Plain in-page section anchors shown in the marketing nav (desktop).
 *  The former 【核心能力】(#capabilities) slot is now the 【产品生态】 dropdown. */
const SECTIONS = [
  { href: '#ai', label: '智能云盘' },
  { href: '#share', label: '分享运营化' },
  { href: '#security', label: '安全可控' },
  { href: '#platform', label: '平台形态' }
]

/** Sibling products surfaced in the 【产品生态】 dropdown (all external links). */
const PRODUCTS: {
  name: string
  tagline: string
  href: string
  icon: IconName
  tile: string
  dot: string
}[] = [
  {
    name: 'JitWord 协同 AI 文档',
    tagline: '会读文件的在线文档',
    href: 'https://jitword.com',
    icon: 'file',
    tile: 'from-[#E64C3D] to-[#C73E30]',
    dot: 'bg-[#E64C3D]'
  },
  {
    name: 'JitKnow AI 知识库',
    tagline: '把资料沉淀成可问答的知识',
    href: 'https://know.jitword.com',
    icon: 'kb',
    tile: 'from-indigo-500 to-blue-600',
    dot: 'bg-indigo-500'
  },
  {
    name: 'Pxcharts 超级表格',
    tagline: '表格自己会分析',
    href: 'https://pxcharts.jitword.com',
    icon: 'chart',
    tile: 'from-emerald-500 to-teal-600',
    dot: 'bg-emerald-500'
  }
]

/**
 * Sticky marketing header. Server layout decides `signedIn` from the session
 * cookie; this component owns the client state a nav genuinely needs — scroll
 * shadow, mobile disclosure menu, and the 【产品生态】 hover/click dropdown —
 * plus fire-and-forget `track()` pings on CTAs.
 */
export default function MarketingNav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [ecoOpen, setEcoOpen] = useState(false)
  const ecoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the ecosystem dropdown on outside click / Esc so click-toggle users
  // get the same dismissal affordance as hover users.
  useEffect(() => {
    if (!ecoOpen) return
    const onDown = (e: MouseEvent) => {
      if (ecoRef.current && !ecoRef.current.contains(e.target as Node)) setEcoOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setEcoOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ecoOpen])

  function cta(target: 'enter' | 'login' | 'signup', from: 'nav' | 'mobile') {
    track('marketing_cta', { target, from })
    setOpen(false)
  }

  function pickProduct(href: string, name: string) {
    track('ecosystem_visit', { name, href })
    setEcoOpen(false)
  }

  return (
    <header
      className={
        'sticky top-0 z-40 w-full border-b bg-white/90 backdrop-blur transition ' +
        (scrolled ? 'border-wps-border shadow-sm' : 'border-transparent')
      }
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="JitDrive 首页">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-wps-brand to-wps-brandDark text-white shadow-sm">
            <Icon name="drive" size={20} />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold text-wps-text">JitDrive</span>
            <span className="block text-[10px] font-medium tracking-wide text-wps-subtext">智能云盘</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="ml-6 hidden items-center gap-7 lg:flex">
          {/* 产品生态 — hover/click dropdown of sibling products */}
          <div
            ref={ecoRef}
            className="relative"
            onMouseEnter={() => setEcoOpen(true)}
            onMouseLeave={() => setEcoOpen(false)}
          >
            <button
              type="button"
              onClick={() => setEcoOpen(v => !v)}
              aria-haspopup="true"
              aria-expanded={ecoOpen}
              className={
                'flex items-center gap-1 text-sm transition ' +
                (ecoOpen ? 'text-wps-text' : 'text-wps-subtext hover:text-wps-text')
              }
            >
              产品生态
              <Icon
                name="chevron"
                size={14}
                className={'transition-transform duration-200 ' + (ecoOpen ? 'rotate-180' : '')}
              />
            </button>

            {ecoOpen && (
              <div className="absolute left-1/2 top-full z-50 w-[350px] -translate-x-1/2 pt-3">
                <div className="overflow-hidden rounded-2xl border border-wps-border bg-white shadow-xl ring-1 ring-black/5 animate-[jw-popIn_0.16s_ease-out]">
                  <div className="flex items-center justify-between border-b border-wps-border bg-slate-50/70 px-4 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-wps-subtext">
                      JitWord 产品家族
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-wps-subtext">
                      <Icon name="sparkles" size={12} className="text-wps-brand" />
                      AI 套件
                    </span>
                  </div>
                  <div className="p-1.5">
                    {PRODUCTS.map(p => (
                      <a
                        key={p.href}
                        href={p.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => pickProduct(p.href, p.name)}
                        className="group/eco flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-slate-50"
                      >
                        <span
                          className={
                            'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm transition group-hover/eco:scale-105 ' +
                            p.tile
                          }
                        >
                          <Icon name={p.icon} size={19} />
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span className="block text-[13.5px] font-semibold text-wps-text">{p.name}</span>
                          <span className="mt-0.5 block truncate text-[12px] text-wps-subtext">{p.tagline}</span>
                        </span>
                        <Icon
                          name="arrowUpRight"
                          size={16}
                          className="ml-auto shrink-0 text-wps-subtext opacity-0 transition group-hover/eco:opacity-100"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {SECTIONS.map(s => (
            <a
              key={s.href}
              href={s.href}
              className="text-sm text-wps-subtext transition hover:text-wps-text"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* Desktop auth / enter + GitHub CTA */}
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <GithubButton />
          {signedIn ? (
            <Link
              href={DRIVE}
              onClick={() => cta('enter', 'nav')}
              className="flex items-center gap-1.5 rounded-md bg-wps-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-wps-brandDark"
            >
              进入云盘
              <Icon name="chevronRight" size={15} />
            </Link>
          ) : (
            <>
              <Link
                href={LOGIN}
                onClick={() => cta('login', 'nav')}
                className="rounded-md px-3 py-2 text-sm font-medium text-wps-text transition hover:bg-slate-100"
              >
                登录
              </Link>
              <Link
                href={REGISTER}
                onClick={() => cta('signup', 'nav')}
                className="flex items-center gap-1.5 rounded-md bg-wps-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-wps-brandDark"
              >
                免费开始
                <Icon name="chevronRight" size={15} />
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="ml-auto grid h-9 w-9 place-items-center rounded-md text-wps-text hover:bg-slate-100 lg:hidden"
          aria-label="切换菜单"
          aria-expanded={open}
        >
          <Icon name={open ? 'close' : 'more'} size={20} />
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="border-t border-wps-border bg-white px-4 pb-4 pt-1 lg:hidden">
          {/* 产品生态 (inline, no hover on touch) */}
          <div className="pb-1">
            <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-wps-subtext">
              产品生态
            </div>
            {PRODUCTS.map(p => (
              <a
                key={p.href}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => pickProduct(p.href, p.name)}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
              >
                <span
                  className={'grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br text-white ' + p.tile}
                >
                  <Icon name={p.icon} size={16} />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-[13px] font-semibold text-wps-text">{p.name}</span>
                  <span className="block truncate text-[11.5px] text-wps-subtext">{p.tagline}</span>
                </span>
                <Icon name="arrowUpRight" size={15} className="ml-auto shrink-0 text-wps-subtext" />
              </a>
            ))}
          </div>

          <nav className="flex flex-col border-t border-wps-border pt-2">
            {SECTIONS.map(s => (
              <a
                key={s.href}
                href={s.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm text-wps-text hover:bg-slate-50"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <div className="mt-2 flex flex-col gap-2 border-t border-wps-border pt-3">
            <GithubButton compact className="justify-center" />
            {signedIn ? (
              <Link
                href={DRIVE}
                onClick={() => cta('enter', 'mobile')}
                className="flex items-center justify-center gap-1.5 rounded-md bg-wps-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-wps-brandDark"
              >
                进入云盘
                <Icon name="chevronRight" size={15} />
              </Link>
            ) : (
              <>
                <Link
                  href={LOGIN}
                  onClick={() => cta('login', 'mobile')}
                  className="rounded-md border border-wps-border px-4 py-2.5 text-center text-sm font-medium text-wps-text hover:bg-slate-50"
                >
                  登录
                </Link>
                <Link
                  href={REGISTER}
                  onClick={() => cta('signup', 'mobile')}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-wps-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-wps-brandDark"
                >
                  免费开始
                  <Icon name="chevronRight" size={15} />
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
