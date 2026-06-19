import { calculateDecrements } from '../stock'

const recipes = [
  { id: 'r1', dish_id: 'dish-special', item_id: 'item-gio',    qty_per_serving: 2 },
  { id: 'r2', dish_id: 'dish-special', item_id: 'item-moc',    qty_per_serving: 1 },
  { id: 'r3', dish_id: 'dish-thuong',  item_id: 'item-gio',    qty_per_serving: 1 },
  { id: 'r4', dish_id: 'dish-thuong',  item_id: 'item-dau-hu', qty_per_serving: 1 },
]

describe('calculateDecrements', () => {
  it('returns empty array for empty order', () => {
    expect(calculateDecrements([], recipes)).toEqual([])
  })

  it('calculates single dish correctly', () => {
    const result = calculateDecrements(
      [{ dish_id: 'dish-special', qty: 1 }],
      recipes
    )
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio', delta: -2 },
      { item_id: 'item-moc', delta: -1 },
    ]))
    expect(result).toHaveLength(2)
  })

  it('multiplies by qty', () => {
    const result = calculateDecrements(
      [{ dish_id: 'dish-special', qty: 3 }],
      recipes
    )
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio', delta: -6 },
      { item_id: 'item-moc', delta: -3 },
    ]))
  })

  it('aggregates shared ingredients across dishes', () => {
    const result = calculateDecrements(
      [
        { dish_id: 'dish-special', qty: 1 },
        { dish_id: 'dish-thuong',  qty: 2 },
      ],
      recipes
    )
    // item-gio: special(2×1) + thuong(1×2) = 4
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio',    delta: -4 },
      { item_id: 'item-moc',    delta: -1 },
      { item_id: 'item-dau-hu', delta: -2 },
    ]))
    expect(result).toHaveLength(3)
  })

  it('returns positive deltas for cancellation (reversal=true)', () => {
    const result = calculateDecrements(
      [{ dish_id: 'dish-special', qty: 1 }],
      recipes,
      true  // reversal
    )
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio', delta: 2 },
      { item_id: 'item-moc', delta: 1 },
    ]))
  })
})
