import { getActorId } from '@/lib/users'
import SmartPanel from '@/components/smart/SmartPanel'
import {
  getSmartSummary,
  findDuplicateGroups,
  getSuggestions,
  getRecommendations
} from '@/lib/smart/store'

export const dynamic = 'force-dynamic'

/** v0.7 · P0 · AI 智能面板首页。
 *  Server component 一次拉齐四段数据 → 传给 client SmartPanel，避免首屏 4 段
 *  串行 waterfalls。扫描按钮触发 POST /api/smart/scan 后，客户端会并行刷新
 *  各 section（见 components/smart/SmartPanel.tsx）。 */
export default async function SmartPage() {
  const actor = getActorId()
  const [summary, duplicates, suggestions, recommendations] = await Promise.all([
    getSmartSummary(actor),
    findDuplicateGroups(actor, 30),
    getSuggestions(actor, 20),
    getRecommendations(actor, 5)
  ])

  return (
    <SmartPanel
      actorId={actor}
      initialSummary={summary}
      initialDuplicates={duplicates}
      initialSuggestions={suggestions}
      initialRecommendations={recommendations}
    />
  )
}
