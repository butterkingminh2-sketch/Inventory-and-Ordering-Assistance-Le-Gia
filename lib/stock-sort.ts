import { num } from './types'
import type { Item } from './types'

function severityRank(item: Item): number {
  const qty = num(item.quantity)
  const threshold = num(item.low_threshold)
  if (qty <= 0) return 0
  if (qty <= threshold) return 1
  return 2
}

/** Pure function — no DB calls. Out-of-stock first, then low-stock, then everything else — stable within each tier. */
export function sortBySeverity(items: Item[]): Item[] {
  return [...items].sort((a, b) => severityRank(a) - severityRank(b))
}
