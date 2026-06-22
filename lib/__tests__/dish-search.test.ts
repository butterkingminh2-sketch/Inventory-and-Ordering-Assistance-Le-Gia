import { describe, it, expect } from 'vitest'
import { matchesDishSearch } from '../dish-search'

describe('matchesDishSearch', () => {
  it('matches every dish when the query is empty or whitespace', () => {
    expect(matchesDishSearch({ name_vi: 'Bún riêu', name_en: null }, '')).toBe(true)
    expect(matchesDishSearch({ name_vi: 'Bún riêu', name_en: null }, '   ')).toBe(true)
  })

  it('matches a substring of the Vietnamese name, case-insensitively', () => {
    expect(matchesDishSearch({ name_vi: 'Bún riêu đặc biệt', name_en: null }, 'RIÊU')).toBe(true)
  })

  it('matches with diacritics stripped from the query', () => {
    expect(matchesDishSearch({ name_vi: 'Bún riêu', name_en: null }, 'rieu')).toBe(true)
    expect(matchesDishSearch({ name_vi: 'Đậu hũ chiên', name_en: null }, 'dau')).toBe(true)
  })

  it('matches against the English name when the Vietnamese name does not match', () => {
    expect(matchesDishSearch({ name_vi: 'Bún riêu', name_en: 'Crab noodle soup' }, 'noodle')).toBe(true)
  })

  it('returns false when neither name contains the query', () => {
    expect(matchesDishSearch({ name_vi: 'Bún riêu', name_en: 'Crab noodle soup' }, 'pho')).toBe(false)
  })

  it('handles a null English name without throwing', () => {
    expect(matchesDishSearch({ name_vi: 'Bún riêu', name_en: null }, 'pho')).toBe(false)
  })
})
