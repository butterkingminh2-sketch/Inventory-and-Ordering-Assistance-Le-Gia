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
