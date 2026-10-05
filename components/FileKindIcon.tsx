'use client'

import type { FileKind } from '@/lib/types'
import Icon, { type IconName } from './Icon'

/** Maps a FileKind + extension to (icon, accent color). Kept here so any list
 *  / dialog / header renders the same visual language without duplicating the
 *  switch. Adding a new kind = add a row here + a case in lib/filetypes.ts. */
const RULES: Record<FileKind, { icon: IconName; fg: string; bg: string; label: string }> = {
  jitword:    { icon: 'file',         fg: 'text-wps-brand', bg: 'bg-red-50',    label: 'Word' },
  previewable:{ icon: 'filePdf',      fg: 'text-orange-600', bg: 'bg-orange-50', label: 'Office' },
  image:      { icon: 'image',        fg: 'text-emerald-600', bg: 'bg-emerald-50', label: '图片' },
  audio:      { icon: 'audio',        fg: 'text-fuchsia-600', bg: 'bg-fuchsia-50', label: '音频' },
  video:      { icon: 'video',        fg: 'text-indigo-600', bg: 'bg-indigo-50', label: '视频' },
  archive:    { icon: 'fileArchive',  fg: 'text-slate-600',  bg: 'bg-slate-100', label: '压缩包' },
  other:      { icon: 'file',         fg: 'text-slate-500',  bg: 'bg-slate-100', label: '文件' }
}

/** Extension-specific overrides — nicer than one orange for every previewable. */
const EXT_RULES: Record<string, { icon: IconName; fg: string; bg: string; label: string }> = {
  xlsx: { icon: 'fileSheet', fg: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Excel' },
  csv:  { icon: 'fileSheet', fg: 'text-emerald-600', bg: 'bg-emerald-50', label: 'CSV' },
  pptx: { icon: 'fileSlide', fg: 'text-amber-600', bg: 'bg-amber-50', label: 'PPT' },
  pdf:  { icon: 'filePdf', fg: 'text-rose-600', bg: 'bg-rose-50', label: 'PDF' },
  ofd:  { icon: 'filePdf', fg: 'text-rose-600', bg: 'bg-rose-50', label: 'OFD' },
  md:   { icon: 'file', fg: 'text-sky-600', bg: 'bg-sky-50', label: 'Markdown' },
  html: { icon: 'file', fg: 'text-sky-600', bg: 'bg-sky-50', label: 'HTML' },
  htm:  { icon: 'file', fg: 'text-sky-600', bg: 'bg-sky-50', label: 'HTML' },
  txt:  { icon: 'file', fg: 'text-slate-500', bg: 'bg-slate-100', label: 'TXT' }
}

export function fileKindRule(kind: FileKind, ext?: string) {
  if (ext && EXT_RULES[ext]) return EXT_RULES[ext]
  return RULES[kind]
}

interface Props {
  kind: FileKind
  ext?: string
  size?: number
  className?: string
  rounded?: boolean
}

export default function FileKindIcon({ kind, ext, size = 20, className = '', rounded = true }: Props) {
  const r = fileKindRule(kind, ext)
  return (
    <div
      className={
        'grid place-items-center shrink-0 ' +
        (rounded ? 'rounded ' : '') +
        r.bg +
        ' ' +
        r.fg +
        ' ' +
        className
      }
      style={{ width: size + 12, height: size + 12 }}
    >
      <Icon name={r.icon} size={size} />
    </div>
  )
}

export function fileKindLabel(kind: FileKind, ext?: string): string {
  return fileKindRule(kind, ext).label
}
