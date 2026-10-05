'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { FileRecord, FolderRecord } from '@/lib/types'
import { DRIVE, editorRoute, fileViewRoute } from '@/lib/routes'
import FileKindIcon, { fileKindLabel } from './FileKindIcon'
import Icon from './Icon'
import RowActionsMenu, { type RowAction } from './RowActionsMenu'
import MoveToFolderDialog from './MoveToFolderDialog'
import ShareDialog from './ShareDialog'
import { useDriveActions } from './drive/useDriveActions'

interface Props {
  folders: FolderRecord[]
  files: FileRecord[]
  /** Folder currently being viewed (from ?folderId=). Ancestors of this id
   *  auto-expand on mount so the user's context is visible in the tree. */
  currentFolderId: string | null
  /** Actor who owns everything shown here — `listFoldersFlat` + `listDrive`
   *  already filter by ownerId=actorId, so every node in the tree is editable.
   *  Passed through to ShareDialog / MoveToFolderDialog which need it for
   *  roster lookups and cycle-safe candidate pruning. */
  actorId: string
}

interface Node {
  kind: 'folder' | 'file'
  id: string
  name: string
  folder?: FolderRecord
  file?: FileRecord
  childFolders: Node[]
  childFiles: Node[]
}

const LS_EXPANDED = 'jitdrive.tree.expanded'

/** Read the persisted expansion set from localStorage. Guarded so SSR never
 *  touches window. If nothing is stored yet, we compute a default from the
 *  current folder's ancestors (see component body). */
function readExpandedFromLS(): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LS_EXPANDED)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : null
  } catch {
    return null
  }
}

function writeExpandedToLS(ids: string[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_EXPANDED, JSON.stringify(ids))
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Sort by name using zh-aware collation so "侧" / "文档" line up naturally. */
const cmp = new Intl.Collator('zh-Hans', { numeric: true, sensitivity: 'base' })

function buildTree(folders: FolderRecord[], files: FileRecord[]): Node[] {
  // Bucket children by parentId for O(1) lookup while walking.
  const byParentFolder = new Map<string | null, FolderRecord[]>()
  const byParentFile = new Map<string | null, FileRecord[]>()
  for (const f of folders) {
    const arr = byParentFolder.get(f.parentId) || []
    arr.push(f)
    byParentFolder.set(f.parentId, arr)
  }
  for (const f of files) {
    const arr = byParentFile.get(f.parentId) || []
    arr.push(f)
    byParentFile.set(f.parentId, arr)
  }
  const make = (f: FolderRecord): Node => {
    const childFolders = (byParentFolder.get(f.id) || [])
      .slice()
      .sort((a, b) => cmp.compare(a.name, b.name))
      .map(make)
    const childFiles = (byParentFile.get(f.id) || [])
      .slice()
      .sort((a, b) => cmp.compare(a.name, b.name))
      .map(n => ({ kind: 'file' as const, id: n.id, name: n.name, file: n, childFolders: [], childFiles: [] }))
    return { kind: 'folder', id: f.id, name: f.name, folder: f, childFolders, childFiles }
  }
  const rootFolders = (byParentFolder.get(null) || []).slice().sort((a, b) => cmp.compare(a.name, b.name)).map(make)
  const rootFiles = (byParentFile.get(null) || [])
    .slice()
    .sort((a, b) => cmp.compare(a.name, b.name))
    .map(n => ({ kind: 'file' as const, id: n.id, name: n.name, file: n, childFolders: [], childFiles: [] }))
  // Folders first, then files — mirrors every mainstream drive.
  return [...rootFolders, ...rootFiles]
}

/** Walk up from `currentFolderId` collecting every ancestor id (inclusive) so
 *  the tree can auto-open the path leading to the user's current view. */
function ancestorsOf(folders: FolderRecord[], currentFolderId: string | null): string[] {
  if (!currentFolderId) return []
  const byId = new Map(folders.map(f => [f.id, f]))
  const chain: string[] = []
  let cursor: string | null = currentFolderId
  let hops = 0
  while (cursor && hops++ < 64) {
    chain.push(cursor)
    const next: string | null = byId.get(cursor)?.parentId ?? null
    cursor = next
  }
  return chain
}

/** Same rule as FileList.openHref — Jitword docs stay on /drive/files/[id]
 *  (EditorClient), every other kind goes to /drive/files/[id]/view. Inlined
 *  here so the tree doesn't have to import from FileList (avoids a client-module
 *  tangle with the hook state). Used for the "查看" alternative entry. */
function filePreviewHref(f: FileRecord): string {
  return f.kind === 'jitword' ? editorRoute(f.id, 'preview') : fileViewRoute(f.id)
}

function fileLabel(f: FileRecord): string {
  return `${(f.size / 1024).toFixed(0)} KB`
}

export default function FileTree({ folders, files, currentFolderId, actorId }: Props) {
  const tree = useMemo(() => buildTree(folders, files), [folders, files])
  const router = useRouter()
  const pathname = usePathname()

  // Shared drive handler bundle — same hook FolderGrid + FileList use, so a
  // rename / move / soft-delete from the tree refreshes the SSR payload the
  // exact same way a card-mode action does.
  const {
    busyId,
    shareTarget,
    moveTarget,
    renameFile,
    renameFolder,
    softDeleteFile,
    softDeleteFolder,
    openShareFile,
    openShareFolder,
    openMoveFile,
    openMoveFolder,
    closeShare,
    closeMove,
  } = useDriveActions({ currentFolderId })

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  // Hydrate expansion after mount — SSR has no window access.
  useEffect(() => {
    const stored = readExpandedFromLS()
    if (stored) {
      setExpanded(new Set(stored))
    } else {
      // First visit — pre-open the ancestor chain of currentFolderId so the
      // user's context is visible immediately instead of a collapsed root.
      const chain = ancestorsOf(folders, currentFolderId)
      setExpanded(new Set(chain))
    }
    // Only re-run when the folder roster identity changes (rare).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders])

  // Keep the current folder's ancestor path open when the URL changes
  // (e.g. user clicks a folder in grid view while tree is mounted).
  useEffect(() => {
    if (!currentFolderId) return
    setExpanded(prev => {
      const chain = ancestorsOf(folders, currentFolderId)
      const has = chain.every(id => prev.has(id))
      if (has) return prev
      const next = new Set(prev)
      for (const id of chain) next.add(id)
      return next
    })
  }, [currentFolderId, folders])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeExpandedToLS(Array.from(next))
      return next
    })
  }

  function fileHref(f: FileRecord) {
    return editorRoute(f.id) // /drive/files/[id] — route self-dispatches by kind
  }

  function folderHref(f: FolderRecord) {
    const base = pathname || DRIVE
    const qs = new URLSearchParams()
    qs.set('folderId', f.id)
    return `${base}?${qs.toString()}`
  }

  function enterFolder(f: FolderRecord) {
    router.push(folderHref(f))
  }

  const total = folders.length + files.length
  if (total === 0) {
    return (
      <div className="rounded-lg border border-dashed border-wps-border bg-white/60 px-4 py-8 text-center text-xs text-wps-subtext">
        还没有内容，先在上方拖拽文件上传或新建文件夹
      </div>
    )
  }

  return (
    <>
      <div className="overflow-visible rounded-lg border border-wps-border bg-white">
        <ul className="select-none py-1">
          {tree.map(node => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              currentFolderId={currentFolderId}
              busyId={busyId}
              onToggle={toggle}
              onEnterFolder={enterFolder}
              fileHref={fileHref}
              onPreviewFile={f => router.push(filePreviewHref(f))}
              onShareFile={openShareFile}
              onShareFolder={openShareFolder}
              onMoveFile={openMoveFile}
              onMoveFolder={openMoveFolder}
              onRenameFile={renameFile}
              onRenameFolder={renameFolder}
              onDeleteFile={f => softDeleteFile(f.id, f.name)}
              onDeleteFolder={softDeleteFolder}
            />
          ))}
        </ul>
      </div>

      {shareTarget && (
        <ShareDialog
          target={shareTarget.kind === 'file'
            ? { kind: 'file', file: shareTarget.file }
            : { kind: 'folder', folder: shareTarget.folder }}
          actorId={actorId}
          onClose={closeShare}
          onSaved={() => {
            closeShare()
            router.refresh()
          }}
        />
      )}
      {moveTarget && (
        <MoveToFolderDialog
          title={
            moveTarget.kind === 'file'
              ? `移动文档「${moveTarget.file.name}」`
              : `移动文件夹「${moveTarget.folder.name}」`
          }
          fromFolderId={moveTarget.kind === 'folder' ? moveTarget.folder.id : null}
          currentParentId={
            (moveTarget.kind === 'file' ? moveTarget.file.parentId : moveTarget.folder.parentId) ?? currentFolderId
          }
          actorId={actorId}
          onClose={closeMove}
          onMoved={() => {
            closeMove()
            router.refresh()
          }}
          endpoint={
            moveTarget.kind === 'file'
              ? `/api/files/${moveTarget.file.id}`
              : `/api/folders/${moveTarget.folder.id}`
          }
        />
      )}
    </>
  )
}

interface TreeNodeProps {
  node: Node
  depth: number
  expanded: Set<string>
  currentFolderId: string | null
  busyId: string | null
  onToggle: (id: string) => void
  onEnterFolder: (f: FolderRecord) => void
  fileHref: (f: FileRecord) => string
  onPreviewFile: (f: FileRecord) => void
  onShareFile: (f: FileRecord) => void
  onShareFolder: (f: FolderRecord) => void
  onMoveFile: (f: FileRecord) => void
  onMoveFolder: (f: FolderRecord) => void
  onRenameFile: (f: FileRecord) => void
  onRenameFolder: (f: FolderRecord) => void
  onDeleteFile: (f: FileRecord) => void
  onDeleteFolder: (f: FolderRecord) => void
}

function buildFolderActions(node: Node, props: TreeNodeProps): RowAction[] {
  const f = node.folder!
  const busy = props.busyId === f.id
  return [
    { label: '进入', icon: 'chevronRight', onClick: () => props.onEnterFolder(f) },
    { label: '分享链接', icon: 'share', disabled: busy, onClick: () => props.onShareFolder(f) },
    { label: '移动到', icon: 'moveTo', disabled: busy, onClick: () => props.onMoveFolder(f) },
    { label: '重命名', icon: 'edit', disabled: busy, onClick: () => props.onRenameFolder(f) },
    {
      label: '移入回收站',
      icon: 'trash',
      danger: true,
      divider: true,
      disabled: busy,
      onClick: () => props.onDeleteFolder(f)
    }
  ]
}

function buildFileActions(node: Node, props: TreeNodeProps): RowAction[] {
  const f = node.file!
  const busy = props.busyId === f.id
  const actions: RowAction[] = []
  // 主体点击 = "打开"（jitword 优先编辑，其他走 /view）。菜单里只放"另一种模式"
  // 和实体动作，避免和主体点击重复。
  if (f.kind === 'jitword') {
    actions.push({ label: '查看', icon: 'eye', onClick: () => props.onPreviewFile(f) })
  }
  if (f.originalPath) {
    actions.push({ label: '下载', icon: 'download', href: `/api/files/${f.id}/download`, download: true })
  }
  if (f.kind === 'jitword') {
    actions.push({ label: '共享给同事', icon: 'users', disabled: busy, onClick: () => props.onShareFile(f) })
  } else {
    actions.push({ label: '分享链接', icon: 'share', disabled: busy, onClick: () => props.onShareFile(f) })
  }
  actions.push({ label: '移动到', icon: 'moveTo', disabled: busy, onClick: () => props.onMoveFile(f) })
  actions.push({ label: '重命名', icon: 'edit', disabled: busy, onClick: () => props.onRenameFile(f) })
  actions.push({
    label: '移入回收站',
    icon: 'trash',
    danger: true,
    divider: true,
    disabled: busy,
    onClick: () => props.onDeleteFile(f)
  })
  return actions
}

function TreeNode(props: TreeNodeProps) {
  const {
    node,
    depth,
    expanded,
    currentFolderId,
    onToggle,
    onEnterFolder,
    fileHref,
  } = props
  const isFolder = node.kind === 'folder'
  const isOpen = isFolder && expanded.has(node.id)
  const isActive = isFolder && currentFolderId === node.id
  const empty = isFolder && node.childFolders.length === 0 && node.childFiles.length === 0
  // 20px per level, capped so very deep trees don't run off-screen.
  const indent = 8 + Math.min(depth, 8) * 18

  const actions: RowAction[] = isFolder ? buildFolderActions(node, props) : buildFileActions(node, props)

  return (
    <li>
      <div
        className={
          'group relative flex items-center gap-1 pr-1 py-1 text-sm transition ' +
          (isActive ? 'bg-red-50 text-wps-brandDark' : 'hover:bg-slate-50 text-wps-text')
        }
        style={{ paddingLeft: indent }}
      >
        {isFolder ? (
          <button
            type="button"
            aria-label={isOpen ? '折叠' : '展开'}
            onClick={e => {
              e.stopPropagation()
              onToggle(node.id)
            }}
            className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-slate-200/70 text-wps-subtext"
          >
            <Icon name={isOpen ? 'chevron' : 'chevronRight'} size={14} />
          </button>
        ) : (
          // Files get an empty slot so their label aligns with folder labels.
          <span className="inline-block h-5 w-5 shrink-0" />
        )}

        {isFolder ? (
          <button
            type="button"
            onClick={() => onEnterFolder(node.folder!)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-wps-brand/40 rounded"
            title={node.name}
          >
            <span
              className={
                'grid h-6 w-6 shrink-0 place-items-center rounded ' +
                (isActive ? 'bg-red-100 text-wps-brand' : 'bg-amber-50 text-amber-600')
              }
            >
              <Icon name="folder" size={14} />
            </span>
            <span className="truncate font-medium">{node.name}</span>
            {empty && <span className="ml-1 shrink-0 text-[10px] text-wps-subtext">（空）</span>}
          </button>
        ) : (
          <Link
            href={fileHref(node.file!)}
            className="flex items-center gap-1.5 flex-1 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-wps-brand/40 rounded"
            title={node.name}
          >
            <FileKindIcon kind={node.file!.kind} ext={node.file!.extension} size={14} rounded={false} />
            <span className="truncate">{node.name}</span>
          </Link>
        )}

        {/* Right slot: file meta (hover-only) + ⋯ dropdown (hover-only).
            Menu uses position:fixed so it never gets clipped by ancestors,
            and `visibleOnHoverOnly` keeps rows visually quiet until hovered. */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!isFolder && (
            <span className="hidden md:inline text-[10px] text-wps-subtext opacity-0 transition group-hover:opacity-100">
              {fileKindLabel(node.file!.kind, node.file!.extension)} · {fileLabel(node.file!)}
            </span>
          )}
          <RowActionsMenu
            actions={actions}
            ariaLabel={`${node.name} 的操作`}
            title="更多操作"
            triggerSize={24}
            visibleOnHoverOnly
          />
        </div>
      </div>
      {isFolder && isOpen && (node.childFolders.length > 0 || node.childFiles.length > 0) && (
        <ul>
          {node.childFolders.map(c => (
            <TreeNode key={c.id} {...props} node={c} depth={depth + 1} />
          ))}
          {node.childFiles.map(c => (
            <TreeNode key={c.id} {...props} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
