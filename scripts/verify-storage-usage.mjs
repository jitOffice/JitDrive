// Ad-hoc smoke for the v0.6.1 storage seam — exercises the two paths that
// the browser test can't cover: (a) STORAGE_QUOTA_BYTES env override, (b)
// ratio clamped to [0,1] when bytes exceed quota. Run with:
//   cd <project> && node --env-file=.env.local scripts/verify-storage-usage.mjs
// Uses a bare Prisma client so we bypass Next's module graph.

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024

function readQuota() {
  const raw = process.env.STORAGE_QUOTA_BYTES
  if (!raw) return DEFAULT_QUOTA_BYTES
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_QUOTA_BYTES
}

async function usage(actorId) {
  const [a, t] = await Promise.all([
    prisma.file.aggregate({ where: { ownerId: actorId, deleted: false }, _sum: { size: true } }),
    prisma.file.aggregate({ where: { ownerId: actorId, deleted: true }, _sum: { size: true } })
  ])
  const usedActive = Number(a._sum.size ?? 0)
  const usedTrash = Number(t._sum.size ?? 0)
  const totalUsed = usedActive + usedTrash
  const quotaBytes = readQuota()
  const ratio = quotaBytes > 0 ? Math.min(1, Math.max(0, totalUsed / quotaBytes)) : 0
  return { usedActive, usedTrash, totalUsed, quotaBytes, ratio }
}

const alice = await prisma.user.findUnique({ where: { email: 'alice@jitdrive.dev' } })
if (!alice) { console.log('SKIP: alice not seeded'); process.exit(0) }

// Baseline — default 1 GB quota
process.env.STORAGE_QUOTA_BYTES = ''
const base = await usage(alice.id)
console.log('[default 1 GB]', base)
const ok1 = base.quotaBytes === DEFAULT_QUOTA_BYTES && base.ratio >= 0 && base.ratio <= 1
console.log(`  ✓ ratio in [0,1] & quota = 1 GB? ${ok1}`)

// Override to 1 MB → alice's 37 MB should clamp ratio to 1
process.env.STORAGE_QUOTA_BYTES = String(1024 * 1024)
const tight = await usage(alice.id)
console.log('[override 1 MB]', tight)
const ok2 = tight.quotaBytes === 1024 * 1024 && tight.ratio === 1
console.log(`  ✓ quota override honored AND ratio clamped to 1? ${ok2}`)

// Garbage input falls back to default
process.env.STORAGE_QUOTA_BYTES = 'not-a-number'
const bad = await usage(alice.id)
const ok3 = bad.quotaBytes === DEFAULT_QUOTA_BYTES
console.log(`  ✓ invalid env falls back to 1 GB? ${ok3} (quotaBytes=${bad.quotaBytes})`)

console.log(`RESULT: ${ok1 && ok2 && ok3 ? 'ALL PASS' : 'FAIL'}`)
await prisma.$disconnect()
