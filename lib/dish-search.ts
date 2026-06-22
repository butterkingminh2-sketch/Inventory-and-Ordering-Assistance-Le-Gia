import { stripDiacritics } from './text'
import type { Dish } from './types'

/** Pure function — no DB calls. Matches a dish's VI/EN name against a query, ignoring case and diacritics. */
export function matchesDishSearch(dish: Pick<Dish, 'name_vi' | 'name_en'>, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true

  const normalizedQuery = stripDiacritics(trimmed).toLowerCase()
  const haystacks = [dish.name_vi, dish.name_en].filter((s): s is string => !!s)

  return haystacks.some(name => stripDiacritics(name).toLowerCase().includes(normalizedQuery))
}
