import { describe, it, expect } from 'vitest'
import { sortBySeverity } from '../stock-sort'
import type { Item } from '../types'

const base = { branch_id: 'b1', name_en: null, unit: 'phần' as const, category: null, is_active: true, created_at: '' }

describe('sortBySeverity', () => {
  it('puts out-of-stock items before low-stock items', () => {
    const low: Item = { ...base, id: 'low', name_vi: 'Low', quantity: 2, low_threshold: 3 }
    const out: Item = { ...base, id: 'out', name_vi: 'Out', quantity: 0, low_threshold: 3 }
    expect(sortBySeverity([low, out]).map(i => i.id)).toEqual(['out', 'low'])
  })

  it('puts low-stock items before sufficient items', () => {
    const sufficient: Item = { ...base, id: 'ok', name_vi: 'Ok', quantity: 10, low_threshold: 3 }
    const low: Item = { ...base, id: 'low', name_vi: 'Low', quantity: 2, low_threshold: 3 }
    expect(sortBySeverity([sufficient, low]).map(i => i.id)).toEqual(['low', 'ok'])
  })

  it('treats a negative quantity as out-of-stock', () => {
    const negative: Item = { ...base, id: 'neg', name_vi: 'Neg', quantity: -1, low_threshold: 3 }
    const low: Item = { ...base, id: 'low', name_vi: 'Low', quantity: 2, low_threshold: 3 }
    expect(sortBySeverity([low, negative]).map(i => i.id)).toEqual(['neg', 'low'])
  })

  it('keeps the original relative order within the same severity tier (stable sort)', () => {
    const a: Item = { ...base, id: 'a', name_vi: 'A', quantity: 10, low_threshold: 3 }
    const b: Item = { ...base, id: 'b', name_vi: 'B', quantity: 10, low_threshold: 3 }
    const c: Item = { ...base, id: 'c', name_vi: 'C', quantity: 10, low_threshold: 3 }
    expect(sortBySeverity([c, a, b]).map(i => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('does not mutate the input array', () => {
    const items: Item[] = [
      { ...base, id: 'ok', name_vi: 'Ok', quantity: 10, low_threshold: 3 },
      { ...base, id: 'out', name_vi: 'Out', quantity: 0, low_threshold: 3 },
    ]
    const original = [...items]
    sortBySeverity(items)
    expect(items).toEqual(original)
  })
})
