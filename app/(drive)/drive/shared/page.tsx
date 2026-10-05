import { listSharedWithMe } from '@/lib/store'
import { getActorId } from '@/lib/users'
import FileList from '@/components/FileList'
import Icon from '@/components/Icon'

export const dynamic = 'force-dynamic'

export default async function SharedPage() {
  const actor = getActorId()
  const files = await listSharedWithMe(actor)

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-wps-text">共享给我</h1>
        <p className="mt-1 text-xs text-wps-subtext">
          同事共享给你的文档 · 共 {files.length} 个 · 以只读方式打开
        </p>
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-600">
        <Icon name="users" size={14} />
        <span>这里是用你的账号收到的共享文档，均以只读方式打开。想以其他人身份管理其文档，请用对应账号登录。</span>
      </div>
      <FileList files={files} variant="shared" actorId={actor} />
    </div>
  )
}
