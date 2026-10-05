'use client'

import { useState } from 'react'
import Modal from './ui/Modal'
import LinkPane, { type ShareTarget } from './share/LinkPane'
import UsersPane from './share/UsersPane'

interface Props {
  target: ShareTarget
  actorId: string
  onClose: () => void
  /** Called after the roster (邀请协作) is saved so parents can invalidate
   *  cached FileRecord. Link creation is self-contained and doesn't fire this. */
  onSaved?: () => void
}

type Tab = 'link' | 'users'

/** Unified share dialog. Two tabs — 链接分享 (public/encrypted ShareLink) and
 *  邀请协作 (existing login-scoped FileShare roster). Mounted from FileList
 *  overflow menu, FileHeader (edit), ViewHeader (preview), and — as of
 *  v0.5.2 — FolderGrid context menu (folder links reuse the same ShareLink
 *  table with `folderId` XOR `fileId`). Folder targets currently hide the
 *  邀请协作 tab because FileShare only stores file grantees; folder-level
 *  collaborator lists land in v0.6. */
export default function ShareDialog({ target, actorId, onClose, onSaved }: Props) {
  const isFolder = target.kind === 'folder'
  const displayName = isFolder ? target.folder.name : target.file.name
  const [tab, setTab] = useState<Tab>('link')

  return (
    <Modal open onClose={onClose} title={isFolder ? '分享目录' : '分享文档'} icon="share" maxWidth="max-w-xl">
      <div className="-mt-1 truncate text-xs text-wps-subtext" title={displayName}>
        {displayName}
      </div>
      {!isFolder && (
        <div className="mt-3 inline-flex rounded-md border border-wps-border bg-slate-50 p-0.5 text-xs">
          <TabButton active={tab === 'link'} onClick={() => setTab('link')}>
            链接分享
          </TabButton>
          <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
            邀请协作
          </TabButton>
        </div>
      )}
      {isFolder && (
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-wps-subtext">
          目录暂只支持链接分享；「邀请协作（登录用户名单）」会在 v0.6 上线。子目录与其中的文件会跟随父目录分享一起可见。
        </div>
      )}
      <div className="mt-4">
        {tab === 'link' || isFolder ? (
          <LinkPane target={target} actorId={actorId} />
        ) : (
          <UsersPane file={(target as { kind: 'file'; file: import('@/lib/types').FileRecord }).file} actorId={actorId} onSaved={onSaved ?? (() => void 0)} />
        )}
      </div>
    </Modal>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded px-3 py-1 font-medium transition ' +
        (active ? 'bg-white text-wps-brand shadow-sm' : 'text-wps-subtext hover:text-wps-text')
      }
    >
      {children}
    </button>
  )
}
