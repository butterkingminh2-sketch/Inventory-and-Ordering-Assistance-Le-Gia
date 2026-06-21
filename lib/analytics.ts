import { getPublicChannelCutoff } from './chat'
import { num } from './types'
import type { Dish, Item } from './types'

export type DateRangePreset = 'today' | '7d' | '30d'

/**
 * Pure function — no DB calls. Start boundary for the preset, anchored to the
 * same 6 AM operational-day cutoff lib/chat.ts already uses for the public
 * chat reset — "today" must mean the same thing in both places.
 */
export function getDateRangeStart(now: Date, preset: DateRangePreset): Date {
  const todayCutoff = getPublicChannelCutoff(now)
  if (preset === 'today') return todayCutoff
  const daysBack = preset === '7d' ? 7 : 30
  const start = new Date(todayCutoff)
  start.setDate(start.getDate() - daysBack)
  return start
}

export interface DishRanking {
  dish: Dish
  qty: number
}

/** Pure function — no DB calls. Aggregates order lines by dish, sorts by qty descending, truncates to limit. */
export function rankByQuantity(
  orderLines: Array<{ dish_id: string; qty: number }>,
  dishes: Dish[],
  limit: number,
): DishRanking[] {
  const totals: Record<string, number> = {}
  for (const { dish_id, qty } of orderLines) {
    totals[dish_id] = (totals[dish_id] ?? 0) + qty
  }
  const dishMap = new Map(dishes.map(d => [d.id, d]))
  const ranked: DishRanking[] = []
  for (const [dish_id, qty] of Object.entries(totals)) {
    const dish = dishMap.get(dish_id)
    if (dish) ranked.push({ dish, qty })
  }
  return ranked.sort((a, b) => b.qty - a.qty).slice(0, limit)
}

export interface DishRevenue {
  dish: Dish
  revenue: number
}

/** Pure function — no DB calls. Sums qty × price_at_order per dish, sorts by revenue descending, truncates to limit. */
export function rankByRevenue(
  orderLines: Array<{ dish_id: string; qty: number; price_at_order: number | string }>,
  dishes: Dish[],
  limit: number,
): DishRevenue[] {
  const totals: Record<string, number> = {}
  for (const { dish_id, qty, price_at_order } of orderLines) {
    totals[dish_id] = (totals[dish_id] ?? 0) + qty * num(price_at_order)
  }
  const dishMap = new Map(dishes.map(d => [d.id, d]))
  const ranked: DishRevenue[] = []
  for (const [dish_id, revenue] of Object.entries(totals)) {
    const dish = dishMap.get(dish_id)
    if (dish) ranked.push({ dish, revenue })
  }
  return ranked.sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

/**
 * Pure function — no DB calls. Days of stock remaining at the current
 * consumption rate. Returns null when nothing was consumed in the range —
 * there's no rate to project from, not a divide-by-zero to paper over.
 */
export function getDaysRemaining(consumedInRange: number, daysInRange: number, currentStock: number): number | null {
  if (consumedInRange <= 0) return null
  const dailyRate = consumedInRange / daysInRange
  return currentStock / dailyRate
}

export interface RestockAlert {
  item: Item
  daysRemaining: number
}

/** Pure function — no DB calls. Items whose days-remaining is under the threshold, most urgent first. */
export function getRestockAlerts(
  items: Item[],
  consumptionByItemId: Record<string, number>,
  daysInRange: number,
  urgencyThresholdDays: number,
): RestockAlert[] {
  const alerts: RestockAlert[] = []
  for (const item of items) {
    const consumed = consumptionByItemId[item.id] ?? 0
    const daysRemaining = getDaysRemaining(consumed, daysInRange, num(item.quantity))
    if (daysRemaining !== null && daysRemaining < urgencyThresholdDays) {
      alerts.push({ item, daysRemaining })
    }
  }
  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining)
}
