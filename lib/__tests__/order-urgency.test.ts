import { describe, it, expect } from 'vitest'
import { isUrgent } from '../order-urgency'

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
