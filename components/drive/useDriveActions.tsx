'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FileRecord, FolderRecord } from '@/lib/types'
import { useUI } from '../ui/UIProvider'

/** 云盘卡片 / 树节点上的实体动作（分享 / 移动 / 重命名 / 软删 / 还原 / 彻底删）
 *  共享目标——把 FolderGrid / FileList / FileTree 里重复的 handler 与 dialog state 抽出来。
 *  返回的 `shareTarget` / `moveTarget` 供 caller 渲染 `<ShareDialog>` / `<MoveToFolderDialog>`。 */
export type DriveTarget =
  | { kind: 'file'; file: FileRecord }
  | { kind: 'folder'; folder: FolderRecord }

interface Options {
  /** 文件移动 dialog 需要"当前目录 id"作为 from 上下文（可能为 null = 根） */
  currentFolderId?: string | null
}

export function useDriveActions(opts: Options = {}) {
  const router = useRouter()
  const { confirm, prompt, toast } = useUI()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [shareTarget, setShareTarget] = useState<DriveTarget | null>(null)
  const [moveTarget, setMoveTarget] = useState<DriveTarget | null>(null)
  const currentFolderId = opts.currentFolderId ?? null

  async function run(
    id: string,
    fn: () => Promise<{ code?: number; message?: string }>,
    okMsg?: string
  ) {
    setBusyId(id)
    try {
      const j = await fn()
      if (j && j.code && j.code !== 200) toast(j.message || '操作失败', 'error')
      else {
        if (okMsg) toast(okMsg, 'success')
        router.refresh()
      }
    } catch (e) {
      toast((e as Error).message || '网络错误', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const json = (r: Response) => r.json().catch(() => ({ code: 0 }))

  async function renameFile(f: FileRecord) {
    const next = await prompt({
      title: '重命名文档',
      label: '文档名称',
      defaultValue: f.name,
      confirmText: '保存'
    })
    if (!next || next === f.name) return
    await run(
      f.id,
      () =>
        fetch(`/api/files/${f.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: next })
        }).then(json),
      '已重命名'
    )
  }

  async function renameFolder(f: FolderRecord) {
    const next = await prompt({
      title: '重命名文件夹',
      label: '名称',
      defaultValue: f.name,
      confirmText: '保存'
    })
    if (!next || next === f.name) return
    await run(
      f.id,
      () =>
        fetch(`/api/folders/${f.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: next })
        }).then(json),
      '已重命名'
    )
  }

  async function softDeleteFile(id: string, name?: string) {
    const ok = await confirm({
      title: '移入回收站',
      message: name
        ? (
          <div>
            将 <b>{name}</b> 移入回收站，可随时还原。
          </div>
        )
        : '删除后可在「回收站」还原。确定将该文档移入回收站吗？',
      confirmText: '移入回收站'
    })
    if (!ok) return
    await run(id, () => fetch(`/api/files/${id}`, { method: 'DELETE' }).then(json), '已移入回收站')
  }

  async function softDeleteFolder(f: FolderRecord) {
    const ok = await confirm({
      title: '移入回收站',
      tone: 'danger',
      icon: 'trash',
      message: (
        <div>
          将 <b>{f.name}</b> 及其中所有内容移入回收站，可在回收站一键还原。
        </div>
      ),
      confirmText: '移入回收站'
    })
    if (!ok) return
    await run(f.id, () => fetch(`/api/folders/${f.id}`, { method: 'DELETE' }).then(json), '已移入回收站')
  }

  async function restoreFile(id: string) {
    await run(id, () => fetch(`/api/files/${id}/restore`, { method: 'POST' }).then(json), '已还原')
  }

  async function purgeFile(id: string) {
    const ok = await confirm({
      title: '彻底删除',
      tone: 'danger',
      icon: 'trash',
      message:
        '将永久移除该文档记录，原始文件移入系统废纸篓（可从系统废纸篓找回），不可撤销。确定吗？',
      confirmText: '彻底删除'
    })
    if (!ok) return
    await run(id, () => fetch(`/api/files/${id}/purge`, { method: 'DELETE' }).then(json), '已彻底删除')
  }

  function openShareFile(file: FileRecord) { setShareTarget({ kind: 'file', file }) }
  function openShareFolder(folder: FolderRecord) { setShareTarget({ kind: 'folder', folder }) }
  function openMoveFile(file: FileRecord) { setMoveTarget({ kind: 'file', file }) }
  function openMoveFolder(folder: FolderRecord) { setMoveTarget({ kind: 'folder', folder }) }
  function closeShare() { setShareTarget(null) }
  function closeMove() { setMoveTarget(null) }

  return {
    busyId,
    shareTarget,
    moveTarget,
    currentFolderId,
    router,
    renameFile,
    renameFolder,
    softDeleteFile,
    softDeleteFolder,
    restoreFile,
    purgeFile,
    openShareFile,
    openShareFolder,
    openMoveFile,
    openMoveFolder,
    closeShare,
    closeMove,
  }
}
