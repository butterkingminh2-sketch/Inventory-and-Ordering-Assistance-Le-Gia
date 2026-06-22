import type { UserRole } from './types'

/** Pure function — no DB calls. Where a role lands after login or at the bare "/" route. */
export function getDefaultRouteForRole(role: UserRole): string {
  if (role === 'kitchen') return '/kitchen'
  if (role === 'register') return '/register'
  // FOH has no sidebar link to Kho — their job is taking orders, not
  // browsing inventory, so /kho would be a dead end with no way back in.
  if (role === 'foh') return '/dat-mon'
  return '/kho'
}
