'use client'

import { useEffect, useState } from 'react'
import type { FileRecord, FolderRecord } from '@/lib/types'
import Icon from './Icon'
import FolderGrid from './FolderGrid'
import FileList from './FileList'
import FileTree from './FileTree'

type Mode = 'grid' | 'tree'
const LS_MODE = 'jitdrive.viewMode'

interface Props {
  folders: FolderRecord[]
  files: FileRecord[]
  /** All non-deleted folders owned by the actor — needed to build the tree
   *  across every level, not just the current folder. Passed from the server
   *  to avoid a second round-trip on mode toggle. */
  allFolders: FolderRecord[]
  /** All non-deleted files owned by the actor (flat). */
  allFiles: FileRecord[]
  currentFolderId: string | null
  actorId: string
}

/** Client-side view mode switch for the drive page. Two rendering strategies
 *  share the same `?folderId=` URL semantics so browser back/forward, deep
 *  links, and breadcrumbs work identically:
 *    • grid — the original FolderGrid cards + FileList rows for the current
 *      folder only. Best for shallow drives / touch targets.
 *    • tree — a nested collapsible <FileTree> of the entire drive, with the
 *      current folder's ancestors auto-expanded and the folder itself
 *      highlighted. Best for deep hierarchies and keyboard navigation.
 *
 *  Choice persists in localStorage under `jitdrive.viewMode`. First paint
 *  always uses 'grid' to avoid a hydration flash, then the stored value is
 *  applied one tick after mount. */
export default function DriveBrowser({ folders, files, allFolders, allFiles, currentFolderId, actorId }: Props) {
  const [mode, setMode] = useState<Mode>('grid')

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_MODE)
      if (stored === 'grid' || stored === 'tree') setMode(stored)
    } catch {
      /* private mode / blocked — keep default */
    }
  }, [])

  function swap(next: Mode) {
    setMode(next)
    try {
      window.localStorage.setItem(LS_MODE, next)
    } catch {
      /* noop */
    }
  }

  return (
    <div>
      {/* Left-aligned per user feedback (v0.5.2): the toggle sits flush with
          the breadcrumb / heading column on the left so the primary reading
          path (title → view switcher → content) doesn't zig-zag. */}
      <div className="mb-3 flex items-center justify-start">
        <div className="inline-flex overflow-hidden rounded-md border border-wps-border bg-white text-xs shadow-sm">
          <ModeButton active={mode === 'grid'} onClick={() => swap('grid')} icon="grid" label="卡片" />
          <ModeButton active={mode === 'tree'} onClick={() => swap('tree')} icon="tree" label="目录树" />
        </div>
      </div>

      {mode === 'grid' ? (
        <div>
          <FolderGrid folders={folders} currentFolderId={currentFolderId} actorId={actorId} />
          <div className="mt-6">
            <FileList files={files} variant="drive" actorId={actorId} currentFolderId={currentFolderId} />
          </div>
        </div>
      ) : (
        <FileTree
          folders={allFolders}
          files={allFiles}
          currentFolderId={currentFolderId}
          actorId={actorId}
        />
      )}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean
  onClick: () => void
  icon: 'grid' | 'tree'
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex items-center gap-1.5 px-3 py-1.5 transition ' +
        (active
          ? 'bg-wps-brand text-white'
          : 'text-wps-text hover:bg-slate-50')
      }
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  )
}
