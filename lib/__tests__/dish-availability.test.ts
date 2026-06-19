import { describe, it, expect } from 'vitest'
import { getDishStatus } from '../dish-availability'
import type { Item, RecipeLine } from '../types'

const items: Item[] = [
  { id: 'item-gio',     quantity: 5, low_threshold: 3, branch_id: '', name_vi: 'Giò',     name_en: null, unit: 'phần', is_active: true, created_at: '' },
  { id: 'item-moc',     quantity: 2, low_threshold: 3, branch_id: '', name_vi: 'Mọc',     name_en: null, unit: 'phần', is_active: true, created_at: '' },
  { id: 'item-dau-hu',  quantity: 0, low_threshold: 2, branch_id: '', name_vi: 'Đậu hũ',  name_en: null, unit: 'miếng', is_active: true, created_at: '' },
]

const recipes: RecipeLine[] = [
  { id: 'r1', dish_id: 'dish-ok',  item_id: 'item-gio',    qty_per_serving: 1 },
  { id: 'r2', dish_id: 'dish-low', item_id: 'item-moc',    qty_per_serving: 1 },
  { id: 'r3', dish_id: 'dish-out', item_id: 'item-dau-hu', qty_per_serving: 1 },
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
