import { describe, it, expect } from 'vitest'
import { sortToppingsByRelevance } from '../topping-relevance'
import type { Dish, RecipeLine } from '../types'

const baseDish = {
  branch_id: '', name_en: null, price: 0, category: null, image_url: null, is_active: true, created_at: '',
}

const bunRieu: Dish = { ...baseDish, id: 'bun-rieu', name_vi: 'Bún riêu', is_topping: false }
const bunThem: Dish = { ...baseDish, id: 'bun-them', name_vi: 'Bún thêm', is_topping: true }
const dauHuThem: Dish = { ...baseDish, id: 'dau-hu-them', name_vi: 'Đậu hũ thêm', is_topping: true }
const trungVitLon: Dish = { ...baseDish, id: 'trung-vit-lon', name_vi: 'Trứng vịt lộn', is_topping: true }
const noRecipeDish: Dish = { ...baseDish, id: 'no-recipe-dish', name_vi: 'Trà đá', is_topping: false }

const recipes: RecipeLine[] = [
  { id: 'r1', dish_id: 'bun-rieu', item_id: 'item-bun', qty_per_serving: 1 },
  { id: 'r2', dish_id: 'bun-rieu', item_id: 'item-dau-hu', qty_per_serving: 1 },
  { id: 'r3', dish_id: 'bun-them', item_id: 'item-bun', qty_per_serving: 1 },
  { id: 'r4', dish_id: 'dau-hu-them', item_id: 'item-dau-hu', qty_per_serving: 1 },
  // trung-vit-lon and no-recipe-dish have no recipe line at all
]

describe('sortToppingsByRelevance', () => {
  it('sorts toppings sharing an ingredient with the dish before ones that do not', () => {
    const result = sortToppingsByRelevance(bunRieu, [trungVitLon, bunThem], recipes)
    expect(result.map(t => t.id)).toEqual(['bun-them', 'trung-vit-lon'])
  })

  it('preserves relative order within the relevant group', () => {
    const result = sortToppingsByRelevance(bunRieu, [dauHuThem, bunThem], recipes)
    expect(result.map(t => t.id)).toEqual(['dau-hu-them', 'bun-them'])
  })

  it('preserves relative order within the other group', () => {
    const otherTopping: Dish = { ...baseDish, id: 'other-topping', name_vi: 'Khác', is_topping: true }
    const result = sortToppingsByRelevance(bunRieu, [trungVitLon, otherTopping], recipes)
    expect(result.map(t => t.id)).toEqual(['trung-vit-lon', 'other-topping'])
  })

  it('puts every topping in the other group when the dish has no recipe lines', () => {
    const result = sortToppingsByRelevance(noRecipeDish, [bunThem, trungVitLon], recipes)
    expect(result.map(t => t.id)).toEqual(['bun-them', 'trung-vit-lon'])
  })

  it('returns an empty array when there are no toppings to sort', () => {
    expect(sortToppingsByRelevance(bunRieu, [], recipes)).toEqual([])
  })
})
