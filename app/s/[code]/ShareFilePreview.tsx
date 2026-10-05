'use client'

import { useEffect, useRef, useState } from 'react'
import { loadPreviewSdk, PREVIEW_SDK_ASSET_BASE, type JitWordFilePreviewInstance } from '@/lib/preview-sdk'
import type { FileKind } from '@/lib/types'
import Icon from '@/components/Icon'
import { fileKindLabel } from '@/components/FileKindIcon'

export interface ShareFileInfo {
  name: string
  extension: string
  mime: string
  size: number
  kind: FileKind
}

interface Props {
  code: string
  file: ShareFileInfo
  /** Whether the owner allowed the visitor to download. When false the
   *  download card and fallback links are hidden. */
  allowDownload: boolean
  /** v0.5.2 · Folder-scoped share needs ?fileId=<id> on /raw to disambiguate
   *  which file in the shared subtree is being streamed. File-scoped share
   *  leaves this unset and the URL stays byte-identical to v0.5. */
  fileId?: string
}

/** Same-origin absolute URL to the public raw stream — the JitWord-Preview
 *  SDK chokes on relative paths (see MEMORY v0.4 note about `new URL(g)`
 *  with no base throwing `fetch-failed`). */
function rawUrl(code: string, download = false, fileId?: string): string {
  const build = (base: URL) => {
    if (download) base.searchParams.set('download', '1')
    if (fileId) base.searchParams.set('fileId', fileId)
    return base.href
  }
  if (typeof window === 'undefined') {
    const qs: string[] = []
    if (download) qs.push('download=1')
    if (fileId) qs.push(`fileId=${encodeURIComponent(fileId)}`)
    return `/api/share/${code}/raw${qs.length ? `?${qs.join('&')}` : ''}`
  }
  return build(new URL(`/api/share/${code}/raw`, window.location.origin))
}

const HUMAN_ERROR: Record<string, string> = {
  'url-format-unknown': '链接缺少扩展名，无法识别类型',
  'fetch-failed': '文件下载失败，请稍后重试',
  'fetch-aborted': '下载被中断，请点击"重新加载"',
  'url-scheme-unsupported': '仅支持 http / https 链接',
  'unsupported-extension': '当前文件类型暂不支持在线预览',
  'file-too-large': '文件过大，建议下载后本地查看',
  'text-file-too-large': '文本文件过大，建议下载后本地查看',
  'text-invalid': '文本编码无法识别',
  'legacy-doc': '该文件是旧版 .doc 二进制格式，请先转成 .docx',
  'zip64-unsupported': '该文档使用了暂不支持的 Zip64 格式',
  'unsafe-package': '文件未通过安全检查',
  'package-type-mismatch': '文件扩展名与实际内容不一致',
  'document-too-complex': '文档结构过于复杂',
  'layout-incompatible': '文档版式暂不兼容',
  'renderer-failed': '文档无法完成渲染'
}

/** Public read-only dispatcher. Chose one of five render strategies by kind. */
export default function ShareFilePreview({ code, file, allowDownload, fileId }: Props) {
  if (file.kind === 'previewable') return <SdkPreview code={code} file={file} allowDownload={allowDownload} fileId={fileId} />
  if (file.kind === 'image') return <ImagePreview code={code} file={file} allowDownload={allowDownload} fileId={fileId} />
  if (file.kind === 'audio') return <AudioPreview code={code} file={file} allowDownload={allowDownload} fileId={fileId} />
  if (file.kind === 'video') return <VideoPreview code={code} file={file} fileId={fileId} />
  return <DownloadOnly file={file} allowDownload={allowDownload} code={code} fileId={fileId} />
}

// ---------------- Preview SDK path ----------------

function SdkPreview({
  code,
  file,
  allowDownload,
  fileId
}: {
  code: string
  file: ShareFileInfo
  allowDownload: boolean
  fileId?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const instRef = useRef<JitWordFilePreviewInstance | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [err, setErr] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    setPhase('loading')
    setErr(null)
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''
    instRef.current = null

    ;(async () => {
      try {
        const sdk = await loadPreviewSdk()
        if (cancelled) return
        const inst = sdk.createFilePreview(host, {
          dropzone: false,
          toolbar: true,
          assetPath: PREVIEW_SDK_ASSET_BASE
        })
        instRef.current = inst
        const abs = rawUrl(code, false, fileId)
        await inst.open(abs, {
          fileName: file.name,
          format: file.extension || undefined,
          signal: ac.signal
        })
        if (!cancelled) setPhase('ready')
      } catch (e) {
        if (cancelled || (e as Error)?.name === 'AbortError') return
        const msg = (e as Error)?.message || String(e)
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
        instRef.current?.destroy?.()
      } catch {
        /* noop */
      }
      instRef.current = null
    }
  }, [code, file.name, file.extension, fileId, nonce])

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
          <div className="max-w-md text-xs text-wps-subtext">{err || '文件加载失败'}</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setNonce(n => n + 1)}
              className="rounded border border-wps-border px-3 py-1 text-xs text-wps-text hover:bg-slate-50"
            >
              重新加载
            </button>
            {allowDownload && (
              <a
                href={rawUrl(code, true, fileId)}
                className="rounded bg-wps-brand px-3 py-1 text-xs text-white hover:bg-wps-brandDark"
                download
              >
                下载文件
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------- Native media paths ----------------

function ImagePreview({
  code,
  file,
  allowDownload,
  fileId
}: {
  code: string
  file: ShareFileInfo
  allowDownload: boolean
  fileId?: string
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const url = rawUrl(code, false, fileId)
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
        <DownloadOnly file={file} allowDownload={allowDownload} code={code} fileId={fileId} note="图片加载失败" />
      )}
    </div>
  )
}

function AudioPreview({
  code,
  file,
  allowDownload,
  fileId
}: {
  code: string
  file: ShareFileInfo
  allowDownload: boolean
  fileId?: string
}) {
  const url = rawUrl(code, false, fileId)
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-50 p-6">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-fuchsia-50 text-fuchsia-600">
        <Icon name="audio" size={28} />
      </div>
      <div className="text-sm font-medium text-wps-text">{file.name}</div>
      <audio src={url} controls className="w-full max-w-lg" />
      {allowDownload && (
        <a href={rawUrl(code, true, fileId)} download className="text-xs text-wps-brand hover:underline">
          下载原始音频
        </a>
      )}
    </div>
  )
}

function VideoPreview({ code, file, fileId }: { code: string; file: ShareFileInfo; fileId?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-900 p-4">
      <video src={rawUrl(code, false, fileId)} controls className="max-h-full max-w-full rounded bg-black shadow-lg" aria-label={file.name} />
    </div>
  )
}

function DownloadOnly({
  file,
  allowDownload,
  code,
  fileId,
  note
}: {
  file: ShareFileInfo
  allowDownload: boolean
  code: string
  fileId?: string
  note?: string
}) {
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
        {allowDownload ? (
          <div className="mt-4 flex justify-center gap-2">
            <a
              href={rawUrl(code, true, fileId)}
              className="rounded bg-wps-brand px-3 py-1.5 text-xs text-white hover:bg-wps-brandDark"
              download
            >
              下载文件
            </a>
          </div>
        ) : (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
            分享者关闭了下载权限，仅可在线查看。
          </div>
        )}
      </div>
    </div>
  )
}
