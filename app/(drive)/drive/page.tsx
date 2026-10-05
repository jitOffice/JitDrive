import { listChildren, getBreadcrumb, listDrive, listFoldersFlat } from '@/lib/store'
import { getActorId } from '@/lib/users'
import { getCurrentUser } from '@/lib/auth'
import { getRecommendations } from '@/lib/smart/store'
import Breadcrumb from '@/components/Breadcrumb'
import UploadZone from '@/components/UploadZone'
import DriveBrowser from '@/components/DriveBrowser'
import RecommendationStrip from '@/components/RecommendationStrip'

// Force dynamic rendering — data lives in a live database.
export const dynamic = 'force-dynamic'

type Search = { folderId?: string }

export default async function HomePage({ searchParams }: { searchParams: Search }) {
  const actor = getActorId()
  const me = await getCurrentUser()
  const rawFolder = searchParams?.folderId
  const folderId = !rawFolder || rawFolder === 'root' ? null : rawFolder
  // current-folder listing (grid mode) + full flat roster (tree mode). The
  // tree query is cheap (two indexed scans) and saves a client round-trip
  // when the user toggles view mode.
  const [{ folders, files }, crumbs, allFolders, allFiles, recommendations] = await Promise.all([
    listChildren(actor, folderId),
    getBreadcrumb(actor, folderId),
    listFoldersFlat(actor),
    listDrive(actor),
    // v0.7 · P0 · 推荐只在根目录展示（进目录说明用户已经知道自己要找什么，
    // 横幅再插一脚反而干扰）。评分函数走 lib/smart/recommend.ts。
    folderId === null ? getRecommendations(actor, 5) : Promise.resolve([])
  ])
  const total = folders.length + files.length

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-wps-text">
            {folderId ? folders.find(f => f.id === folderId)?.name || '我的云盘' : '我的云盘'}
          </h1>
          <p className="mt-1 text-xs text-wps-subtext">
            {me?.name} · {total === 0 ? '这里还是空的' : `${folders.length} 个文件夹 · ${files.length} 个文件`} · 支持 Word / Excel / PPT / PDF / 图片 / 音视频 / 压缩包
          </p>
        </div>
        <div className="text-xs text-wps-subtext">
          租户 <code className="rounded bg-slate-100 px-1">{process.env.JITWORD_TENANT_KEY || 'demo'}</code> · 应用{' '}
          <code className="rounded bg-slate-100 px-1">{process.env.JITWORD_PROVIDER_KEY || 'jitword-sdk-demo'}</code>
        </div>
      </div>

      {recommendations.length > 0 && <RecommendationStrip items={recommendations} />}

      {/* Two-column drive (v0.5.1): file list is the primary left column, the
          upload card sits in a sticky right rail on wide screens and drops
          below the list on narrow ones. min-w-0 keeps the grid column from
          overflowing on long file names. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <Breadcrumb crumbs={crumbs} />
          <div className="mt-4">
            <DriveBrowser
              folders={folders}
              files={files}
              allFolders={allFolders}
              allFiles={allFiles}
              currentFolderId={folderId}
              actorId={actor}
            />
          </div>
        </div>

        <aside className="lg:sticky lg:top-6">
          <UploadZone folderId={folderId} />
        </aside>
      </div>
    </div>
  )
}
