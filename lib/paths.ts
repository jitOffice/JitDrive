import path from 'node:path'

export const DATA_DIR = path.join(process.cwd(), 'data')
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
export const PENDING_DIR = path.join(DATA_DIR, 'pending')
export const DB_FILE = path.join(DATA_DIR, 'files.json')

/** Legacy: docx files stay at `data/uploads/<id>.docx` for v0.3.2 compat. */
export const uploadPath = (id: string) => path.join(UPLOADS_DIR, `${id}.docx`)

/** Per-file directory introduced in v0.4 for non-docx uploads. */
export const fileBlobDir = (id: string) => path.join(UPLOADS_DIR, id)

/**
 * Versioned path inside a file's blob directory. The `rev` is a millisecond
 * timestamp so re-upload never overwrites bytes on disk; the old rev is what
 * lets us implement "restore previous version" later. Storage key layout is
 * deliberately `uploads/<id>/<rev>/<safeName>` so S3/OSS migration is just a
 * prefix rename (`uploads/` → bucket key) — see lib/storage.ts.
 */
export const fileBlobPath = (id: string, rev: number, safeName: string) =>
  path.join(fileBlobDir(id), String(rev), safeName)

export const pendingHtmlPath = (id: string) => path.join(PENDING_DIR, `${id}.html`)

/**
 * Sanitize a filename for on-disk storage.
 *  - strips directory separators (both / and \)
 *  - strips control characters & NUL
 *  - collapses whitespace
 *  - trims leading dots so we never produce `..` or hidden files
 *  - caps at 200 chars (leaves room for `<rev>/` on disk and .tmp suffix)
 * The result is safe to concatenate into a path without further escaping.
 */
export function sanitizeFilename(name: string): string {
  const base = (name || '').split(/[\\/]/).pop() || ''
  const cleaned = base
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
  return (cleaned || 'file').slice(0, 200)
}
