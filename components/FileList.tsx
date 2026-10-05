'use client'

import type { FileRecord } from '@/lib/types'
import { editorRoute, fileViewRoute } from '@/lib/routes'
import Icon from './Icon'
import FileKindIcon, { fileKindLabel } from './FileKindIcon'
import ShareDialog from './ShareDialog'
import MoveToFolderDialog from './MoveToFolderDialog'
import RowActionsMenu, { type RowAction } from './RowActionsMenu'
import { useDriveActions } from './drive/useDriveActions'

export type ListVariant = 'drive' | 'shared' | 'recent' | 'trash'

interface Props {
  files: FileRecord[]
  variant: ListVariant
  actorId: string
  /** Folder the current list is being viewed from — used for context when
   *  moving a file out. `null` = root. */
  currentFolderId?: string | null
  /** Suppress empty-state CTA copy that mentions "上传" when the parent already
   *  shows the upload zone. */
  hideEmptyHint?: boolean
}

const TRASH_RETENTION_DAYS = 30

function fmt(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function relTime(ts?: number): string {
  if (!ts) return '从未打开'
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return fmt(ts).slice(0, 10)
}

function size(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function daysLeft(deletedAt?: number): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS
  const elapsed = (Date.now() - deletedAt) / 86400000
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor(elapsed))
}

/** URL that the file's primary "查看 / 编辑" CTA should hit. Jitword docs
 *  stay on /drive/files/[id] (EditorClient); every other kind goes to
 *  /drive/files/[id]/view. */
export function openHref(f: FileRecord, mode: 'edit' | 'preview'): string {
  return f.kind === 'jitword' ? editorRoute(f.id, mode) : fileViewRoute(f.id)
}

export default function FileList({
  files,
  variant,
  actorId,
  currentFolderId = null,
  hideEmptyHint = false
}: Props) {
  const drive = useDriveActions({ currentFolderId })
  const {
    busyId,
    shareTarget,
    moveTarget,
    renameFile,
    softDeleteFile,
    restoreFile,
    purgeFile,
    openShareFile,
    openMoveFile,
    closeShare,
    closeMove,
    router,
  } = drive

  if (files.length === 0) {
    // Drive variant is intentionally silent when empty — the <UploadZone>
    // right above already carries the "拖拽或选择文件" CTA. Other variants keep
    // their empty-state (they have no in-page upload affordance).
    if (hideEmptyHint || variant === 'drive') return null
    return <EmptyState variant={variant} />
  }

  const isTrash = variant === 'trash'

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {files.map(f => {
        const owned = f.ownerSubject === actorId
        const busy = busyId === f.id
        const canEdit = owned
        const label = fileKindLabel(f.kind, f.extension)

        // 主入口 = 卡片主体点击：drive/recent/shared 都指向"查看/编辑"（jitword 优先编辑），
        // 回收站场景卡片主体不做跳转（软删文件 raw 会 410）。
        const primaryHref = !isTrash ? openHref(f, canEdit && f.kind === 'jitword' ? 'edit' : 'preview') : null

        // ⋯ 下拉里的动作集合
        const actions: RowAction[] = []
        if (isTrash) {
          actions.push(
            { label: '还原', icon: 'restore', disabled: busy, onClick: () => restoreFile(f.id) },
            { label: '彻底删除', icon: 'trash', danger: true, divider: true, disabled: busy, onClick: () => purgeFile(f.id) }
          )
        } else {
          // 与"卡片主体跳转"重复的 primary 项不放进来（避免用户点两下都是同一动作），
          // 但仍提供"另一种模式"的入口：例如 primary 是"查看"时给"编辑"、primary 是"编辑"时给"查看"。
          if (canEdit && f.kind === 'jitword') {
            // primary 已经是"编辑" → 菜单里给"查看"
            actions.push({ label: '查看', icon: 'eye', onClick: () => router.push(openHref(f, 'preview')) })
          } else {
            // primary 就是"查看" → 保持菜单更精简，不加"查看"这一项
          }
          // v0.5.3 hotfix：drive + recent 都是"我拥有 or 我可见"的活跃文件视图；
          // shared 是别人共享给我的（只读语义，不给下载 / 移动 / 删除入口）。recent 的
          // file.parentId 精确指向真实归属目录（可能在根、也可能深藏几层 folder 下），
          // 移动到 / 移入回收站的语义与 drive 完全一致——之前把 owner 动作门在
          // `variant === 'drive'` 是过度收窄，用户在 /recent 里找不到"删除"就是这个 bug。
          const canManage = (variant === 'drive' || variant === 'recent') && owned
          if (canManage && f.originalPath) {
            actions.push({ label: '下载', icon: 'download', href: `/api/files/${f.id}/download`, download: true })
          }
          if (canManage) {
            if (f.kind === 'jitword') {
              actions.push({ label: '共享给同事', icon: 'users', disabled: busy, onClick: () => openShareFile(f) })
            } else {
              actions.push({ label: '分享链接', icon: 'share', disabled: busy, onClick: () => openShareFile(f) })
            }
            actions.push({ label: '移动到', icon: 'moveTo', disabled: busy, onClick: () => openMoveFile(f) })
            actions.push({ label: '重命名', icon: 'edit', disabled: busy, onClick: () => renameFile(f) })
            actions.push({
              label: '移入回收站',
              icon: 'trash',
              danger: true,
              divider: true,
              disabled: busy,
              onClick: () => softDeleteFile(f.id, f.name)
            })
          }
        }

        const body = (
          <>
            <div className="flex items-start gap-3">
              <FileKindIcon kind={f.kind} ext={f.extension} size={20} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-wps-text" title={f.name}>
                  {f.name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-wps-subtext">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-wps-subtext">
                    {label}
                  </span>
                  {variant === 'shared' && (
                    <span className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">
                      <Icon name="user" size={11} />
                      来自 {f.ownerName}
                    </span>
                  )}
                  {owned && variant !== 'drive' && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-wps-subtext">我的</span>
                  )}
                  {isTrash ? (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Icon name="trash" size={11} />
                      剩 {daysLeft(f.deletedAt)} 天
                    </span>
                  ) : variant === 'recent' ? (
                    <span className="flex items-center gap-1">
                      <Icon name="clock" size={11} />
                      {relTime(f.lastAccessedAt)} · 打开 {f.accessCount} 次
                    </span>
                  ) : (
                    <span>
                      {fmt(f.updatedAt)} · {size(f.size)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {variant === 'shared' && !isTrash && (
              <div className="mt-2 flex items-center gap-1 text-[11px] text-wps-subtext">
                <Icon name="eye" size={12} />
                只读
              </div>
            )}
          </>
        )

        return (
          <div
            key={f.id}
            className={
              'file-card group relative rounded-lg border bg-white p-4 shadow-sm transition hover:shadow-md ' +
              (isTrash ? 'border-dashed border-wps-border opacity-90' : 'border-wps-border')
            }
          >
            {/* top-right ⋯ menu —— z-20 显式压过下面 w-full 的 body <button>，
                避免任何祖先 transform/will-change 引入层叠上下文后 ⋯ 被主体盖住。 */}
            <div className="absolute right-2 top-2 z-20">
              <RowActionsMenu
                actions={actions}
                ariaLabel={`${f.name} 的操作`}
                title="更多操作"
                disabled={busy && actions.every(a => a.disabled)}
              />
            </div>

            {/* body：非 trash 时是可点主入口；trash 时不跳转 */}
            {primaryHref ? (
              <button
                type="button"
                onClick={() => router.push(primaryHref)}
                className="w-full text-left pr-8 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-wps-brand/40"
                aria-label={`打开 ${f.name}`}
              >
                {body}
              </button>
            ) : (
              <div className="pr-8">{body}</div>
            )}
          </div>
        )
      })}

      {shareTarget && shareTarget.kind === 'file' && (
        <ShareDialog
          target={{ kind: 'file', file: shareTarget.file }}
          actorId={actorId}
          onClose={closeShare}
          onSaved={() => {
            closeShare()
            router.refresh()
          }}
        />
      )}
      {moveTarget && moveTarget.kind === 'file' && (
        <MoveToFolderDialog
          title={`移动文档「${moveTarget.file.name}」`}
          fromFolderId={null}
          currentParentId={moveTarget.file.parentId ?? currentFolderId}
          actorId={actorId}
          onClose={closeMove}
          onMoved={() => {
            closeMove()
            router.refresh()
          }}
          endpoint={`/api/files/${moveTarget.file.id}`}
        />
      )}
    </div>
  )
}

function EmptyState({ variant }: { variant: ListVariant }) {
  const copy: Record<ListVariant, string> = {
    drive: '还没有你创建的文档，点右上角「上传文件」或「新建」开始。',
    shared: '暂时还没有同事共享给你的文档。',
    recent: '还没有打开记录，随便点开一个文档就会出现在这里。',
    trash: '回收站是空的。'
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-wps-border bg-white py-16 text-center text-sm text-wps-subtext">
      <Icon name={variant === 'trash' ? 'trash' : variant === 'shared' ? 'users' : 'folder'} size={28} className="opacity-40" />
      <span>{copy[variant]}</span>
    </div>
  )
}
