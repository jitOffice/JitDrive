'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicConfig } from '@/lib/jitword'
import Icon from '@/components/Icon'

// Loader channel pinned to v1 (see EditorClient). Shared with the drive — the
// SDK is loaded once per page regardless of which client mounts it.
const LOADER_URL = 'https://inner.jitword.com/px-editor/iframe-sdk/v1/loader.js'

interface Props {
  code: string
  docId: string
  fileName: string
  cfg: PublicConfig
  /** v0.5.2 · When the link is folder-scoped, /api/share/[code]/ticket needs
   *  ?fileId=<id> to know which descendant file to issue a viewer ticket for.
   *  File-scoped share leaves this undefined and the URL stays byte-identical
   *  to v0.5. */
  fileId?: string
}

type Status = 'loading-sdk' | 'connecting' | 'ready' | 'error'

async function loadSdk(): Promise<void> {
  if (typeof window === 'undefined') throw new Error('window missing')
  if (window.JitWord) return
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LOADER_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('loader.js failed')))
      return
    }
    const s = document.createElement('script')
    s.src = LOADER_URL
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('loader.js network error'))
    document.head.appendChild(s)
  })
}

/** Anonymous visitor's read-only view of a shared docx. Deliberately a
 *  separate component from EditorClient — no import / no toolbar-retry /
 *  no pendingImport auto-run; the only thing that differs from a "preview"
 *  mount is that the ticket comes from `/api/share/[code]/ticket` (which
 *  the browser can hit without any JitDrive session). */
export default function ShareEditorClient({ code, docId, fileName, cfg, fileId }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<JitWordEditorInstance | null>(null)
  const [status, setStatus] = useState<Status>('loading-sdk')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function getEmbedTicket(): Promise<string> {
      const url = fileId ? `/api/share/${code}/ticket?fileId=${encodeURIComponent(fileId)}` : `/api/share/${code}/ticket`
      const r = await fetch(url, { method: 'POST', cache: 'no-store' })
      const j = await r.json()
      if (j?.code !== 200) throw new Error(j?.message || 'ticket failed')
      return j.data.ticket as string
    }

    ;(async () => {
      try {
        await loadSdk()
        if (cancelled) return
        if (!window.JitWord) throw new Error('JitWord global missing after loader')
        setStatus('connecting')
        const editor = window.JitWord.createEditor({
          container: hostRef.current!,
          editorUrl: cfg.editorUrl,
          apiBase: cfg.apiBase,
          docId,
          tenantKey: cfg.tenantKey,
          providerKey: cfg.providerKey,
          mode: 'preview',
          ui: { readonly: true, theme: 'light', chrome: 'host' },
          auth: { mode: 'embed-ticket', getEmbedTicket },
          timeout: 60000
        })
        editorRef.current = editor
        editor.on('ready', () => {
          if (!cancelled) setStatus('ready')
        })
        editor.on('error', (p: unknown) => {
          if (cancelled) return
          setStatus('error')
          setErr(JSON.stringify(p))
        })
        editor.on('auth.sessionExpired', () => {
          if (cancelled) return
          setStatus('error')
          setErr('分享会话已过期，请刷新页面')
        })
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setErr((e as Error).message)
      }
    })()

    return () => {
      cancelled = true
      try {
        editorRef.current?.destroy()
      } catch {
        /* noop */
      }
      editorRef.current = null
    }
  }, [code, docId, cfg, fileId])

  return (
    <div className="relative flex h-full w-full flex-col">
      {status !== 'ready' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-wps-subtext">
          {status === 'error' ? (
            <div className="flex flex-col items-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-50 text-amber-600">
                <Icon name="alert" size={20} />
              </div>
              <div>加载失败：{err || '未知错误'}</div>
            </div>
          ) : (
            <div>正在打开「{fileName}」…</div>
          )}
        </div>
      )}
      <div ref={hostRef} className="h-full w-full" />
    </div>
  )
}
