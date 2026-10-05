// Central file-type policy — the single source of truth for what the drive
// accepts, how big it may be, and which viewer takes it. Every upload route,
// `<input accept>`, and PreviewClient branch reads from here so a whitelist
// change is a one-line diff.
//
// Design: FileKind is *derived*, never persisted. If we later drop `ofd` from
// the whitelist, existing rows automatically reclassify to `other` and the UI
// degrades to "download-only" without a data migration.

import type { FileKind } from './types'

interface KindPolicy {
  /** Lower-case extensions, no leading dot. */
  extensions: readonly string[]
  /** Hard per-file size cap in bytes. */
  maxSize: number
  /** Human-readable label for UI copy. */
  label: string
}

const MB = 1024 * 1024

/** JitWord-native — opens in the iframe editor via ticket flow. */
export const JITWORD_DOC = {
  extensions: ['docx'] as const,
  maxSize: 25 * MB,
  label: 'Word 文档'
} satisfies KindPolicy

/** Handled by the JitWord-Preview SDK (its advertised capability list). */
export const PREVIEWABLE = {
  // `docx` also works here, but the classifier checks jitword first — this
  // extension is kept for the case where someone disables the editor path.
  extensions: ['docx', 'xlsx', 'pptx', 'ofd', 'pdf', 'txt', 'md', 'html', 'htm', 'csv'] as const,
  maxSize: 50 * MB,
  label: 'Office / 文档'
} satisfies KindPolicy

export const IMAGE = {
  extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] as const,
  maxSize: 20 * MB,
  label: '图片'
} satisfies KindPolicy

export const AUDIO = {
  extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'] as const,
  maxSize: 200 * MB,
  label: '音频'
} satisfies KindPolicy

export const VIDEO = {
  extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] as const,
  maxSize: 200 * MB,
  label: '视频'
} satisfies KindPolicy

export const ARCHIVE = {
  extensions: ['zip', 'rar', '7z', 'tar', 'gz'] as const,
  maxSize: 200 * MB,
  label: '压缩包'
} satisfies KindPolicy

/** kind → policy lookup. `other` is a fallback with the smallest cap. */
const BY_KIND: Record<FileKind, KindPolicy> = {
  jitword: JITWORD_DOC,
  previewable: PREVIEWABLE,
  image: IMAGE,
  audio: AUDIO,
  video: VIDEO,
  archive: ARCHIVE,
  other: { extensions: [], maxSize: 25 * MB, label: '未知类型' }
}

/** Ordered classification table — first match wins. */
const ORDER: [FileKind, readonly string[]][] = [
  ['jitword', JITWORD_DOC.extensions],
  ['previewable', PREVIEWABLE.extensions],
  ['image', IMAGE.extensions],
  ['audio', AUDIO.extensions],
  ['video', VIDEO.extensions],
  ['archive', ARCHIVE.extensions]
]

/** Extract lower-case extension (no dot) from a filename. Returns '' for none. */
export function extensionOf(name: string): string {
  const base = (name.split(/[\\/]/).pop() || '').toLowerCase().trim()
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1)
}

/** Map filename → FileKind. Unknown extensions collapse to `other`. */
export function kindOf(name: string): FileKind {
  const ext = extensionOf(name)
  if (!ext) return 'other'
  return kindOfExt(ext)
}

/** Same classification but takes a bare extension (no dot, lower-case). Used
 *  by `store.toRecord` where we've already stripped the filename down to ext
 *  on the way in. */
export function kindOfExt(ext: string): FileKind {
  const e = (ext || '').toLowerCase()
  if (!e) return 'other'
  for (const [kind, exts] of ORDER) {
    if ((exts as readonly string[]).includes(e)) return kind
  }
  return 'other'
}

/** Server-side whitelist check on upload. */
export function isAllowedExtension(name: string): boolean {
  const ext = extensionOf(name)
  if (!ext) return false
  return ORDER.some(([, exts]) => (exts as readonly string[]).includes(ext))
}

/** Max upload bytes for a given file. */
export function maxSizeFor(name: string): number {
  return BY_KIND[kindOf(name)].maxSize
}

export function maxSizeOfKind(kind: FileKind): number {
  return BY_KIND[kind].maxSize
}

/** Human label used in FileList / UploadZone tooltips. */
export function labelForKind(kind: FileKind): string {
  return BY_KIND[kind].label
}

/**
 * Compose an `<input accept>` attribute. Uploads are intentionally permissive
 * (whole drive shares one button), so we merge all whitelisted extensions.
 */
export function uploadAcceptAttr(): string {
  const all: string[] = []
  for (const [, exts] of ORDER) all.push(...(exts as readonly string[]))
  // Deduplicate — `docx` shows up in both jitword and previewable.
  return Array.from(new Set(all)).map(e => '.' + e).join(',')
}

/**
 * Best-effort MIME for the raw route's Content-Type header. We sniff magic
 * bytes for the risky cases (docx/xlsx/pptx are all zip containers; images
 * are unambiguous) and fall back to a static map for the rest.
 */
const MIME_BY_EXT: Record<string, string> = {
  // office (OOXML)
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // legacy office (rare, keep anyway)
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  // ofd (GB/T 33190-2016, no registered IANA type; browsers treat as octet)
  ofd: 'application/ofd',
  pdf: 'application/pdf',
  // plaintext family
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  // image
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  // audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  // video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  // archive
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip'
}

export function guessMime(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] || 'application/octet-stream'
}

/** Whether a file goes through the JitWord editor (docx). */
export function isJitwordDoc(name: string): boolean {
  return kindOf(name) === 'jitword'
}

/** Whether the Preview SDK can render it (its advertised format list). */
export function isPreviewable(name: string): boolean {
  const k = kindOf(name)
  return k === 'previewable' || k === 'jitword'
}

/** Files that can be embedded directly via a native media tag. */
export function isNativeMedia(name: string): boolean {
  const k = kindOf(name)
  return k === 'image' || k === 'audio' || k === 'video'
}

/** Files that should be download-only (no preview UI). */
export function isDownloadOnly(name: string): boolean {
  const k = kindOf(name)
  return k === 'archive' || k === 'other'
}
