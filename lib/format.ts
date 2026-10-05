/**
 * Human-facing byte formatter for the sidebar quota meter (and anywhere else
 * we need to present File.size — which is stored as raw bytes, Int).
 *
 * Thresholds are intentionally binary (1 KB = 1024 B) because that's how the
 * underlying SQLite column behaves and how users read "1 GB 配额" in product
 * copy. If we ever switch to decimal (SI) units for a paid tier, only this
 * file changes.
 */

const KB = 1024
const MB = KB * 1024
const GB = MB * 1024

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < KB) return `${Math.round(bytes)} B`
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`
  return `${(bytes / GB).toFixed(2)} GB`
}

/**
 * Percent label for the quota bar. Sub-1% shows one decimal so a nearly-empty
 * account doesn't render as "0%" (which reads as broken); anything at or above
 * 1% rounds to whole percent to keep the number tight.
 */
export function formatRatio(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) return '0%'
  const pct = Math.min(1, ratio) * 100
  if (pct < 1) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}
