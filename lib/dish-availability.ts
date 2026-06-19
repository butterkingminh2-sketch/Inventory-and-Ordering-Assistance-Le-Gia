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
