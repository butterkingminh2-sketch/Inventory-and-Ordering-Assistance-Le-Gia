import type { RecipeLine, StockChangeResult } from './types'
import { num } from './types'

export interface StockChange {
  item_id: string
  delta: number
}

/** Pure function — no DB calls. Returns per-item deltas for an order or cancellation. */
export function calculateDecrements(
  orderItems: Array<{ dish_id: string; qty: number }>,
  recipeLines: RecipeLine[],
  reversal = false
): StockChange[] {
  const totals: Record<string, number> = {}

  for (const { dish_id, qty } of orderItems) {
    for (const line of recipeLines.filter(r => r.dish_id === dish_id)) {
      const qtyPerServing = num(line.qty_per_serving)
      if (!Number.isFinite(qtyPerServing) || qtyPerServing <= 0) {
        throw new Error(`Invalid qty_per_serving for recipe line ${line.id}: ${line.qty_per_serving}`)
      }
      totals[line.item_id] = (totals[line.item_id] ?? 0) + qtyPerServing * qty
    }
  }

  const sign = reversal ? 1 : -1
  return Object.entries(totals).map(([item_id, amount]) => ({
    item_id,
    delta: sign * amount,
  }))
}

/** Calls the apply_stock_change RPC. Returns item_ids that were floored at 0. */
export async function applyStockChange(
  changes: StockChange[],
  reason: 'order' | 'manual_correction' | 'cancellation',
  userId: string
): Promise<StockChangeResult> {
  const { createClient } = await import('./supabase/client')
  const supabase = createClient()
  const { data, error } = await supabase.rpc('apply_stock_change', {
    p_changes:  changes,
    p_reason:   reason,
    p_user_id:  userId,
  })
  if (error) throw error
  return data as StockChangeResult
}
