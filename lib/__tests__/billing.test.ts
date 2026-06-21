import { describe, it, expect } from 'vitest'
import { groupOrdersByTable } from '../billing'
import type { OrderWithDetails } from '../types'

const baseOrder = {
  branch_id: 'branch-1',
  created_by: null,
  created_at: '2026-06-19T10:00:00Z',
  ready_at: null,
  paid_at: null,
  payment_method: null,
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
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 2, price_at_order: 65000, note: null, parent_item_id: null, dish: { name_vi: 'Bún riêu', name_en: null } },
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

  it('passes a non-null note through to the bill item', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: 'không đậu hũ', parent_item_id: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].items[0].note).toBe('không đậu hũ')
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
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, parent_item_id: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 3, price_at_order: 5000, note: null, parent_item_id: null, dish: { name_vi: 'Trà đá', name_en: null } },
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
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, parent_item_id: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'pending',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 1, price_at_order: 20000, note: null, parent_item_id: null, dish: { name_vi: 'Chả', name_en: null } },
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
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, parent_item_id: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'cancelled',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 5, price_at_order: 100000, note: null, parent_item_id: null, dish: { name_vi: 'Mọc', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].total).toBe(65000)
    expect(bills[0].orderIds).toEqual(['order-1'])
  })

  it('nests a topping under its parent dish via parent_item_id', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-dish', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 45000, note: null, parent_item_id: null, dish: { name_vi: 'Bát đặc biệt', name_en: null } },
          { id: 'oi-topping', order_id: 'order-1', dish_id: 'dish-topping', qty: 1, price_at_order: 10000, note: null, parent_item_id: 'oi-dish', dish: { name_vi: 'Tóp mỡ', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].items).toHaveLength(1)
    expect(bills[0].items[0].name_vi).toBe('Bát đặc biệt')
    expect(bills[0].items[0].toppings).toEqual([
      { name_vi: 'Tóp mỡ', qty: 1, lineTotal: 10000 },
    ])
    expect(bills[0].total).toBe(55000)
  })

  it('sums multiple toppings under the same dish and keeps unrelated toppings separate', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-dish-a', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 45000, note: null, parent_item_id: null, dish: { name_vi: 'Bát đặc biệt', name_en: null } },
          { id: 'oi-topping-1', order_id: 'order-1', dish_id: 'dish-topping-1', qty: 1, price_at_order: 10000, note: null, parent_item_id: 'oi-dish-a', dish: { name_vi: 'Tóp mỡ', name_en: null } },
          { id: 'oi-topping-2', order_id: 'order-1', dish_id: 'dish-topping-2', qty: 1, price_at_order: 8000, note: null, parent_item_id: 'oi-dish-a', dish: { name_vi: 'Giò tai', name_en: null } },
          { id: 'oi-dish-b', order_id: 'order-1', dish_id: 'dish-2', qty: 1, price_at_order: 45000, note: null, parent_item_id: null, dish: { name_vi: 'Bát thường', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].items).toHaveLength(2)
    expect(bills[0].items[0].toppings).toEqual([
      { name_vi: 'Tóp mỡ', qty: 1, lineTotal: 10000 },
      { name_vi: 'Giò tai', qty: 1, lineTotal: 8000 },
    ])
    expect(bills[0].items[1].toppings).toEqual([])
    expect(bills[0].total).toBe(108000)
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
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: null, parent_item_id: null, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-2',
        status: 'delivered',
        table: { label: 'Bàn 2' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 1, price_at_order: 40000, note: null, parent_item_id: null, dish: { name_vi: 'Chả', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills).toHaveLength(2)
  })
})
