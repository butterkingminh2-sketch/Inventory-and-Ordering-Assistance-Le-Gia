import { num } from './types'
import type { OrderWithDetails } from './types'

export interface TableBillItem {
  name_vi: string
  qty: number
  lineTotal: number
  note: string | null
}

export interface TableBill {
  tableId: string
  tableLabel: string
  total: number
  canCheckout: boolean
  orderIds: string[]
  items: TableBillItem[]
}

/** Pure function — no DB calls. Groups unpaid, non-cancelled orders into one bill per table. */
export function groupOrdersByTable(orders: OrderWithDetails[]): TableBill[] {
  const byTable = new Map<string, OrderWithDetails[]>()

  for (const order of orders) {
    if (order.status === 'cancelled' || !order.table_id) continue
    const existing = byTable.get(order.table_id) ?? []
    existing.push(order)
    byTable.set(order.table_id, existing)
  }

  return Array.from(byTable.entries()).map(([tableId, tableOrders]) => {
    const items: TableBillItem[] = tableOrders.flatMap(order =>
      order.order_items.map(oi => ({
        name_vi: oi.dish.name_vi,
        qty: oi.qty,
        lineTotal: oi.qty * num(oi.price_at_order),
        note: oi.note,
      }))
    )

    return {
      tableId,
      tableLabel: tableOrders[0].table.label,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0),
      canCheckout: tableOrders.every(order => order.status === 'delivered'),
      orderIds: tableOrders.map(order => order.id),
      items,
    }
  })
}
