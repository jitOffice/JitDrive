// S14 · 回收站到期自动清理 —— 进程内节流调度器。
//
// 演示环境没有真正的 cron / 常驻 worker，所以复用了 bootstrap 的「进程内幂等
// 守卫」思路：谁先在被访问时触发，谁就跑；跑完记一个模块级时间戳，6 小时内不再
// 重复。生产上把这条换成外部定时器（或调用 /api/internal/reap），核心清理逻辑
// reapExpiredTrash() 完全一致，无需重写。
//
// 关键坑（见项目经验）：Next.js dev 热重载会重置模块级变量，所以 `lastRun` 不
// 可靠——但没关系，reapExpiredTrash 本身幂等（未过期项不会被误删，过期项删一次
// 就没了），最坏情况只是热重载后多跑一次全表扫描，代价可接受。真正的一次性迁移
// （archiveLooseFiles）才需要落盘 marker，这里不需要。
import { reapExpiredTrash } from './store'

const INTERVAL_MS = 6 * 60 * 60 * 1000 // ≥6h between reaps
const RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS || 30)

let lastRun = 0
let running: Promise<unknown> | null = null

/**
 * Fire-and-forget: safe to call from a server layout on every request. Returns
 * immediately; the actual purge runs in the background. Never throws into the
 * caller. Coalesces concurrent triggers via the `running` promise so a burst of
 * page loads spawns at most one sweep.
 */
export function maybeReapExpiredTrash(): void {
  const now = Date.now()
  if (running || now - lastRun < INTERVAL_MS) return
  running = reapExpiredTrash({ now, retentionDays: RETENTION_DAYS })
    .catch(e => console.error('[reap] skipped:', (e as Error).message))
    .finally(() => {
      lastRun = Date.now()
      running = null
    })
  // Deliberately not awaited — the caller shouldn't block first paint on it.
  void running
}
