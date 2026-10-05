'use client'

// Client-side loader for the JitWord-Preview SDK.
//
// The SDK is a plain <script> tag:
//   <script src="https://jitword.com/preview_sdk/file-preview.bundle.js"></script>
// After load it exposes a single global — `window.JitWordFilePreview` — with:
//   createFilePreview(selector: string | HTMLElement) → { open(urlOrFile): Promise<void> }
//
// We memoize the promise per script URL so navigating between files doesn't
// refetch, and expose a `withTimeout` guard so a flaky CDN doesn't hang the
// page forever — callers can then fall back to native media tags / download.

export const PREVIEW_SDK_URL = 'https://jitword.com/preview_sdk/file-preview.bundle.js'
/** CDN directory that hosts the SDK's auxiliary assets (workers, stylesheets,
 *  renderer chunks). The SDK auto-detects this by reading
 *  `document.currentScript.src` at module-load time, but our dynamic
 *  `<script async>` injection makes currentScript null → the SDK falls back
 *  to `document.baseURI` (our own page URL) and 404s on
 *  `assets/package-inspector.worker-*.js`. Passing this explicitly via
 *  `createFilePreview(host, { assetPath })` bypasses that detection entirely. */
export const PREVIEW_SDK_ASSET_BASE = 'https://jitword.com/preview_sdk/'
export const PREVIEW_SDK_TIMEOUT_MS = 8000

export interface JitWordFilePreviewOpenOptions {
  /** Original filename (with extension). Required when the URL path itself
   *  carries no extension — e.g. our `/api/files/<id>/raw` route. */
  fileName?: string
  /** Explicit format hint (bare lowercase extension, e.g. `pdf`). Also fixes
   *  the "url-format-unknown" case and helps the SDK sniff ambiguous blobs. */
  format?: string
  /** Abort signal so navigating away mid-fetch cancels the download. */
  signal?: AbortSignal
  /** Enable SDK's in-memory url cache for this open. */
  cache?: boolean
  [k: string]: unknown
}

export interface JitWordFilePreviewInstance {
  open: (
    src: string | File | Blob | ArrayBuffer,
    options?: JitWordFilePreviewOpenOptions | string
  ) => Promise<void>
  preload?: (...formats: string[]) => Promise<void>
  close?: () => void
  destroy?: () => void
  on?: (event: string, handler: (payload: unknown) => void) => void
  off?: (event: string, handler: (payload: unknown) => void) => void
}

/** Options accepted by `createFilePreview(el, options)`. See bundle source:
 *  `PreviewPanel` defaults `toolbar:true, dropzone:true, imageLightbox:true`. */
export interface JitWordFilePreviewInitOptions {
  /** Hide the "拖拽文件到此处预览 / 选择文件上传" panel — we always know the
   *  file ahead of time so this chrome is noise (and it visually overlaps
   *  our own ViewHeader). Defaults to `true` in the SDK. */
  dropzone?: boolean
  /** SDK's own zoom / page-navigation toolbar above the rendered doc. Keep
   *  it — it's real value-add for PDF/pptx and doesn't collide with our UI. */
  toolbar?: boolean
  /** Restrict to specific extensions (bare, no dot). We let filetypes.ts
   *  decide upstream so we don't double-gate here. */
  formats?: string[]
  assetPath?: string
  urlCacheBudget?: number
  injectStyle?: boolean
  imageLightbox?: boolean
  onReady?: (p: unknown) => void
  onError?: (p: unknown) => void
  onPageChange?: (p: unknown) => void
  onProgress?: (p: unknown) => void
  [k: string]: unknown
}

export interface JitWordFilePreviewGlobal {
  createFilePreview: (
    selector: string | HTMLElement,
    options?: JitWordFilePreviewInitOptions
  ) => JitWordFilePreviewInstance
}

declare global {
  interface Window {
    JitWordFilePreview?: JitWordFilePreviewGlobal
  }
}

const cache = new Map<string, Promise<JitWordFilePreviewGlobal>>()

export function loadPreviewSdk(url: string = PREVIEW_SDK_URL): Promise<JitWordFilePreviewGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadPreviewSdk 仅可在浏览器端调用'))
  }
  if (window.JitWordFilePreview) return Promise.resolve(window.JitWordFilePreview)
  const hit = cache.get(url)
  if (hit) return hit

  const p = new Promise<JitWordFilePreviewGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-preview-sdk="${url}"]`)
    const el = existing || document.createElement('script')
    const timer = setTimeout(() => {
      reject(new Error('Preview SDK 加载超时'))
      // Do not resolve cache-hit path with a stale error — clear so retry works.
      cache.delete(url)
    }, PREVIEW_SDK_TIMEOUT_MS)

    const onLoad = () => {
      clearTimeout(timer)
      if (window.JitWordFilePreview) resolve(window.JitWordFilePreview)
      else {
        reject(new Error('Preview SDK 已加载但 window.JitWordFilePreview 未挂载'))
        cache.delete(url)
      }
    }
    const onError = () => {
      clearTimeout(timer)
      reject(new Error('Preview SDK 加载失败'))
      cache.delete(url)
    }

    el.addEventListener('load', onLoad)
    el.addEventListener('error', onError)

    if (!existing) {
      el.src = url
      el.async = true
      el.dataset.previewSdk = url
      document.head.appendChild(el)
    }
  })

  cache.set(url, p)
  return p
}

/** Test helper — drop the memo so unit tests / retries can force a reload. */
export function resetPreviewSdkCache() {
  cache.clear()
}
