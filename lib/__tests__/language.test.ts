import { describe, it, expect } from 'vitest'
import { pickLabel, pickName } from '../language'

describe('pickLabel', () => {
  it('returns the Vietnamese string when language is vi', () => {
    expect(pickLabel('vi', 'Xin chào', 'Hello')).toBe('Xin chào')
  })

  it('returns the English string when language is en', () => {
    expect(pickLabel('en', 'Xin chào', 'Hello')).toBe('Hello')
  })
})

describe('pickName', () => {
  it('returns name_en when language is en and name_en is present', () => {
    const row = { name_vi: 'Quẩy', name_en: 'Fried dough stick' }
    expect(pickName(row, 'en')).toBe('Fried dough stick')
  })

  it('returns name_vi when language is vi, regardless of name_en', () => {
    const row = { name_vi: 'Quẩy', name_en: 'Fried dough stick' }
    expect(pickName(row, 'vi')).toBe('Quẩy')
  })

  it('falls back to name_vi when name_en is null, even in English mode', () => {
    const row = { name_vi: 'Rau sống', name_en: null }
    expect(pickName(row, 'en')).toBe('Rau sống')
  })

  it('falls back to name_vi when name_en is an empty string, even in English mode', () => {
    const row = { name_vi: 'Hành lá', name_en: '' }
    expect(pickName(row, 'en')).toBe('Hành lá')
  })
})
