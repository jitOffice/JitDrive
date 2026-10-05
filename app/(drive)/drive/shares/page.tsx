import { redirect } from 'next/navigation'
import { getActorId } from '@/lib/users'
import { listMyShareLinks, type MyShareLink } from '@/lib/share'
import MySharesClient from '@/components/MySharesClient'

export const dynamic = 'force-dynamic'

/** v0.5.3 · S3 「我的分享」运营台 —— 跨文件 / 跨目录一屏看所有活跃分享链接 +
 *  累计浏览（读 S2 明细）+ 单条 / 一键撤销。做成 Sidebar 一级模块而非塞进
 *  分享弹窗，因为这里要承载列表 / 批量操作，空间超出 modal（roadmap S3 决策门）。 */
export default async function SharesPage() {
  const actor = getActorId()
  if (!actor) redirect('/login')
  const items: MyShareLink[] = await listMyShareLinks(actor)

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <MySharesClient initial={items} />
    </div>
  )
}
