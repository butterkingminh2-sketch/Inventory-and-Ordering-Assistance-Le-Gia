import { describe, it, expect } from 'vitest'
import { groupAdjacentByTable } from '../order-grouping'
import type { OrderWithDetails } from '../types'

const baseOrder = {
  branch_id: 'branch-1',
  created_by: null,
  updated_at: '2026-06-20T10:00:00Z',
  ready_at: null,
  paid_at: null,
  payment_method: null,
  status: 'pending' as const,
  order_items: [],
  table: { label: 'Bàn 1' },
}

describe('groupAdjacentByTable', () => {
  it('keeps orders for distinct tables in their original order when none repeat', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: 'table-1', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: 'table-2', created_at: '2026-06-20T10:01:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    expect(result.map(o => o.id)).toEqual(['o1', 'o2'])
  })

  it('makes two orders for the same table adjacent, anchored at the first occurrence', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: 'table-1', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: 'table-2', created_at: '2026-06-20T10:01:00Z' },
      { ...baseOrder, id: 'o3', table_id: 'table-1', created_at: '2026-06-20T10:02:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    // o3 (table-1, newer) moves to sit right after o1 (table-1, older),
    // rather than staying at its natural created_at position after o2.
    expect(result.map(o => o.id)).toEqual(['o1', 'o3', 'o2'])
  })

  it('keeps two independent multi-order tables correctly separated when interleaved', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'a1', table_id: 'table-a', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'b1', table_id: 'table-b', created_at: '2026-06-20T10:01:00Z' },
      { ...baseOrder, id: 'a2', table_id: 'table-a', created_at: '2026-06-20T10:02:00Z' },
      { ...baseOrder, id: 'b2', table_id: 'table-b', created_at: '2026-06-20T10:03:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    // table-a's group anchors at a1 (the overall oldest order), ahead of table-b's group.
    expect(result.map(o => o.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('keeps three or more orders for one table all contiguous', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: 'table-1', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: 'table-2', created_at: '2026-06-20T10:01:00Z' },
      { ...baseOrder, id: 'o3', table_id: 'table-1', created_at: '2026-06-20T10:02:00Z' },
      { ...baseOrder, id: 'o4', table_id: 'table-1', created_at: '2026-06-20T10:03:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    expect(result.map(o => o.id)).toEqual(['o1', 'o3', 'o4', 'o2'])
  })

  it('never groups orders with a null table_id together', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: null, created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: null, created_at: '2026-06-20T10:01:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    expect(result.map(o => o.id)).toEqual(['o1', 'o2'])
  })
})
