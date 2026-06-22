import { describe, it, expect } from 'vitest'
import { getDefaultRouteForRole } from '../routing'

describe('getDefaultRouteForRole', () => {
  it('sends kitchen to /kitchen', () => {
    expect(getDefaultRouteForRole('kitchen')).toBe('/kitchen')
  })

  it('sends register to /register', () => {
    expect(getDefaultRouteForRole('register')).toBe('/register')
  })

  it('sends foh to /dat-mon, not /kho — foh has no sidebar access to inventory', () => {
    expect(getDefaultRouteForRole('foh')).toBe('/dat-mon')
  })

  it('sends manager to /kho', () => {
    expect(getDefaultRouteForRole('manager')).toBe('/kho')
  })

  it('sends owner to /kho', () => {
    expect(getDefaultRouteForRole('owner')).toBe('/kho')
  })
})
