/**
 * Route-path seam (v0.6) — single source of truth for internal *page* URLs.
 *
 * Why this exists: the marketing site took over `/`, so the authenticated
 * drive app moved under a `/drive` prefix. Rewriting string literals across
 * ~15 components is error-prone and makes a future re-prefix expensive. This
 * module centralizes every page path so there's exactly one place to change.
 *
 * NOTE: this is about URL routes only. Filesystem paths (data dirs, blob keys)
 * live in lib/paths.ts — don't conflate the two.
 *
 * Scope — only *page* routes live here. These deliberately do NOT belong:
 *   · `/api/...` endpoints (stable REST surface, unrelated to routing) — keep
 *     inline at their call sites.
 *   · Cookie `path: '/'` in lib/auth.ts / lib/share.ts — cookies must be sent
 *     for the whole origin, so they stay root-scoped regardless of /drive.
 *   · Auth routes `/login` / `/register` — intentionally kept at the origin
 *     root (shared by the marketing site, the drive, and share-landing gates).
 *
 * The `/s/[code]` public-share subtree is byte-for-byte unchanged by this
 * migration — links already in circulation keep working.
 */

/** Prefix for the authenticated drive app. Flip this one line to re-home it. */
export const DRIVE = '/drive'

/** Top-level drive navigation (mirrors the Sidebar). */
export const DRIVE_HOME = DRIVE
export const RECENT = `${DRIVE}/recent`
export const SHARED = `${DRIVE}/shared`
export const MY_SHARES = `${DRIVE}/shares`
export const TRASH = `${DRIVE}/trash`
/** v0.7 · P0 · AI 智能面板（重复 / 敏感 / 标签 / 推荐 四合一）。 */
export const SMART = `${DRIVE}/smart`

/** Auth landing points (kept at root). */
export const LOGIN = '/login'
export const REGISTER = '/register'
export const MARKETING = '/'

/** A folder inside the drive root view (`/drive?folderId=…`). `null` → root. */
export function folderView(folderId: string | null | undefined): string {
  return folderId ? `${DRIVE}?folderId=${encodeURIComponent(folderId)}` : DRIVE
}

/** Editor route for a JitWord-native doc. `mode` is 'edit' | 'preview'. */
export function editorRoute(fileId: string, mode?: 'edit' | 'preview'): string {
  const base = `${DRIVE}/files/${fileId}`
  return mode ? `${base}?mode=${mode}` : base
}

/** Preview route for every non-JitWord kind (Preview SDK / native tags). */
export function fileViewRoute(fileId: string): string {
  return `${DRIVE}/files/${fileId}/view`
}

/**
 * Canonical "open this file" href given its kind — the one rule shared by
 * FileList / FileTree / TopBar search / UploadZone. `canEdit` selects edit vs
 * preview mode for JitWord docs; viewers always land in read-only.
 */
export function fileOpenRoute(
  f: { id: string; kind: string },
  opts: { canEdit?: boolean; mode?: 'edit' | 'preview' } = {}
): string {
  if (f.kind === 'jitword') return editorRoute(f.id, opts.mode ?? (opts.canEdit ? 'edit' : 'preview'))
  return fileViewRoute(f.id)
}

/** Public share-landing URL (root of a link; unchanged from v0.5). */
export function shareView(code: string): string {
  return `/s/${code}`
}
