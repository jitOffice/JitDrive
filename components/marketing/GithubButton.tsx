'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/client/track'

/** Default target repo for the public JitDrive project. */
const DEFAULT_REPO = 'jitOffice/JitDrive'

type Props = {
  /** "owner/repo" on github.com. Defaults to the JitDrive project. */
  repo?: string
  /** Compact variant drops the "GitHub" label, keeping just logo + star count. */
  compact?: boolean
  className?: string
}

/** Render counts human-friendly: 1200 → "1.2k", 1_200_000 → "1.2M". */
function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}

/**
 * GitHub octocat mark as an inline *filled* SVG. The shared <Icon/> system is
 * stroke-only (fill=none), which would butcher the logo, so we ship a dedicated
 * path here. Color still follows `currentColor`.
 */
function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.99 5.24.99 11.51c0 4.86 3.15 8.98 7.52 10.43.55.1.75-.24.75-.53 0-.26-.01-.95-.02-1.87-3.06.66-3.71-1.48-3.71-1.48-.5-1.28-1.23-1.63-1.23-1.63-1-.68.08-.67.08-.67 1.11.08 1.69 1.14 1.69 1.14.99 1.69 2.59 1.2 3.22.92.1-.71.39-1.2.71-1.47-2.45-.28-5.02-1.22-5.02-5.45 0-1.2.43-2.19 1.14-2.96-.11-.28-.5-1.4.11-2.91 0 0 .93-.3 3.05 1.13a10.6 10.6 0 0 1 2.78-.37c.94.01 1.9.13 2.78.37 2.11-1.43 3.04-1.13 3.04-1.13.61 1.51.23 2.63.12 2.91.71.77 1.14 1.76 1.14 2.96 0 4.24-2.58 5.17-5.04 5.44.4.34.75 1 .75 2.02 0 1.46-.01 2.64-.01 3.01 0 .29.2.64.76.53A11.02 11.02 0 0 0 23.01 11.51C23.01 5.24 18.27.5 12 .5Z" />
    </svg>
  )
}

/**
 * Top-nav GitHub button: links out to the repo and, when the (unauthenticated)
 * GitHub REST API is reachable, shows a live ★ count. The API allows cross-origin
 * reads (ACAO: *) but caps anonymous calls at 60/hr, so we treat any failure or
 * null count as "hide the number" and keep the button itself intact — a missing
 * star count should never break the nav.
 */
export default function GithubButton({ repo = DEFAULT_REPO, compact = false, className = '' }: Props) {
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('bad-status'))))
      .then(data => {
        if (alive && typeof data?.stargazers_count === 'number') setStars(data.stargazers_count)
      })
      .catch(() => {
        /* rate-limited / offline — leave stars null, button still works */
      })
    return () => {
      alive = false
      ctrl.abort()
    }
  }, [repo])

  const url = `https://github.com/${repo}`

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track('github_visit', { repo, from: compact ? 'mobile' : 'nav' })}
      title={`${repo} on GitHub`}
      aria-label="在 GitHub 上查看 JitDrive"
      className={
        'group/gh inline-flex items-center gap-2 rounded-md border border-wps-border bg-white px-3 py-2 text-sm font-medium text-wps-text shadow-sm transition hover:border-wps-brand/40 hover:bg-slate-50 ' +
        className
      }
    >
      <GithubMark size={compact ? 17 : 18} />
      {!compact && <span>GitHub</span>}
      <span
        className={
          'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-wps-subtext transition group-hover/gh:bg-amber-50 group-hover/gh:text-amber-600 ' +
          (stars === null ? 'opacity-0' : 'opacity-100')
        }
        aria-hidden={stars === null}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5l3.09 6.26 6.91.6-5.2 4.5 1.55 6.76L12 14.77 5.65 18.12l1.55-6.76-5.2-4.5 6.91-.6L12 .5Z" />
        </svg>
        {stars === null ? '0' : formatCount(stars)}
      </span>
    </a>
  )
}
