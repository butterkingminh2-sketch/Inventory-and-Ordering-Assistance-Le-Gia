import { describe, it, expect } from 'vitest'
import { isUrgent, elapsedLabel } from '../order-urgency'

describe('isUrgent', () => {
  it('returns false when ready_at is null', () => {
    expect(isUrgent(null)).toBe(false)
  })

  it('returns false when less than 5 minutes have passed', () => {
    const fourMinAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString()
    expect(isUrgent(fourMinAgo)).toBe(false)
  })

  it('returns true when 5 or more minutes have passed', () => {
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    expect(isUrgent(sixMinAgo)).toBe(true)
  })
})

const t = (vi: string, en: string) => en // tests assert against English since that's what's being verified as wired correctly

describe('elapsedLabel', () => {
  it('returns "just now" for less than a minute elapsed', () => {
    const justNow = new Date(Date.now() - 10_000).toISOString()
    expect(elapsedLabel(justNow, t)).toBe('just now')
  })

  it('returns "{N} min ago" for N minutes elapsed', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(elapsedLabel(fiveMinAgo, t)).toBe('5 min ago')
  })
})
