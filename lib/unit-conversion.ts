import type { ItemUnit } from './types'

export const BIGGER_UNIT: Partial<Record<ItemUnit, { unit: string; factor: number }>> = {
  g: { unit: 'kg', factor: 1000 },
  ml: { unit: 'l', factor: 1000 },
}

/** Pure function — no DB calls. Converts a value typed in the bigger unit (if useBigger) into the item's canonical small unit. */
export function toCanonical(displayValue: number, unit: ItemUnit, useBigger: boolean): number {
  const bigger = BIGGER_UNIT[unit]
  if (useBigger && bigger) return displayValue * bigger.factor
  return displayValue
}

/** Pure function — no DB calls. Converts a canonical small-unit value into the bigger unit for display (if useBigger). */
export function fromCanonical(canonicalValue: number, unit: ItemUnit, useBigger: boolean): number {
  const bigger = BIGGER_UNIT[unit]
  if (useBigger && bigger) return canonicalValue / bigger.factor
  return canonicalValue
}
