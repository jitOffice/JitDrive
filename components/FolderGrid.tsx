'use client'

import Link from 'next/link'
import type { FolderRecord } from '@/lib/types'
import { folderView } from '@/lib/routes'
import Icon from './Icon'
import RowActionsMenu, { type RowAction } from './RowActionsMenu'
import MoveToFolderDialog from './MoveToFolderDialog'
import ShareDialog from './ShareDialog'
import { useDriveActions } from './drive/useDriveActions'

interface Props {
  folders: FolderRecord[]
  /** Folder currently being viewed. Used as the "from" context when moving a
   *  sub-folder out. */
  currentFolderId: string | null
  actorId: string
  /** Set when this grid is rendered on the drive page (owner context); hides
   *  destructive actions elsewhere (e.g. shared views). */
  canManage?: boolean
}

/** Card grid for folders.
 *
 *  v0.5.3 UI refactor：卡片主体（icon + name + meta）=「进入」快捷入口，
 *  原本底部一行 5 按钮（进入 / 分享 / 移动到 / 重命名 / 删除）全部折叠到
 *  右上角的 ⋯ 下拉里（hover 250ms / click / Esc / 外点击关闭）。
 *  与 FileList / FileTree 三处共用 `useDriveActions` hook 与 `<RowActionsMenu>`。 */
export default function FolderGrid({ folders, currentFolderId, actorId, canManage = true }: Props) {
  const drive = useDriveActions({ currentFolderId })
  const {
    busyId,
    shareTarget,
    moveTarget,
    renameFolder,
    softDeleteFolder,
    openShareFolder,
    openMoveFolder,
    closeShare,
    closeMove,
    router,
  } = drive

  if (folders.length === 0) return null

  return (
    <>
      <div className="mb-2 text-xs font-medium text-wps-subtext">文件夹</div>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {folders.map(f => {
          const busy = busyId === f.id
          const actions: RowAction[] = [
            {
              label: '进入',
              icon: 'chevronRight',
              onClick: () => router.push(folderView(f.id))
            },
          ]
          if (canManage) {
            actions.push(
              {
                label: '分享',
                icon: 'share',
                disabled: busy,
                onClick: () => openShareFolder(f)
              },
              {
                label: '移动到',
                icon: 'moveTo',
                disabled: busy,
                onClick: () => openMoveFolder(f)
              },
              {
                label: '重命名',
                icon: 'edit',
                disabled: busy,
                onClick: () => renameFolder(f)
              },
              {
                label: '移入回收站',
                icon: 'trash',
                danger: true,
                divider: true,
                disabled: busy,
                onClick: () => softDeleteFolder(f)
              }
            )
          }

          return (
            <div
              key={f.id}
              className="folder-card group relative rounded-lg border border-wps-border bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              {/* top-right ⋯ menu (absolute so it doesn't shift with meta wrap)
                  z-20 显式压过下面 w-full 的 <Link> 主体，防祖先 transform 引入层叠上下文后覆盖 */}
              <div className="absolute right-2 top-2 z-20">
                <RowActionsMenu
                  actions={actions}
                  ariaLabel={`${f.name} 的操作`}
                  title="更多操作"
                  disabled={busy && !canManage}
                />
              </div>

              {/* body = primary click → enter folder */}
              <Link
                href={folderView(f.id)}
                className="flex items-start gap-3 pr-8"
                aria-label={`进入 ${f.name}`}
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded bg-amber-50 text-amber-600">
                  <Icon name="folder" size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-wps-text" title={f.name}>
                    {f.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-wps-subtext">
                    <span>{typeof f.childCount === 'number' ? `包含 ${f.childCount} 项` : '—'}</span>
                    <span>·</span>
                    <span>{new Date(f.updatedAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
              </Link>
            </div>
          )
        })}
      </div>

      {moveTarget && moveTarget.kind === 'folder' && (
        <MoveToFolderDialog
          title={`移动文件夹「${moveTarget.folder.name}」`}
          fromFolderId={moveTarget.folder.id}
          currentParentId={currentFolderId}
          actorId={actorId}
          onClose={closeMove}
          onMoved={() => {
            closeMove()
            router.refresh()
          }}
          endpoint={`/api/folders/${moveTarget.folder.id}`}
        />
      )}
      {shareTarget && shareTarget.kind === 'folder' && (
        <ShareDialog
          target={{ kind: 'folder', folder: shareTarget.folder }}
          actorId={actorId}
          onClose={closeShare}
        />
      )}
    </>
  )
}
