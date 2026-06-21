import type { Dish, RecipeLine } from './types'

/**
 * Pure function — no DB calls. Returns `toppings` reordered so any topping
 * sharing at least one ingredient with `dish`'s own recipe sorts before
 * every topping that doesn't, preserving relative order within each group.
 */
export function sortToppingsByRelevance(
  dish: Dish,
  toppings: Dish[],
  recipeLines: RecipeLine[],
): Dish[] {
  const dishItemIds = new Set(
    recipeLines.filter(r => r.dish_id === dish.id).map(r => r.item_id)
  )
  const relevantDishIds = new Set(
    recipeLines.filter(r => dishItemIds.has(r.item_id)).map(r => r.dish_id)
  )

  const relevant = toppings.filter(t => relevantDishIds.has(t.id))
  const other = toppings.filter(t => !relevantDishIds.has(t.id))
  return [...relevant, ...other]
}
