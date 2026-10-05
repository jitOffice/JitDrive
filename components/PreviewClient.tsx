'use client'

import { useEffect, useRef, useState } from 'react'
import type { FileRecord } from '@/lib/types'
import { loadPreviewSdk, PREVIEW_SDK_ASSET_BASE, type JitWordFilePreviewInstance } from '@/lib/preview-sdk'
import Icon from './Icon'
import { fileKindLabel } from './FileKindIcon'

interface Props {
  file: FileRecord
  /** Re-run preview when the file identity changes (SPA / next-refresh). */
  rawUrl?: string
}

/** Friendly Chinese messages for the bare error codes the SDK throws. Without
 *  this map the "预览不可用" overlay just shows e.g. "fetch-failed" which
 *  tells the user nothing actionable. */
const HUMAN_ERROR: Record<string, string> = {
  'url-format-unknown': '链接中不含文件扩展名，请在打开时显式指定格式（内部错误：url-format-unknown）',
  'fetch-failed': '文件下载失败，请检查登录状态或稍后重试（内部错误：fetch-failed）',
  'fetch-aborted': '文件下载被中断，请点击"重新加载"（内部错误：fetch-aborted）',
  'url-scheme-unsupported': '仅支持 http / https 链接（内部错误：url-scheme-unsupported）',
  'unsupported-extension': '当前文件类型暂不支持在线预览',
  'file-too-large': '文件超过 50 MB，建议下载后本地查看',
  'text-file-too-large': '文本文件超过 10 MB，建议下载后本地查看',
  'text-invalid': '文本编码无法识别',
  'legacy-doc': '该文件是旧版 Word (.doc) 二进制格式，请先在 Word 中另存为 .docx',
  'zip64-unsupported': '该文档使用了暂不支持的 Zip64 格式',
  'unsafe-package': '文件未通过安全检查',
  'package-type-mismatch': '文件扩展名与实际内容不一致',
  'document-too-complex': '文档结构过于复杂',
  'layout-incompatible': '文档版式暂不兼容',
  'renderer-failed': '文档无法完成渲染',
}

/** Renders a non-jitword file. Chooses a strategy by FileKind:
 *   previewable → JitWord-Preview SDK
 *   image / audio / video → native <img>/<audio>/<video>
 *   archive / other / jitword → download card (jitword shouldn't reach here;
 *     the /files/[id] page redirects docx to EditorClient)
 *
 *  Auth: all fetches are same-origin, so the session cookie rides along. The
 *  Preview SDK hits /api/files/<id>/raw directly — see ARCHITECTURE §4.16. */
export default function PreviewClient({ file, rawUrl }: Props) {
  const url = rawUrl || `/api/files/${file.id}/raw`
  if (file.kind === 'previewable') return <SdkPreview file={file} url={url} />
  if (file.kind === 'image') return <ImagePreview file={file} url={url} />
  if (file.kind === 'audio') return <AudioPreview file={file} url={url} />
  if (file.kind === 'video') return <VideoPreview file={file} url={url} />
  return <DownloadOnly file={file} url={url} />
}

// ---------------- Preview SDK path ----------------

function SdkPreview({ file, url }: { file: FileRecord; url: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<JitWordFilePreviewInstance | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    setPhase('loading')
    setErr(null)
    const host = hostRef.current
    if (!host) return
    // Clear prior render so remount doesn't stack.
    host.innerHTML = ''
    instanceRef.current = null

    ;(async () => {
      try {
        const sdk = await loadPreviewSdk()
        if (cancelled) return
        // createFilePreview options:
        //   • dropzone:false  — hides the SDK's own "拖拽文件到此处预览 /
        //     选择文件上传" panel. We already know the file ahead of time
        //     (came from the drive), and the panel visually collides with
        //     our own ViewHeader. Keeping it here is what let users hit
        //     the SDK's "select file" button and get a working preview
        //     while the URL-based open() we call was silently failing.
        //   • toolbar:true    — keep the zoom / page-nav toolbar for PDF
        //     and friends; it sits inside the host, not above it, so no
        //     chrome conflict with our header.
        //   • assetPath       — CRITICAL. The SDK's worker-URL resolver
        //     `b2()` falls back to `document.currentScript.src` at module
        //     load, but because we inject the bundle dynamically with
        //     `async=true`, currentScript is null and it ends up stitching
        //     `assets/package-inspector.worker-*.js` onto the *page* URL
        //     instead of the CDN. Every xlsx/pptx/docx open used to hit
        //     `/files/<id>/assets/package-inspector.worker-*.js` → 404 and
        //     fall back to a slow sync zip inspector. Pinning the base to
        //     the CDN fixes it cleanly.
        const inst = sdk.createFilePreview(host, {
          dropzone: false,
          toolbar: true,
          assetPath: PREVIEW_SDK_ASSET_BASE,
        })
        instanceRef.current = inst
        // CRITICAL: the SDK's internal URL parser is `new URL(g)` with no base,
        // which throws TypeError for a relative path like `/api/files/<id>/raw`
        // and gets re-wrapped as `fetch-failed` before we ever reach the
        // extension check. So we MUST hand it an absolute URL. (This is the
        // real reason TopBar uploads still showed "预览不可用" after the
        // fileName/format hint fix — my earlier diagnosis was incomplete.)
        const absUrl = new URL(url, window.location.origin).href
        // open(url, opts): fileName+format ensure the SDK's ph(url) extension
        // sniff can never fail even if the raw route drops the filename.
        await inst.open(absUrl, {
          fileName: file.name,
          format: file.extension || undefined,
          signal: ac.signal
        })
        if (!cancelled) setPhase('ready')
      } catch (e) {
        if (cancelled || (e as Error)?.name === 'AbortError') return
        const msg = (e as Error)?.message || String(e)
        // The SDK throws bare code strings like "url-format-unknown" /
        // "fetch-failed" / "unsupported-extension"; map the common ones to
        // friendlier Chinese so the overlay actually tells the user what to
        // try next.
        setErr(HUMAN_ERROR[msg] || msg)
        setPhase('error')
      }
    })()

    return () => {
      cancelled = true
      try {
        ac.abort()
      } catch {
        /* noop */
      }
      try {
        instanceRef.current?.destroy?.()
      } catch {
        /* noop — SDK might not implement destroy */
      }
      instanceRef.current = null
    }
  }, [url, reloadNonce, file.name, file.extension])

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full overflow-auto bg-slate-50" />
      {phase === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-wps-subtext">
          正在加载 {fileKindLabel(file.kind, file.extension)} 预览…
        </div>
      )}
      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 px-6 text-center">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-600">
            <Icon name="alert" size={20} />
          </div>
          <div className="text-sm text-wps-text">预览不可用</div>
          <div className="max-w-md text-xs text-wps-subtext">{err || 'JitWord-Preview SDK 加载失败，可尝试下载后本地查看。'}</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setReloadNonce(n => n + 1)}
              className="rounded border border-wps-border px-3 py-1 text-xs text-wps-text hover:bg-slate-50"
            >
              重新加载
            </button>
            <a
              href={`/api/files/${file.id}/download`}
              className="rounded bg-wps-brand px-3 py-1 text-xs text-white hover:bg-wps-brandDark"
              download
            >
              下载文件
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- Native media paths ----------------

function ImagePreview({ file, url }: { file: FileRecord; url: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-auto bg-slate-50 p-6">
      {status !== 'error' ? (
        <img
          src={url}
          alt={file.name}
          onLoad={() => setStatus('ready')}
          onError={() => setStatus('error')}
          className="max-h-full max-w-full rounded shadow"
        />
      ) : (
        <DownloadOnly file={file} url={url} note="图片加载失败" />
      )}
    </div>
  )
}

function AudioPreview({ file, url }: { file: FileRecord; url: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-50 p-6">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-fuchsia-50 text-fuchsia-600">
        <Icon name="audio" size={28} />
      </div>
      <div className="text-sm font-medium text-wps-text">{file.name}</div>
      <audio src={url} controls className="w-full max-w-lg" />
      <a
        href={`/api/files/${file.id}/download`}
        className="text-xs text-wps-brand hover:underline"
        download
      >
        下载原始音频
      </a>
    </div>
  )
}

function VideoPreview({ file, url }: { file: FileRecord; url: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-900 p-4">
      <video
        src={url}
        controls
        className="max-h-full max-w-full rounded bg-black shadow-lg"
        aria-label={file.name}
      />
    </div>
  )
}

function DownloadOnly({ file, url, note }: { file: FileRecord; url: string; note?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-wps-border bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded bg-slate-100 text-slate-500">
          <Icon name="file" size={24} />
        </div>
        <div className="truncate text-sm font-medium text-wps-text" title={file.name}>
          {file.name}
        </div>
        <div className="mt-1 text-xs text-wps-subtext">
          {note || `${fileKindLabel(file.kind, file.extension)} · ${(file.size / 1024).toFixed(1)} KB · 该类型不支持在线预览`}
        </div>
        <div className="mt-4 flex justify-center gap-2">
          <a
            href={url}
            className="rounded border border-wps-border px-3 py-1.5 text-xs text-wps-text hover:bg-slate-50"
            target="_blank"
            rel="noreferrer"
          >
            在新标签打开
          </a>
          <a
            href={`/api/files/${file.id}/download`}
            className="rounded bg-wps-brand px-3 py-1.5 text-xs text-white hover:bg-wps-brandDark"
            download
          >
            下载文件
          </a>
        </div>
      </div>
    </div>
  )
}
