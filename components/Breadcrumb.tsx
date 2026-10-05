'use client'

import Link from 'next/link'
import type { Crumb } from '@/lib/types'
import { folderView } from '@/lib/routes'
import Icon from './Icon'

interface Props {
  crumbs: Crumb[]
}

/** Drive breadcrumb: 我的云盘 / 一级 / 二级 …  Last crumb is current (no link). */
export default function Breadcrumb({ crumbs }: Props) {
  if (crumbs.length <= 1) return null
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-wps-subtext">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        const href = folderView(c.id)
        return (
          <span key={`${c.id ?? 'root'}-${i}`} className="flex items-center gap-1">
            {i === 0 ? <Icon name="home" size={12} className="opacity-70" /> : <Icon name="chevronRight" size={11} className="opacity-60" />}
            {last ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-wps-text" title={c.name}>
                {c.name}
              </span>
            ) : (
              <Link href={href} className="rounded px-1.5 py-0.5 hover:bg-slate-100 hover:text-wps-brand" title={c.name}>
                {c.name}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
