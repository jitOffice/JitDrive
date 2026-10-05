'use client'

import { useEffect, useRef, useState } from 'react'
import type { PublicConfig } from '@/lib/jitword'
import Icon from './Icon'
import { registerEditorBridge, type EditorBridge } from '@/lib/editor-bridge'

// Loader channel pinned to `v1` — the manifest currently serves 1.1.0 there,
// which is the first version to ship `document.importDocx`. Switching this
// URL is the one-line upgrade path when we adopt a newer channel.
const LOADER_URL = 'https://inner.jitword.com/px-editor/iframe-sdk/v1/loader.js'

interface Props {
  fileId: string
  docId: string
  fileName: string
  mode: 'edit' | 'preview'
  hasPendingImport: boolean
  cfg: PublicConfig
  debug?: boolean
}

type Status = 'loading-sdk' | 'connecting' | 'ready' | 'injecting' | 'imported' | 'error'

function loadSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window missing'))
  if (window.JitWord) return Promise.resolve()
  return new Promise((resolve, reject) => {
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

export default function EditorClient({ fileId, docId, fileName, mode, hasPendingImport, cfg, debug = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<JitWordEditorInstance | null>(null)
  const [status, setStatus] = useState<Status>('loading-sdk')
  const [log, setLog] = useState<string[]>([])
  // Surface non-fatal import outcome details (comments / headerFooter /
  // warnings) so the debug strip can show them. Kept as string[] for
  // simplicity — the toast path in FileHeader handles user-visible copy.
  const [lastImportNotes, setLastImportNotes] = useState<string[]>([])

  function pushLog(msg: string) {
    setLog(prev => [...prev.slice(-4), msg])
  }

  useEffect(() => {
    let cancelled = false

    async function getEmbedTicket(): Promise<string> {
      pushLog('getEmbedTicket() called → fetching ticket')
      const r = await fetch(`/api/files/${fileId}/ticket?mode=${mode}`, { method: 'POST', cache: 'no-store' })
      const j = await r.json()
      if (j.code !== 200) throw new Error(j.message || 'ticket failed')
      pushLog('ticket received, exchanging in iframe')
      return j.data.ticket as string
    }

    // Shared import path used by both the auto-run on pendingImport AND the
    // FileHeader's manual "导入 Word" button (via the editor bridge). Keeps
    // the ready-wait, scope check, and post-import bookkeeping in one place.
    async function runImportDocx(source: File | ArrayBuffer, displayName: string): Promise<JitWordImportDocxResult> {
      const editor = editorRef.current
      if (!editor) throw new Error('编辑器未就绪')
      if (mode !== 'edit') throw new Error('预览模式无法导入')
      setStatus('injecting')
      pushLog(`importDocx(${displayName}) start`)
      const result = await editor.importDocx({
        content: source as ArrayBuffer,
        fileName: displayName,
        mode: 'replace',
        // Import can be slow on 20MB decks; the SDK default is 60 s but we
        // also want to give the collaborative model time to settle.
        timeout: 90000
      })
      pushLog(`importDocx applied=${result.applied} warnings=${result.warnings?.length ?? 0}`)
      const notes: string[] = []
      if (result.importedComments) notes.push(`检测到批注（未落库）`)
      if (result.headerFooter) notes.push(`检测到页眉页脚（未落库）`)
      if (result.warnings?.length) notes.push(...result.warnings.slice(0, 3))
      setLastImportNotes(notes)
      // Persist immediately — the collaborative `contentChanged` fires async
      // but save() forces a flush so a quick tab close doesn't lose work.
      try {
        await editor.save({ force: true })
        pushLog('save ok')
      } catch (e) {
        pushLog(`save err: ${errText(e)}`)
      }
      setStatus('imported')
      return result
    }

    async function boot() {
      try {
        await loadSdk()
        if (cancelled) return
        if (!window.JitWord) throw new Error('JitWord global missing after loader')
        setStatus('connecting')
        const editor = window.JitWord.createEditor({
          container: containerRef.current!,
          editorUrl: cfg.editorUrl,
          apiBase: cfg.apiBase,
          docId,
          tenantKey: cfg.tenantKey,
          providerKey: cfg.providerKey,
          mode: mode === 'preview' ? 'preview' : 'full',
          // Per iframe-sdk docs (inner.jitword.com/#frontend), `ui.chrome`
          // controls how much editor chrome the iframe renders:
          //   'host'    → only the document body (no 顶栏, no 工具条)
          //   'toolbar' → edit toolbar only, hides 顶栏 / "文件" / "AI"
          //   'full'    → 顶栏 + 编辑工具条 + 右侧工具条 (大纲 / 评论等)
          // Our FileHeader already carries 返回 / 模式切换 / 下载原 docx /
          // 导入 Word, so we intentionally DON'T want JitWord's own 顶栏 to
          // double up. 'toolbar' keeps only the edit ribbon. Preview stays
          // 'host' for a clean reading surface.
          ui:
            mode === 'preview'
              ? { readonly: true, theme: 'light', chrome: 'host' }
              : { readonly: false, theme: 'light', chrome: 'toolbar' },
          auth: { mode: 'embed-ticket', getEmbedTicket },
          timeout: 60000,
          debug: { enabled: debug }
        })
        editorRef.current = editor

        // Imperative bridge for FileHeader's "导入 Word" button. Passing a
        // File straight through to editor.importDocx — the iframe's parser
        // handles it locally, no server round-trip.
        const bridge: EditorBridge = {
          fileId,
          canEdit: mode === 'edit',
          importDocxFile: async (file: File) => {
            await editor.ready()
            return runImportDocx(file, file.name || 'untitled.docx')
          }
        }
        registerEditorBridge(bridge)

        editor.on('ready', () => {
          if (cancelled) return
          setStatus('ready')
          pushLog('editor ready')
          // Reveal the full editor menu bar in edit mode. The initial config
          // ui may be overridden by the server-side app profile, so we also
          // issue an imperative setToolbar('full') and retry a few times —
          // a call fired the instant 'ready' fires can be dropped before the
          // SPA runtime is listening.
          if (mode === 'edit') ensureFullToolbar(editor, pushLog)
        })
        editor.on('error', (p) => pushLog(`error: ${JSON.stringify(p)}`))
        editor.on('auth.refreshRequired', () => pushLog('ticket refresh required (auto)'))
        editor.on('auth.sessionExpired', () => pushLog('session expired — reload'))
        editor.on('saveStateChanged', (p) => pushLog(`save: ${JSON.stringify(p)}`))
        editor.on('diagnostic', (p) => pushLog(`diag: ${JSON.stringify(p)}`))

        // Auto-run the initial import for freshly uploaded docx files. The
        // server stores the bytes but never parses them (see POST /api/files)
        // — we stream them back via /raw and hand them to the SDK.
        if (mode === 'edit' && hasPendingImport) {
          editor
            .ready()
            .then(async () => {
              if (cancelled) return
              const buf = await fetchRawAsArrayBuffer(fileId)
              if (cancelled) return
              await runImportDocx(buf, fileName)
              // Clear the flag so a page refresh doesn't re-import over the
              // user's edits. Non-fatal if it fails — the doc content is
              // already correct; at worst we re-import next time.
              await fetch(`/api/files/${fileId}/content`, { method: 'POST' }).catch(() => undefined)
            })
            .catch(e => {
              if (cancelled) return
              pushLog(`auto-import skipped: ${errText(e)}`)
            })
        }
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        pushLog((e as Error).message)
      }
    }

    boot()
    return () => {
      cancelled = true
      // Only clear the bridge if the current registered instance is ours —
      // a rapid fileId swap can mount N+1 before N's cleanup fires.
      if (editorRef.current) registerEditorBridge(null)
      try {
        editorRef.current?.destroy()
      } catch {
        /* noop */
      }
      editorRef.current = null
    }
  }, [fileId, docId, fileName, mode, hasPendingImport, cfg, debug])

  return (
    <div className="flex h-full w-full flex-col">
      {debug && (
        <div className="flex h-8 shrink-0 items-center gap-3 border-b border-wps-border bg-white px-4 text-[11px] text-wps-subtext">
          <span>
            docId <code className="rounded bg-slate-100 px-1 text-wps-text">{docId}</code>
          </span>
          <span>·</span>
          <span>{fileName}</span>
          <span>·</span>
          <span>
            状态：
            <span
              className={
                'ml-1 rounded px-1 py-0.5 font-medium ' +
                (status === 'ready' || status === 'imported'
                  ? 'bg-emerald-50 text-emerald-600'
                  : status === 'error'
                    ? 'bg-red-50 text-red-600'
                    : 'bg-amber-50 text-amber-600')
              }
            >
              {
                {
                  'loading-sdk': '加载 SDK',
                  connecting: '建立会话',
                  ready: '已就绪',
                  injecting: '导入 Word',
                  imported: '导入完成',
                  error: '异常'
                }[status]
              }
            </span>
          </span>
          {lastImportNotes.length > 0 && (
            <span className="ml-2 truncate text-amber-600" title={lastImportNotes.join('\n')}>
              {lastImportNotes[0]}
              {lastImportNotes.length > 1 ? ` (+${lastImportNotes.length - 1})` : ''}
            </span>
          )}
          {log.length > 0 && (
            <span className="ml-auto truncate font-mono text-[10px] opacity-70">
              {log.slice(-3).join('  |  ')}
            </span>
          )}
        </div>
      )}
      {!debug && status === 'error' && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-1.5 text-xs text-red-600">
          <Icon name="alert" size={14} />
          <span>编辑器加载异常，请刷新页面重试。</span>
        </div>
      )}
      <div className="editor-shell flex-1">
        <div ref={containerRef} className="jitword-container" />
      </div>
    </div>
  )
}

function errText(e: unknown): string {
  const err = e as { code?: string | number; message?: string }
  return String(err?.code || err?.message || e)
}

/** Pull the raw docx bytes back through our authenticated /raw route. Same-
 *  origin fetch, session cookie rides along automatically. Kept separate from
 *  `runImportDocx` so the caller can await it before flipping UI to
 *  'injecting' (download of a 30 MB deck isn't instantaneous). */
async function fetchRawAsArrayBuffer(fileId: string): Promise<ArrayBuffer> {
  const r = await fetch(`/api/files/${fileId}/raw`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`raw fetch failed (${r.status})`)
  return await r.arrayBuffer()
}

// Imperatively force the full editor menu/toolbar to be visible. Retries with
// backoff because the SDK can silently drop a ui.setToolbar request that lands
// before the iframe SPA has finished wiring its own command handlers.
async function ensureFullToolbar(editor: JitWordEditorInstance, log: (m: string) => void) {
  const setter = (editor as unknown as { setToolbar?: (p: string) => Promise<unknown> }).setToolbar
  if (typeof setter !== 'function') {
    log('setToolbar not available in this SDK build')
    return
  }
  const delays = [0, 800, 1800, 3200]
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise(res => setTimeout(res, delays[i]))
    try {
      await setter.call(editor, 'full')
      log(`setToolbar('full') #${i} ok`)
    } catch (e) {
      log(`setToolbar('full') #${i} err: ${errText(e)}`)
    }
  }
}
