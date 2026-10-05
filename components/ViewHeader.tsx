'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { FileRecord } from '@/lib/types'
import Icon from './Icon'
import ShareDialog from './ShareDialog'
import { fileKindLabel } from './FileKindIcon'
import { DRIVE_HOME } from '@/lib/routes'

interface Props {
  file: FileRecord
  canEdit: boolean
  received: boolean
  ownerName: string
  /** Current logged-in user's cuid, forwarded to ShareDialog. */
  actorId: string
}

/** Header shown above PreviewClient (non-jitword files). Deliberately minimal
 *  — no edit/mode switch since there's nothing to edit; the two secondary
 *  actions are 分享 (only for owners) and 下载 (only when bytes exist). */
export default function ViewHeader({ file, canEdit, received, ownerName, actorId }: Props) {
  const [shareOpen, setShareOpen] = useState(false)
  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-wps-border bg-white px-4">
      <Link href={DRIVE_HOME} className="flex items-center gap-1 text-xs text-wps-subtext hover:text-wps-text">
        <Icon name="back" size={14} />
        我的云盘
      </Link>
      <div className="h-4 w-px bg-wps-border" />
      <div className="truncate text-sm font-medium text-wps-text" title={file.name}>
        {file.name}
      </div>
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-wps-subtext">
        {fileKindLabel(file.kind, file.extension)} · {(file.size / 1024).toFixed(1)} KB
      </span>
      {received && (
        <span className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
          <Icon name="eye" size={11} />
          来自 {ownerName} · 只读
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {canEdit && !received && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1 rounded border border-wps-border px-2 py-1 text-xs text-wps-text hover:bg-slate-50"
            title="生成分享链接 / 邀请同事"
          >
            <Icon name="share" size={13} />
            分享
          </button>
        )}
        {canEdit && (
          <a
            href={`/api/files/${file.id}/download`}
            className="flex items-center gap-1 rounded border border-wps-border px-2 py-1 text-xs text-wps-text hover:bg-slate-50"
            download
          >
            <Icon name="download" size={13} />
            下载原文件
          </a>
        )}
      </div>
      {shareOpen && (
        <ShareDialog target={{ kind: 'file', file }} actorId={actorId} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}
