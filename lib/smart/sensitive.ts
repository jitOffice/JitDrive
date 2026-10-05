// v0.7 · P0 · Heuristic sensitivity scanner — server-only fs wrapper.
//
// 纯规则 + 判定 + banner 文案都拆到 sensitive-core.ts (client-safe)；本文件
// 只负责用 `fs/promises` 打开物理文件、按 body scan 上限读取 head slice、
// 再调用 core.scanContent 得到 bucket。
//
// 引用规则：
//   • 服务端（scanBatch / API routes / server components）→ 从 `@/lib/smart/sensitive`
//     import scanFile；纯函数也从这里 re-export，一栈调用即可。
//   • 客户端组件（LinkPane / FileList 等）→ 必须从 `@/lib/smart/sensitive-core`
//     直接 import bannerTextFor / ScanResult，绝不通过本文件（否则 fs/promises
//     会被 webpack 拉进浏览器 bundle 触发 UnhandledSchemeError）。
import fs from 'node:fs/promises'
import path from 'node:path'
import { BODY_SCAN_LIMIT, TEXT_FAMILY, scanContent, type ScanResult } from './sensitive-core'

export * from './sensitive-core'

/** Read a text-family file (bounded by BODY_SCAN_LIMIT) and scan.
 *  Returns null on any IO failure so the scan loop keeps moving. */
export async function scanFile(
  absPath: string,
  extension: string,
  filename: string
): Promise<ScanResult | null> {
  if (!absPath) return null
  try {
    const stat = await fs.stat(absPath)
    if (!stat.isFile()) return null
    const isText = TEXT_FAMILY.has((extension || '').toLowerCase())
    let body = ''
    if (isText) {
      const fh = await fs.open(absPath, 'r')
      try {
        const readSize = Math.min(stat.size, BODY_SCAN_LIMIT)
        const buf = Buffer.alloc(readSize)
        await fh.read(buf, 0, readSize, 0)
        body = buf.toString('utf-8')
      } finally {
        await fh.close()
      }
    }
    return scanContent(body, filename)
  } catch (e) {
    console.warn('[smart/sensitive] scan failed:', path.basename(absPath), (e as Error).message)
    return null
  }
}
