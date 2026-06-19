import { num } from './types'
import type { Item, RecipeLine } from './types'

export type DishStatus = 'available' | 'low' | 'unavailable'

export function getDishStatus(
  dishId: string,
  recipeLines: RecipeLine[],
  items: Item[],
): DishStatus {
  const lines = recipeLines.filter(r => r.dish_id === dishId)
  if (lines.length === 0) return 'available'

  const itemMap = new Map(items.map(i => [i.id, i]))
  let status: DishStatus = 'available'

  for (const line of lines) {
    const item = itemMap.get(line.item_id)
    if (!item) continue
    const qty = num(item.quantity)
    const threshold = num(item.low_threshold)
    if (qty <= 0) return 'unavailable'
    if (qty <= threshold) status = 'low'
  }

  return status
}

/**
 * Pure function — no DB calls. Max total quantity of `dishId` orderable given
 * current stock and what other dishes already in the cart reserve from any
 * shared ingredients. Returns Infinity for a dish with no recipe lines.
 */
export function getMaxOrderableQty(
  dishId: string,
  recipeLines: RecipeLine[],
  items: Item[],
  cartQuantities: Record<string, number>,
): number {
  const lines = recipeLines.filter(r => r.dish_id === dishId)
  if (lines.length === 0) return Infinity

  const itemMap = new Map(items.map(i => [i.id, i]))
  let max = Infinity

  for (const line of lines) {
    const item = itemMap.get(line.item_id)
    if (!item) continue

    const perServing = num(line.qty_per_serving)
    let reserved = 0
    for (const [otherDishId, qty] of Object.entries(cartQuantities)) {
      if (otherDishId === dishId || qty <= 0) continue
      const otherLine = recipeLines.find(r => r.dish_id === otherDishId && r.item_id === line.item_id)
      if (otherLine) reserved += num(otherLine.qty_per_serving) * qty
    }

    const remaining = num(item.quantity) - reserved
    const addable = Math.floor(remaining / perServing)
    max = Math.min(max, Math.max(addable, 0))
  }

  return max
}
