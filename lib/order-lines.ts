import type { OrderItem } from './types'

export interface OrderLine {
  id: string
  dishId: string
  toppings: Record<string, number>
  note: string
}

/**
 * Pure function — no DB calls. Total quantity per dish across the whole
 * cart, combining each line's own dish with any toppings attached to other
 * lines — the same pool used for stock-availability checks, since a
 * topping consumes ingredients the same way ordering it standalone would.
 */
export function aggregateQuantities(lines: OrderLine[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const line of lines) {
    result[line.dishId] = (result[line.dishId] ?? 0) + 1
    for (const [toppingId, qty] of Object.entries(line.toppings)) {
      result[toppingId] = (result[toppingId] ?? 0) + qty
    }
  }
  return result
}

/**
 * Pure function — no DB calls. Reconstructs cart-shaped OrderLines from a
 * flat list of order_items, the inverse of how dat-mon submits an order:
 * each root item (no parent_item_id) becomes a line, and every item whose
 * parent_item_id points at it becomes a nested topping.
 */
export function linesFromOrderItems(items: OrderItem[]): OrderLine[] {
  const roots = items.filter(item => !item.parent_item_id)

  return roots.map(root => {
    const toppings: Record<string, number> = {}
    for (const item of items) {
      if (item.parent_item_id === root.id) toppings[item.dish_id] = item.qty
    }
    return {
      id: root.id,
      dishId: root.dish_id,
      toppings,
      note: root.note ?? '',
    }
  })
}
