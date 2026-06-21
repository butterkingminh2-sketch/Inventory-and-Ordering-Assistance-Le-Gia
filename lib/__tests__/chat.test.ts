import { describe, it, expect } from 'vitest'
import { getPublicChannelCutoff } from '../chat'

describe('getPublicChannelCutoff', () => {
  it('rolls back to yesterday 6 AM when now is before 6 AM today', () => {
    const now = new Date(2026, 5, 21, 3, 0, 0) // June 21, 3:00 AM
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 20, 6, 0, 0)) // June 20, 6:00 AM
  })

  it('uses today 6 AM when now is after 6 AM today', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0) // June 21, 2:00 PM
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 21, 6, 0, 0)) // June 21, 6:00 AM
  })

  it('treats exactly 6:00:00 AM as already "today"', () => {
    const now = new Date(2026, 5, 21, 6, 0, 0) // June 21, 6:00:00 AM exactly
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 21, 6, 0, 0))
  })

  it('treats one second before 6 AM as still yesterday', () => {
    const now = new Date(2026, 5, 21, 5, 59, 59)
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 20, 6, 0, 0))
  })
})
