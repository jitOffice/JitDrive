'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import type { FileRecord } from '@/lib/types'
import Icon from './Icon'
import ShareDialog from './ShareDialog'
import { useUI } from './ui/UIProvider'
import { getEditorBridge } from '@/lib/editor-bridge'
import { DRIVE_HOME, editorRoute } from '@/lib/routes'

interface Props {
  file: FileRecord
  mode: 'edit' | 'preview'
  canEdit: boolean
  received: boolean
  ownerName: string
  /** Current logged-in user's cuid. Needed by ShareDialog's "邀请协作" tab to
   *  filter self out of the roster picker. */
  actorId: string
}

export default function FileHeader({ file, mode, canEdit, received, ownerName, actorId }: Props) {
  const ui = useUI()
  const docxRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<null | 'import'>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const editable = mode === 'edit' && canEdit && !received

  async function onPickDocx(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    ev.target.value = '' // reset so picking the same file twice still fires change
    if (!f) return
    if (!/\.docx$/i.test(f.name)) {
      ui.toast('仅支持 .docx 文件（Word 97-2003 .doc 请先另存为 .docx）', 'error')
      return
    }
    // SDK 1.1 caps imports at 30 MB (same ceiling as the app's own import).
    // Fail fast on the client so the user doesn't wait for the iframe round-
    // trip to reject with INVALID_CONFIG.
    if (f.size > 30 * 1024 * 1024) {
      ui.toast('文件超过 30 MB，请拆分后再导入', 'error')
      return
    }
    const ok = await ui.confirm({
      title: '导入 Word',
      message: (
        <div className="space-y-2">
          <div>
            将使用 <b>{f.name}</b>（{Math.round(f.size / 1024)} KB）替换当前文档正文。
          </div>
          <div className="text-xs text-wps-subtext">
            解析走 iframe-sdk 的高保真管线（浏览器内完成，不落服务端）· 表格 / 图片 / 列表 /
            样式都能保住 · 批注与页眉页脚会被识别但不写入。
          </div>
        </div>
      ),
      confirmText: '开始导入',
      tone: 'brand'
    })
    if (!ok) return
    const bridge = getEditorBridge()
    if (!bridge || bridge.fileId !== file.id) {
      ui.toast('编辑器尚未就绪，稍等一下再试', 'error')
      return
    }
    if (!bridge.canEdit) {
      ui.toast('预览模式无法导入，请先切换到编辑', 'error')
      return
    }
    setBusy('import')
    try {
      const result = await bridge.importDocxFile(f)
      // Build a concise toast suffix from whatever the SDK flagged. Keep it
      // under ~60 chars so the toast doesn't wrap awkwardly on 13" laptops.
      const bits: string[] = []
      if (result.applied === false) bits.push('未应用更改')
      if (result.importedComments) bits.push('批注未写入')
      if (result.headerFooter) bits.push('页眉页脚未写入')
      if (result.warnings?.length) bits.push(`${result.warnings.length} 条告警`)
      const suffix = bits.length ? ` · ${bits.join(' · ')}` : ''
      const tone = result.applied === false ? 'error' : 'success'
      ui.toast(`Word 导入完成${suffix}`, tone)
    } catch (e) {
      ui.toast(`导入失败：${(e as Error).message}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-wps-border bg-white px-4">
      <Link href={DRIVE_HOME} className="flex items-center gap-1 text-xs text-wps-subtext hover:text-wps-text">
        <Icon name="back" size={14} />
        我的云盘
      </Link>
      <div className="h-4 w-px bg-wps-border" />
      <div className="truncate text-sm font-medium text-wps-text" title={file.name}>
        {file.name}
      </div>
      {received ? (
        <span className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
          <Icon name="eye" size={11} />
          来自 {ownerName} · 只读
        </span>
      ) : (
        <span
          className={
            'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ' +
            (mode === 'edit' ? 'bg-red-50 text-wps-brand' : 'bg-slate-100 text-wps-subtext')
          }
        >
          <Icon name={mode === 'edit' ? 'edit' : 'eye'} size={11} />
          {mode === 'edit' ? '协同编辑' : '只读预览'}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {editable && (
          <>
            <input
              ref={docxRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={onPickDocx}
            />
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => docxRef.current?.click()}
              className="flex items-center gap-1 rounded border border-wps-border px-2 py-1 text-xs text-wps-text hover:bg-slate-50 disabled:opacity-50"
              title="用 .docx 文件替换当前文档正文（浏览器内 iframe-sdk 高保真解析）"
            >
              <Icon name="import" size={13} />
              {busy === 'import' ? '导入中…' : '导入 Word'}
            </button>
            <div className="h-4 w-px bg-wps-border" />
          </>
        )}
        {canEdit && !received && (
          mode === 'edit' ? (
            <Link
              href={editorRoute(file.id, 'preview')}
              className="flex items-center gap-1 rounded border border-wps-border px-2 py-1 text-xs text-wps-text hover:bg-slate-50"
            >
              <Icon name="eye" size={13} />
              切到预览
            </Link>
          ) : (
            <Link
              href={editorRoute(file.id, 'edit')}
              className="flex items-center gap-1 rounded bg-wps-brand px-2 py-1 text-xs text-white hover:bg-wps-brandDark"
            >
              <Icon name="edit" size={13} />
              去编辑
            </Link>
          )
        )}
        {canEdit && !received && (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1 rounded border border-wps-border px-2 py-1 text-xs text-wps-text hover:bg-slate-50"
            title="生成分享链接 / 邀请同事"
          >
            <Icon name="share" size={13} />
            分享
          </button>
        )}
        {canEdit && file.originalPath && (
          <a
            href={`/api/files/${file.id}/download`}
            className="flex items-center gap-1 rounded border border-wps-border px-2 py-1 text-xs text-wps-text hover:bg-slate-50"
            download
          >
            <Icon name="download" size={13} />
            下载原 .docx
          </a>
        )}
      </div>
      {shareOpen && (
        <ShareDialog target={{ kind: 'file', file }} actorId={actorId} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}
