import { describe, it, expect } from 'vitest'
import { getDishStatus, getMaxOrderableQty } from '../dish-availability'
import type { Item, RecipeLine } from '../types'

const items: Item[] = [
  { id: 'item-gio',     quantity: 5, low_threshold: 3, branch_id: '', name_vi: 'Giò',     name_en: null, category: null, unit: 'phần', is_active: true, created_at: '' },
  { id: 'item-moc',     quantity: 2, low_threshold: 3, branch_id: '', name_vi: 'Mọc',     name_en: null, category: null, unit: 'phần', is_active: true, created_at: '' },
  { id: 'item-dau-hu',  quantity: 0, low_threshold: 2, branch_id: '', name_vi: 'Đậu hũ',  name_en: null, category: null, unit: 'miếng', is_active: true, created_at: '' },
  { id: 'item-bun',     quantity: 5, low_threshold: 1, branch_id: '', name_vi: 'Bún',     name_en: null, category: null, unit: 'g',    is_active: true, created_at: '' },
]

const recipes: RecipeLine[] = [
  { id: 'r1', dish_id: 'dish-ok',  item_id: 'item-gio',    qty_per_serving: 1 },
  { id: 'r2', dish_id: 'dish-low', item_id: 'item-moc',    qty_per_serving: 1 },
  { id: 'r3', dish_id: 'dish-out', item_id: 'item-dau-hu', qty_per_serving: 1 },
  { id: 'r4', dish_id: 'dish-bun-a', item_id: 'item-bun',  qty_per_serving: 1 },
  { id: 'r5', dish_id: 'dish-bun-b', item_id: 'item-bun',  qty_per_serving: 2 },
]

describe('getDishStatus', () => {
  it('returns available when all ingredients are sufficient', () => {
    expect(getDishStatus('dish-ok', recipes, items)).toBe('available')
  })

  it('returns low when any ingredient is at or below threshold', () => {
    expect(getDishStatus('dish-low', recipes, items)).toBe('low')
  })

  it('returns unavailable when any ingredient is 0', () => {
    expect(getDishStatus('dish-out', recipes, items)).toBe('unavailable')
  })

  it('returns available for dish with no recipe lines', () => {
    expect(getDishStatus('dish-no-recipe', recipes, items)).toBe('available')
  })
})

describe('getMaxOrderableQty', () => {
  it('caps at stock / qty_per_serving with an empty cart', () => {
    expect(getMaxOrderableQty('dish-ok', recipes, items, {})).toBe(5)
  })

  it('returns 0 when the ingredient is already out of stock', () => {
    expect(getMaxOrderableQty('dish-out', recipes, items, {})).toBe(0)
  })

  it('returns Infinity for a dish with no recipe lines', () => {
    expect(getMaxOrderableQty('dish-no-recipe', recipes, items, {})).toBe(Infinity)
  })

  it('does not count the dish itself as "reserved by other cart items"', () => {
    // dish-bun-a already has 3 in the cart; its own reservation must not
    // reduce its own ceiling — only OTHER dishes sharing item-bun should.
    expect(getMaxOrderableQty('dish-bun-a', recipes, items, { 'dish-bun-a': 3 })).toBe(5)
  })

  it('subtracts what other cart items already reserve from a shared ingredient', () => {
    // item-bun has 5kg. dish-bun-b needs 2kg/serving; 1 already in cart reserves 2kg,
    // leaving 3kg. dish-bun-a needs 1kg/serving, so its ceiling is 3.
    expect(getMaxOrderableQty('dish-bun-a', recipes, items, { 'dish-bun-b': 1 })).toBe(3)
  })

  it('rounds down to whole servings when stock does not divide evenly', () => {
    // 3kg of bun remaining ÷ 2kg/serving for dish-bun-b = 1.5 → floor to 1
    expect(getMaxOrderableQty('dish-bun-b', recipes, items, { 'dish-bun-a': 2 })).toBe(1)
  })

  it('never goes negative when other cart items already exceed stock', () => {
    expect(getMaxOrderableQty('dish-bun-a', recipes, items, { 'dish-bun-b': 10 })).toBe(0)
  })
})
