import { num } from './types'
import type { OrderWithDetails } from './types'

export interface TableBillTopping {
  id: string
  name_vi: string
  qty: number
  lineTotal: number
  comped: boolean
}

export interface TableBillItem {
  id: string
  name_vi: string
  qty: number
  lineTotal: number
  note: string | null
  comped: boolean
  toppings: TableBillTopping[]
}

export interface TableBill {
  tableId: string
  tableLabel: string
  total: number
  canCheckout: boolean
  orderIds: string[]
  items: TableBillItem[]
}

/** Pure function — no DB calls. Groups unpaid, non-cancelled orders into one bill per table, nesting each topping under the dish it was ordered with via parent_item_id. */
export function groupOrdersByTable(orders: OrderWithDetails[]): TableBill[] {
  const byTable = new Map<string, OrderWithDetails[]>()

  for (const order of orders) {
    if (order.status === 'cancelled' || !order.table_id) continue
    const existing = byTable.get(order.table_id) ?? []
    existing.push(order)
    byTable.set(order.table_id, existing)
  }

  return Array.from(byTable.entries()).map(([tableId, tableOrders]) => {
    const allOrderItems = tableOrders.flatMap(order => order.order_items)
    const roots = allOrderItems.filter(oi => !oi.parent_item_id)

    const items: TableBillItem[] = roots.map(root => ({
      id: root.id,
      name_vi: root.dish.name_vi,
      qty: root.qty,
      lineTotal: root.qty * num(root.price_at_order),
      note: root.note,
      comped: root.comped,
      toppings: allOrderItems
        .filter(oi => oi.parent_item_id === root.id)
        .map(topping => ({
          id: topping.id,
          name_vi: topping.dish.name_vi,
          qty: topping.qty,
          lineTotal: topping.qty * num(topping.price_at_order),
          comped: topping.comped,
        })),
    }))

    const total = items.reduce((sum, item) => {
      const itemContribution = item.comped ? 0 : item.lineTotal
      const toppingsContribution = item.toppings.reduce((s, t) => s + (t.comped ? 0 : t.lineTotal), 0)
      return sum + itemContribution + toppingsContribution
    }, 0)

    return {
      tableId,
      tableLabel: tableOrders[0].table.label,
      total,
      canCheckout: tableOrders.every(order => order.status === 'delivered'),
      orderIds: tableOrders.map(order => order.id),
      items,
    }
  })
}
