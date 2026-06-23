import type { Language } from './types'

/** Pure function — no DB calls. */
export function pickLabel(language: Language, vi: string, en: string): string {
  return language === 'vi' ? vi : en
}

/**
 * Pure function — no DB calls. Falls back to name_vi whenever name_en is
 * missing or empty, regardless of the selected language — there's nothing
 * to show in English otherwise.
 */
export function pickName(row: { name_vi: string; name_en: string | null }, language: Language): string {
  if (language === 'vi' || !row.name_en) return row.name_vi
  return row.name_en
}
