import { describe, it, expect } from 'vitest'
import { groupOrdersByTable } from '../billing'
import type { OrderWithDetails } from '../types'

const baseOrder = {
  branch_id: 'branch-1',
  created_by: null,
  created_at: '2026-06-19T10:00:00Z',
  ready_at: null,
  paid_at: null,
}

describe('groupOrdersByTable', () => {
  it('sums line totals for a single delivered order', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 2, price_at_order: 65000, note: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills).toHaveLength(1)
    expect(bills[0].tableId).toBe('table-1')
    expect(bills[0].tableLabel).toBe('Bàn 1')
    expect(bills[0].total).toBe(130000)
    expect(bills[0].canCheckout).toBe(true)
  })

  it('sums across multiple separate orders for the same table', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 3, price_at_order: 5000, note: null, dish: { name_vi: 'Trà đá', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills).toHaveLength(1)
    expect(bills[0].total).toBe(80000)
    expect(bills[0].orderIds).toEqual(['order-1', 'order-2'])
  })

  it('blocks checkout when any order for the table is not delivered', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'pending',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 1, price_at_order: 20000, note: null, dish: { name_vi: 'Chả', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].canCheckout).toBe(false)
    expect(bills[0].total).toBe(85000)
  })

  it('excludes cancelled orders entirely', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'cancelled',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 5, price_at_order: 100000, note: null, dish: { name_vi: 'Mọc', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].total).toBe(65000)
    expect(bills[0].orderIds).toEqual(['order-1'])
  })

  it('groups separate tables independently', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-2',
        status: 'delivered',
        table: { label: 'Bàn 2' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 1, price_at_order: 40000, note: null, dish: { name_vi: 'Chả', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills).toHaveLength(2)
  })
})
