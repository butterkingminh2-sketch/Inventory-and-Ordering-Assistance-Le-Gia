import { describe, it, expect } from 'vitest'
import { BIGGER_UNIT, toCanonical, fromCanonical } from '../unit-conversion'

describe('BIGGER_UNIT', () => {
  it('defines kg for g and l for ml', () => {
    expect(BIGGER_UNIT.g).toEqual({ unit: 'kg', factor: 1000 })
    expect(BIGGER_UNIT.ml).toEqual({ unit: 'l', factor: 1000 })
  })

  it('has no entry for discrete units', () => {
    expect(BIGGER_UNIT['miếng']).toBeUndefined()
    expect(BIGGER_UNIT['phần']).toBeUndefined()
  })
})

describe('toCanonical', () => {
  it('converts kg to g when useBigger is true', () => {
    expect(toCanonical(5, 'g', true)).toBe(5000)
  })

  it('converts l to ml when useBigger is true', () => {
    expect(toCanonical(2.5, 'ml', true)).toBe(2500)
  })

  it('returns the value unchanged when useBigger is false', () => {
    expect(toCanonical(150, 'g', false)).toBe(150)
  })

  it('returns the value unchanged for a unit with no bigger counterpart, even if useBigger is true', () => {
    expect(toCanonical(98, 'miếng', true)).toBe(98)
  })
})

describe('fromCanonical', () => {
  it('converts g to kg when useBigger is true', () => {
    expect(fromCanonical(5000, 'g', true)).toBe(5)
  })

  it('converts ml to l when useBigger is true', () => {
    expect(fromCanonical(2500, 'ml', true)).toBe(2.5)
  })

  it('returns the value unchanged when useBigger is false', () => {
    expect(fromCanonical(150, 'g', false)).toBe(150)
  })

  it('round-trips through toCanonical/fromCanonical for g/kg', () => {
    const original = 7.5
    const canonical = toCanonical(original, 'g', true)
    expect(fromCanonical(canonical, 'g', true)).toBe(original)
  })
})
