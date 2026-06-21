import type { OrderWithDetails } from './types'

/**
 * Pure function — no DB calls. Reorders an already created_at-ascending list so
 * orders sharing a table_id become contiguous. Each group's position in the
 * output is anchored to its oldest member's original position, so grouping
 * never changes a table's overall queue/urgency position. Orders with a null
 * table_id are never grouped with anything.
 */
export function groupAdjacentByTable(orders: OrderWithDetails[]): OrderWithDetails[] {
  const result: OrderWithDetails[] = []
  const lastIndexForTable = new Map<string, number>()

  for (const order of orders) {
    const tableId = order.table_id
    if (tableId !== null && lastIndexForTable.has(tableId)) {
      const insertAt = lastIndexForTable.get(tableId)! + 1
      result.splice(insertAt, 0, order)
      for (const [tid, idx] of lastIndexForTable) {
        if (idx >= insertAt) lastIndexForTable.set(tid, idx + 1)
      }
      lastIndexForTable.set(tableId, insertAt)
    } else {
      result.push(order)
      if (tableId !== null) lastIndexForTable.set(tableId, result.length - 1)
    }
  }

  return result
}
