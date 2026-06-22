import { stripDiacritics } from './text'

interface Named {
  name_vi: string
  name_en: string | null
}

/** Pure function — no DB calls. Matches a dish or item's VI/EN name against a query, ignoring case and diacritics. */
export function matchesNameSearch(entity: Named, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true

  const normalizedQuery = stripDiacritics(trimmed).toLowerCase()
  const haystacks = [entity.name_vi, entity.name_en].filter((s): s is string => !!s)

  return haystacks.some(name => stripDiacritics(name).toLowerCase().includes(normalizedQuery))
}
