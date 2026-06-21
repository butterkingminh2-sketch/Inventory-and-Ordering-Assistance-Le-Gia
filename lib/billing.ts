import { num } from './types'
import type { OrderWithDetails } from './types'

export interface TableBillTopping {
  name_vi: string
  qty: number
  lineTotal: number
}

export interface TableBillItem {
  name_vi: string
  qty: number
  lineTotal: number
  note: string | null
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
      name_vi: root.dish.name_vi,
      qty: root.qty,
      lineTotal: root.qty * num(root.price_at_order),
      note: root.note,
      toppings: allOrderItems
        .filter(oi => oi.parent_item_id === root.id)
        .map(topping => ({
          name_vi: topping.dish.name_vi,
          qty: topping.qty,
          lineTotal: topping.qty * num(topping.price_at_order),
        })),
    }))

    const total = items.reduce(
      (sum, item) => sum + item.lineTotal + item.toppings.reduce((s, t) => s + t.lineTotal, 0),
      0,
    )

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
