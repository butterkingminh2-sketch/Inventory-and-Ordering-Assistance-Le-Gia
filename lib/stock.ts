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
  reason: 'order' | 'manual_correction' | 'cancellation' | 'count',
  userId: string,
  orderId?: string
): Promise<StockChangeResult> {
  const { createClient } = await import('./supabase/client')
  const supabase = createClient()
  const { data, error } = await supabase.rpc('apply_stock_change', {
    p_changes:  changes,
    p_reason:   reason,
    p_user_id:  userId,
    p_order_id: orderId ?? null,
  })
  if (error) throw error
  return data as StockChangeResult
}

export interface StockLogEntry {
  item_id: string
  delta: number | string
}

/**
 * Pure function — no DB calls. Negates and sums logged deltas per item.
 * Reverses the REALIZED change recorded in stock_logs (what actually happened,
 * including any floor-at-zero clamping), never a theoretical recipe recomputation —
 * otherwise an order that floored an ingredient gets over-credited on cancellation.
 */
export function buildReversal(logs: StockLogEntry[]): StockChange[] {
  const totals: Record<string, number> = {}
  for (const log of logs) {
    totals[log.item_id] = (totals[log.item_id] ?? 0) + num(log.delta)
  }
  return Object.entries(totals).map(([item_id, amount]) => ({
    item_id,
    delta: -amount,
  }))
}

/** Reverses the realized stock_logs rows for an order's 'order' deduction. */
export async function reverseOrderStock(orderId: string, userId: string): Promise<StockChangeResult> {
  const { createClient } = await import('./supabase/client')
  const supabase = createClient()
  const { data: logs, error } = await supabase
    .from('stock_logs')
    .select('item_id, delta')
    .eq('order_id', orderId)
    .eq('reason', 'order')
  if (error) throw error
  if (!logs || logs.length === 0) return { floored: [] }

  const reversal = buildReversal(logs)
  return applyStockChange(reversal, 'cancellation', userId, orderId)
}
