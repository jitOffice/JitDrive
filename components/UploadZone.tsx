'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import { uploadAcceptAttr } from '@/lib/filetypes'
import { editorRoute } from '@/lib/routes'

interface Props {
  /** Upload destination folder id. `null`/undefined = root. */
  folderId?: string | null
}

const ACCEPT = uploadAcceptAttr()

/** Right-rail upload card (v0.5.1 two-column drive layout).
 *
 *  Redesigned from the old full-width drop banner into a compact vertical card
 *  that lives in a sticky sidebar next to the file list. Behaviour is
 *  unchanged — one POST per file to /api/files?folderId=…, then a cache
 *  refresh + navigation into the freshly created file. Dropped / picked
 *  multiple files are uploaded sequentially; the browser ends on the first
 *  new file so the user immediately sees their upload succeed. */
export default function UploadZone({ folderId = null }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [err, setErr] = useState<string | null>(null)

  async function sendAll(files: File[]) {
    if (!files.length || busy) return
    setBusy(true)
    setErr(null)
    setTotal(files.length)
    setDone(0)
    let firstId: string | null = null
    try {
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData()
        fd.append('file', files[i])
        const qs = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
        const r = await fetch(`/api/files${qs}`, { method: 'POST', body: fd })
        const j = await r.json()
        if (j.code !== 200) {
          setErr(j.message || `「${files[i].name}」上传失败`)
          return
        }
        if (!firstId) firstId = j.data.id
        setDone(i + 1)
      }
      // Invalidate the drive page's RSC cache BEFORE navigating. Without this,
      // browser-back restores the pre-upload snapshot and the new upload looks
      // like it "disappeared". refresh() is fire-and-forget, so we give React a
      // tick to swap the cache.
      await new Promise<void>(resolve => {
        router.refresh()
        setTimeout(resolve, 60)
      })
      if (firstId) router.push(editorRoute(firstId))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
      setTotal(0)
      setDone(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const progress = total > 0 ? `上传中 ${done}/${total}…` : busy ? '上传中…' : null

  return (
    <div
      onDragOver={e => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault()
        setDrag(false)
        const list = Array.from(e.dataTransfer.files || [])
        if (list.length) sendAll(list)
      }}
      className={
        'rounded-xl border bg-white p-4 shadow-sm transition ' +
        (drag ? 'border-wps-brand ring-2 ring-red-100' : 'border-wps-border')
      }
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-wps-brand">
          <Icon name="upload" size={18} />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-wps-text">上传文件</div>
          <div className="text-[11px] text-wps-subtext">{progress || '拖拽到下方，或点击选择'}</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={
          'flex min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-6 text-center transition disabled:cursor-not-allowed ' +
          (drag ? 'border-wps-brand bg-red-50' : 'border-wps-border hover:border-wps-brand hover:bg-slate-50')
        }
      >
        {busy ? (
          <>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-wps-brand border-t-transparent" />
            <span className="text-xs font-medium text-wps-brand">{progress}</span>
          </>
        ) : (
          <>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-red-50 text-wps-brand">
              <Icon name="upload" size={18} />
            </span>
            <span className="text-sm font-medium text-wps-text">点击选择文件</span>
            <span className="text-[11px] text-wps-subtext">支持多选 · 或直接把文件拖进来</span>
          </>
        )}
      </button>

      {err && (
        <div className="mt-2 flex items-start gap-1 rounded border border-red-100 bg-red-50 px-2 py-1.5 text-[11px] text-red-600">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="mt-3 border-t border-wps-border pt-2 text-[11px] leading-relaxed text-wps-subtext">
        支持 Word / Excel / PPT / PDF / OFD / 图片 / 音视频 / 压缩包；.docx 会自动导入 JitWord 编辑器。
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={e => {
          const list = Array.from(e.target.files || [])
          if (list.length) sendAll(list)
        }}
      />
    </div>
  )
}
