import { listRecent } from '@/lib/store'
import { getActorId } from '@/lib/users'
import FileList from '@/components/FileList'

export const dynamic = 'force-dynamic'

export default async function RecentPage() {
  const actor = getActorId()
  const files = await listRecent(actor)

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-wps-text">最近打开</h1>
        <p className="mt-1 text-xs text-wps-subtext">
          按上次访问时间排序 · 共 {files.length} 个 · 打开任意文档都会记录到此处
        </p>
      </div>
      <FileList files={files} variant="recent" actorId={actor} />
    </div>
  )
}
