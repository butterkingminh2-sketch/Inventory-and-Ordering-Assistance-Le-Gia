import { describe, it, expect } from 'vitest'
import { getDateRangeStart, getPriorRangeStart, rankByQuantity, leastByQuantity, rankByRevenue, getDaysRemaining, getRestockAlerts, getDailyRevenue } from '../analytics'
import { getPublicChannelCutoff } from '../chat'
import type { Dish, Item } from '../types'

const baseDish = { branch_id: '', name_en: null, category: null, image_url: null, is_topping: false, is_active: true, created_at: '' }
const bunRieuBo: Dish = { ...baseDish, id: 'dish-bun-rieu-bo', name_vi: 'Bún riêu bò', price: 60000 }
const mocThem: Dish = { ...baseDish, id: 'dish-moc-them', name_vi: 'Mọc thêm', price: 8000 }
const dishes = [bunRieuBo, mocThem]

const baseItem = { branch_id: '', name_en: null, category: null, is_active: true, created_at: '' }
const bunTuoi: Item = { ...baseItem, id: 'item-bun-tuoi', name_vi: 'Bún tươi', unit: 'g', quantity: 7500, low_threshold: 5000 }
const moc: Item = { ...baseItem, id: 'item-moc', name_vi: 'Mọc', unit: 'viên', quantity: 8, low_threshold: 10 }

describe('getDateRangeStart', () => {
  it('"today" matches the same 6 AM cutoff chat already uses', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0)
    expect(getDateRangeStart(now, 'today')).toEqual(getPublicChannelCutoff(now))
  })

  it('"7d" is the today-cutoff minus 7 days', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0)
    const expected = new Date(getPublicChannelCutoff(now))
    expected.setDate(expected.getDate() - 7)
    expect(getDateRangeStart(now, '7d')).toEqual(expected)
  })

  it('"30d" is the today-cutoff minus 30 days', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0)
    const expected = new Date(getPublicChannelCutoff(now))
    expected.setDate(expected.getDate() - 30)
    expect(getDateRangeStart(now, '30d')).toEqual(expected)
  })
})

describe('getPriorRangeStart', () => {
  it('"today" is the current range start minus 1 day', () => {
    const rangeStart = new Date(2026, 5, 21, 6, 0, 0)
    expect(getPriorRangeStart(rangeStart, 'today')).toEqual(new Date(2026, 5, 20, 6, 0, 0))
  })

  it('"7d" is the current range start minus 7 days', () => {
    const rangeStart = new Date(2026, 5, 21, 6, 0, 0)
    expect(getPriorRangeStart(rangeStart, '7d')).toEqual(new Date(2026, 5, 14, 6, 0, 0))
  })

  it('"30d" is the current range start minus 30 days', () => {
    const rangeStart = new Date(2026, 5, 21, 6, 0, 0)
    expect(getPriorRangeStart(rangeStart, '30d')).toEqual(new Date(2026, 4, 22, 6, 0, 0))
  })
})

describe('rankByQuantity', () => {
  it('aggregates multiple order lines for the same dish and sorts descending', () => {
    const orderLines = [
      { dish_id: 'dish-bun-rieu-bo', qty: 2 },
      { dish_id: 'dish-moc-them', qty: 10 },
      { dish_id: 'dish-bun-rieu-bo', qty: 3 },
    ]
    const result = rankByQuantity(orderLines, dishes, 5)
    expect(result).toEqual([
      { dish: mocThem, qty: 10 },
      { dish: bunRieuBo, qty: 5 },
    ])
  })

  it('truncates to the given limit', () => {
    const orderLines = [{ dish_id: 'dish-bun-rieu-bo', qty: 5 }, { dish_id: 'dish-moc-them', qty: 10 }]
    expect(rankByQuantity(orderLines, dishes, 1)).toEqual([{ dish: mocThem, qty: 10 }])
  })

  it('skips a dish_id with no matching dish', () => {
    const orderLines = [{ dish_id: 'dish-deleted', qty: 99 }, { dish_id: 'dish-moc-them', qty: 1 }]
    expect(rankByQuantity(orderLines, dishes, 5)).toEqual([{ dish: mocThem, qty: 1 }])
  })
})

describe('leastByQuantity', () => {
  it('includes a dish with zero orders, sorted to the bottom group first', () => {
    const orderLines = [{ dish_id: 'dish-moc-them', qty: 10 }]
    const result = leastByQuantity(orderLines, dishes, 5)
    expect(result).toEqual([
      { dish: bunRieuBo, qty: 0 },
      { dish: mocThem, qty: 10 },
    ])
  })

  it('truncates to the given limit', () => {
    const orderLines = [{ dish_id: 'dish-moc-them', qty: 10 }]
    expect(leastByQuantity(orderLines, dishes, 1)).toEqual([{ dish: bunRieuBo, qty: 0 }])
  })
})

describe('rankByRevenue', () => {
  it('sums qty × price_at_order per dish and sorts descending', () => {
    const orderLines = [
      { dish_id: 'dish-bun-rieu-bo', qty: 2, price_at_order: 60000 },
      { dish_id: 'dish-moc-them', qty: 10, price_at_order: 8000 },
    ]
    expect(rankByRevenue(orderLines, dishes, 5)).toEqual([
      { dish: bunRieuBo, revenue: 120000 },
      { dish: mocThem, revenue: 80000 },
    ])
  })
})

describe('getDaysRemaining', () => {
  it('returns null when nothing was consumed in the range', () => {
    expect(getDaysRemaining(0, 7, 7500)).toBeNull()
  })

  it('computes current stock divided by the daily rate', () => {
    // consumed 1050 over 7 days = 150/day; 7500 stock / 150 = 50 days
    expect(getDaysRemaining(1050, 7, 7500)).toBe(50)
  })
})

describe('getRestockAlerts', () => {
  it('includes only items under the urgency threshold, most urgent first', () => {
    const items = [bunTuoi, moc]
    // bunTuoi: 7500 stock, consumed 7500 over 1 day -> 1 day remaining (urgent)
    // moc: 8 stock, consumed 1 over 1 day -> 8 days remaining (not urgent)
    const consumptionByItemId = { 'item-bun-tuoi': 7500, 'item-moc': 1 }
    const alerts = getRestockAlerts(items, consumptionByItemId, 1, 3)
    expect(alerts).toEqual([{ item: bunTuoi, daysRemaining: 1 }])
  })

  it('excludes items with zero consumption even if stock is critically low', () => {
    const items = [moc]
    const alerts = getRestockAlerts(items, {}, 1, 3)
    expect(alerts).toEqual([])
  })
})

describe('getDailyRevenue', () => {
  it('sums revenue per calendar day across multiple orders, sorted oldest first', () => {
    const orders = [
      { created_at: '2026-06-21T10:00:00Z', order_items: [{ qty: 2, price_at_order: 60000 }] },
      { created_at: '2026-06-20T08:00:00Z', order_items: [{ qty: 1, price_at_order: 8000 }] },
      { created_at: '2026-06-21T18:00:00Z', order_items: [{ qty: 1, price_at_order: 8000 }] },
    ]
    expect(getDailyRevenue(orders)).toEqual([
      { date: '2026-06-20', revenue: 8000 },
      { date: '2026-06-21', revenue: 128000 },
    ])
  })

  it('returns an empty array for no orders', () => {
    expect(getDailyRevenue([])).toEqual([])
  })
})
