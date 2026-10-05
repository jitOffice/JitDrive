import { listTrash } from '@/lib/store'
import { getActorId } from '@/lib/users'
import FileList from '@/components/FileList'
import FolderTrashList from '@/components/FolderTrashList'
import EmptyTrashButton from '@/components/EmptyTrashButton'
import Icon from '@/components/Icon'

export const dynamic = 'force-dynamic'

export default async function TrashPage() {
  const actor = getActorId()
  const { files, folders } = await listTrash(actor)
  const ownedCount = files.filter(f => f.ownerSubject === actor).length
  const total = files.length + folders.length

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-wps-text">回收站</h1>
          <p className="mt-1 text-xs text-wps-subtext">
            共 {total} 项已删除内容（{folders.length} 个文件夹 · {files.length} 个文档）· 保留 30 天后自动清理 · 「彻底删除」会把原始文件移入系统废纸篓
          </p>
        </div>
        <EmptyTrashButton count={ownedCount} />
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <Icon name="alert" size={14} />
        <span>
          删除文件夹会一并放入回收站；还原/彻底删除文件夹都会级联影响其中的所有内容。彻底删除不会直接从磁盘抹除原始文件，会先移到系统废纸篓。
        </span>
      </div>
      {folders.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-xs font-medium text-wps-subtext">文件夹</div>
          <FolderTrashList folders={folders} actorId={actor} />
        </div>
      )}
      {files.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-wps-subtext">文档</div>
          <FileList files={files} variant="trash" actorId={actor} />
        </div>
      )}
      {total === 0 && <FileList files={[]} variant="trash" actorId={actor} />}
    </div>
  )
}
