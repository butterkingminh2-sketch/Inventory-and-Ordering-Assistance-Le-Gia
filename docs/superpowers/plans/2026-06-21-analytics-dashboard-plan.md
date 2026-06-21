# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manager/owner-only `/analytics` page showing top-selling dishes (by quantity and revenue) and a restock-urgency projection (days-remaining at current consumption rate), with a quick "Nhắn bếp" action that opens chat pre-filled with a draft message.

**Architecture:** All metrics derive from existing tables (`orders`/`order_items`/`recipe_lines`/`items`) via new pure aggregation functions in `lib/analytics.ts`, reusing `lib/stock.ts`'s existing `calculateDecrements` (called with `reversal = true` to get positive consumption amounts) and `lib/chat.ts`'s existing 6 AM day-boundary so "today" means the same thing here as it does for the chat reset.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-21-analytics-dashboard-design.md` — read this for full rationale; this plan only implements it.

**Clarification resolved while planning, beyond the spec's literal text:** the owner role can view `/analytics` (per spec) but only ever has access to the private owner-channel chat, never the public channel "Nhắn bếp" needs to post to — owner is "not on anyone's shift" (per the chat sub-project's own design). So the "Nhắn bếp" button is gated to the **manager** role specifically, not just "whoever's viewing the page." This means the page needs its own viewer-role lookup (a small `supabase.auth.getUser()` + `user_profiles` query on mount, mirroring how other pages already fetch role-adjacent info) rather than assuming the page is always viewed by a manager — `BranchContext` only exposes `branchId`, not the viewer's role, and this plan deliberately avoids touching `app-shell.tsx`/`BranchContext` to add one, since a page-local fetch is just as correct and carries zero risk to the already-working shared shell.

---

### Task 1: Analytics aggregation functions (TDD)

**Files:**
- Create: `lib/analytics.ts`
- Create: `lib/__tests__/analytics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/analytics.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getDateRangeStart, rankByQuantity, rankByRevenue, getDaysRemaining, getRestockAlerts } from '../analytics'
import { getPublicChannelCutoff } from '../chat'
import type { Dish, Item } from '../types'

const baseDish = { branch_id: '', name_en: null, category: null, image_url: null, is_topping: false, is_active: true, created_at: '' }
const bunRieuBo: Dish = { ...baseDish, id: 'dish-bun-rieu-bo', name_vi: 'Bún riêu bò', price: 60000 }
const mocThem: Dish = { ...baseDish, id: 'dish-moc-them', name_vi: 'Mọc thêm', price: 8000 }
const dishes = [bunRieuBo, mocThem]

const baseItem = { branch_id: '', name_en: null, is_active: true, created_at: '' }
const bunTuoi: Item = { ...baseItem, id: 'item-bun-tuoi', name_vi: 'Bún tươi', unit: 'g', quantity: 7500, low_threshold: 5000 }
const moc: Item = { ...baseItem, id: 'item-moc', name_vi: 'Mọc', unit: 'viên', quantity: 8, low_threshold: 10 }

describe('getDateRangeStart', () => {
  it('"today" matches the same 6 AM cutoff chat already uses', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0)
    expect(getDateRangeStart(now, 'today')).toEqual(getPublicChannelCutoff(now))
  })

  it('"7d" is the today-cutoff minus 7 days', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0)
    const expected = new Date(getPublicChannelCutoff(now))
    expected.setDate(expected.getDate() - 7)
    expect(getDateRangeStart(now, '7d')).toEqual(expected)
  })

  it('"30d" is the today-cutoff minus 30 days', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0)
    const expected = new Date(getPublicChannelCutoff(now))
    expected.setDate(expected.getDate() - 30)
    expect(getDateRangeStart(now, '30d')).toEqual(expected)
  })
})

describe('rankByQuantity', () => {
  it('aggregates multiple order lines for the same dish and sorts descending', () => {
    const orderLines = [
      { dish_id: 'dish-bun-rieu-bo', qty: 2 },
      { dish_id: 'dish-moc-them', qty: 10 },
      { dish_id: 'dish-bun-rieu-bo', qty: 3 },
    ]
    const result = rankByQuantity(orderLines, dishes, 5)
    expect(result).toEqual([
      { dish: mocThem, qty: 10 },
      { dish: bunRieuBo, qty: 5 },
    ])
  })

  it('truncates to the given limit', () => {
    const orderLines = [{ dish_id: 'dish-bun-rieu-bo', qty: 5 }, { dish_id: 'dish-moc-them', qty: 10 }]
    expect(rankByQuantity(orderLines, dishes, 1)).toEqual([{ dish: mocThem, qty: 10 }])
  })

  it('skips a dish_id with no matching dish', () => {
    const orderLines = [{ dish_id: 'dish-deleted', qty: 99 }, { dish_id: 'dish-moc-them', qty: 1 }]
    expect(rankByQuantity(orderLines, dishes, 5)).toEqual([{ dish: mocThem, qty: 1 }])
  })
})

describe('rankByRevenue', () => {
  it('sums qty × price_at_order per dish and sorts descending', () => {
    const orderLines = [
      { dish_id: 'dish-bun-rieu-bo', qty: 2, price_at_order: 60000 },
      { dish_id: 'dish-moc-them', qty: 10, price_at_order: 8000 },
    ]
    expect(rankByRevenue(orderLines, dishes, 5)).toEqual([
      { dish: bunRieuBo, revenue: 120000 },
      { dish: mocThem, revenue: 80000 },
    ])
  })
})

describe('getDaysRemaining', () => {
  it('returns null when nothing was consumed in the range', () => {
    expect(getDaysRemaining(0, 7, 7500)).toBeNull()
  })

  it('computes current stock divided by the daily rate', () => {
    // consumed 1050 over 7 days = 150/day; 7500 stock / 150 = 50 days
    expect(getDaysRemaining(1050, 7, 7500)).toBe(50)
  })
})

describe('getRestockAlerts', () => {
  it('includes only items under the urgency threshold, most urgent first', () => {
    const items = [bunTuoi, moc]
    // bunTuoi: 7500 stock, consumed 7500 over 1 day -> 1 day remaining (urgent)
    // moc: 8 stock, consumed 1 over 1 day -> 8 days remaining (not urgent)
    const consumptionByItemId = { 'item-bun-tuoi': 7500, 'item-moc': 1 }
    const alerts = getRestockAlerts(items, consumptionByItemId, 1, 3)
    expect(alerts).toEqual([{ item: bunTuoi, daysRemaining: 1 }])
  })

  it('excludes items with zero consumption even if stock is critically low', () => {
    const items = [moc]
    const alerts = getRestockAlerts(items, {}, 1, 3)
    expect(alerts).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run`
Expected: FAIL — "Cannot find module '../analytics'"

- [ ] **Step 3: Write `lib/analytics.ts`**

```ts
import { getPublicChannelCutoff } from './chat'
import { num } from './types'
import type { Dish, Item } from './types'

export type DateRangePreset = 'today' | '7d' | '30d'

/**
 * Pure function — no DB calls. Start boundary for the preset, anchored to the
 * same 6 AM operational-day cutoff lib/chat.ts already uses for the public
 * chat reset — "today" must mean the same thing in both places.
 */
export function getDateRangeStart(now: Date, preset: DateRangePreset): Date {
  const todayCutoff = getPublicChannelCutoff(now)
  if (preset === 'today') return todayCutoff
  const daysBack = preset === '7d' ? 7 : 30
  const start = new Date(todayCutoff)
  start.setDate(start.getDate() - daysBack)
  return start
}

export interface DishRanking {
  dish: Dish
  qty: number
}

/** Pure function — no DB calls. Aggregates order lines by dish, sorts by qty descending, truncates to limit. */
export function rankByQuantity(
  orderLines: Array<{ dish_id: string; qty: number }>,
  dishes: Dish[],
  limit: number,
): DishRanking[] {
  const totals: Record<string, number> = {}
  for (const { dish_id, qty } of orderLines) {
    totals[dish_id] = (totals[dish_id] ?? 0) + qty
  }
  const dishMap = new Map(dishes.map(d => [d.id, d]))
  const ranked: DishRanking[] = []
  for (const [dish_id, qty] of Object.entries(totals)) {
    const dish = dishMap.get(dish_id)
    if (dish) ranked.push({ dish, qty })
  }
  return ranked.sort((a, b) => b.qty - a.qty).slice(0, limit)
}

export interface DishRevenue {
  dish: Dish
  revenue: number
}

/** Pure function — no DB calls. Sums qty × price_at_order per dish, sorts by revenue descending, truncates to limit. */
export function rankByRevenue(
  orderLines: Array<{ dish_id: string; qty: number; price_at_order: number | string }>,
  dishes: Dish[],
  limit: number,
): DishRevenue[] {
  const totals: Record<string, number> = {}
  for (const { dish_id, qty, price_at_order } of orderLines) {
    totals[dish_id] = (totals[dish_id] ?? 0) + qty * num(price_at_order)
  }
  const dishMap = new Map(dishes.map(d => [d.id, d]))
  const ranked: DishRevenue[] = []
  for (const [dish_id, revenue] of Object.entries(totals)) {
    const dish = dishMap.get(dish_id)
    if (dish) ranked.push({ dish, revenue })
  }
  return ranked.sort((a, b) => b.revenue - a.revenue).slice(0, limit)
}

/**
 * Pure function — no DB calls. Days of stock remaining at the current
 * consumption rate. Returns null when nothing was consumed in the range —
 * there's no rate to project from, not a divide-by-zero to paper over.
 */
export function getDaysRemaining(consumedInRange: number, daysInRange: number, currentStock: number): number | null {
  if (consumedInRange <= 0) return null
  const dailyRate = consumedInRange / daysInRange
  return currentStock / dailyRate
}

export interface RestockAlert {
  item: Item
  daysRemaining: number
}

/** Pure function — no DB calls. Items whose days-remaining is under the threshold, most urgent first. */
export function getRestockAlerts(
  items: Item[],
  consumptionByItemId: Record<string, number>,
  daysInRange: number,
  urgencyThresholdDays: number,
): RestockAlert[] {
  const alerts: RestockAlert[] = []
  for (const item of items) {
    const consumed = consumptionByItemId[item.id] ?? 0
    const daysRemaining = getDaysRemaining(consumed, daysInRange, num(item.quantity))
    if (daysRemaining !== null && daysRemaining < urgencyThresholdDays) {
      alerts.push({ item, daysRemaining })
    }
  }
  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: All new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics.ts lib/__tests__/analytics.test.ts
git commit -m "feat: add analytics aggregation functions for dashboard"
```

---

### Task 2: ChatPanel `initialText` prop

**Files:**
- Modify: `components/chat-panel.tsx`

This is a new *optional* prop — existing callers (`ChatTrigger`) don't need to change, since omitting an optional prop is always valid.

- [ ] **Step 1: Add the prop**

Find:
```tsx
interface Props {
  role: UserRole
  branchId: string
  onClose: () => void
}

export function ChatPanel({ role, branchId, onClose }: Props) {
  const [channel, setChannel] = useState<Channel>(role === 'owner' ? 'owner' : 'public')
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [text, setText] = useState('')
```
Replace with:
```tsx
interface Props {
  role: UserRole
  branchId: string
  onClose: () => void
  initialText?: string
}

export function ChatPanel({ role, branchId, onClose, initialText }: Props) {
  const [channel, setChannel] = useState<Channel>(role === 'owner' ? 'owner' : 'public')
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [text, setText] = useState(initialText ?? '')
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds — `ChatTrigger`'s existing call (`<ChatPanel role={role} branchId={branchId} onClose={...} />`) remains valid since `initialText` is optional.

- [ ] **Step 3: Commit**

```bash
git add components/chat-panel.tsx
git commit -m "feat: add initialText prop to ChatPanel for pre-filled drafts"
```

---

### Task 3: Analytics page

**Files:**
- Create: `app/(app)/analytics/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BranchContext } from '../app-shell'
import { calculateDecrements } from '@/lib/stock'
import { getDateRangeStart, rankByQuantity, rankByRevenue, getRestockAlerts } from '@/lib/analytics'
import type { RestockAlert } from '@/lib/analytics'
import { ChatPanel } from '@/components/chat-panel'
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine, UserRole } from '@/lib/types'

type Preset = 'today' | '7d' | '30d'

const PRESET_LABELS: Record<Preset, string> = {
  today: 'Hôm nay',
  '7d': '7 ngày',
  '30d': '30 ngày',
}

const URGENCY_THRESHOLD_DAYS = 3
const TOP_N = 5

export default function AnalyticsPage() {
  const { branchId } = useContext(BranchContext)
  const [preset, setPreset] = useState<Preset>('today')
  const [orderLines, setOrderLines] = useState<Array<{ dish_id: string; qty: number; price_at_order: number | string }>>([])
  const [dishes, setDishes] = useState<Dish[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [recipes, setRecipes] = useState<RecipeLine[]>([])
  const [role, setRole] = useState<UserRole | null>(null)
  const [chatDraft, setChatDraft] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
      if (profile) setRole(profile.role)
    })
  }, [])

  useEffect(() => {
    async function load() {
      const rangeStart = getDateRangeStart(new Date(), preset)
      const [ordersRes, dishesRes, itemsRes, recipesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_items(dish_id, qty, price_at_order)')
          .eq('branch_id', branchId)
          .neq('status', 'cancelled')
          .gte('created_at', rangeStart.toISOString()),
        supabase.from('dishes').select('*').eq('branch_id', branchId),
        supabase.from('items').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('recipe_lines').select('*'),
      ])
      if (ordersRes.data) setOrderLines(ordersRes.data.flatMap(o => o.order_items))
      if (dishesRes.data) setDishes(dishesRes.data)
      if (itemsRes.data) setItems(itemsRes.data)
      if (recipesRes.data) setRecipes(recipesRes.data)
    }
    load()
  }, [branchId, preset])

  const rangeStart = getDateRangeStart(new Date(), preset)
  const daysInRange = (Date.now() - rangeStart.getTime()) / 86_400_000

  const topByQty = rankByQuantity(orderLines, dishes, TOP_N)
  const topByRevenue = rankByRevenue(orderLines, dishes, TOP_N)

  const consumption = calculateDecrements(orderLines, recipes, true)
  const consumptionByItemId: Record<string, number> = {}
  for (const c of consumption) consumptionByItemId[c.item_id] = c.delta

  const alerts = getRestockAlerts(items, consumptionByItemId, daysInRange, URGENCY_THRESHOLD_DAYS)

  function handleNhanBep(alert: RestockAlert) {
    setChatDraft(`${alert.item.name_vi} sẽ hết trong ~${alert.daysRemaining.toFixed(1)} ngày`)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">Thống kê</h2>

      <div className="flex gap-2 mb-stack-lg">
        {(['today', '7d', '30d'] as Preset[]).map(p => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-4 rounded-full text-label-vi font-bold min-h-touch-target-min transition-colors ${
              preset === p ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border-2 border-error bg-error-container/20 p-stack-lg mb-stack-lg">
          <p className="text-label-vi font-bold text-error mb-stack-md flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>warning</span>
            Cần nhập hàng sớm
          </p>
          <ul className="space-y-2">
            {alerts.map(a => (
              <li key={a.item.id} className="flex items-center justify-between gap-2">
                <span className="text-label-vi text-on-surface">
                  {a.item.name_vi} — còn ~{a.daysRemaining.toFixed(1)} ngày
                </span>
                {role === 'manager' && (
                  <button onClick={() => handleNhanBep(a)} className="text-label-en font-bold text-error shrink-0">
                    Nhắn bếp
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-lg">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <p className="text-label-vi font-bold text-on-surface mb-stack-md">Bán chạy (số lượng)</p>
          {topByQty.length === 0 ? (
            <p className="text-label-en text-on-surface-variant">Chưa có đơn nào</p>
          ) : (
            <ul className="space-y-1">
              {topByQty.map(r => (
                <li key={r.dish.id} className="flex justify-between text-label-vi text-on-surface">
                  <span>{r.dish.name_vi}</span>
                  <span className="font-bold text-primary">{r.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg">
          <p className="text-label-vi font-bold text-on-surface mb-stack-md">Bán chạy (doanh thu)</p>
          {topByRevenue.length === 0 ? (
            <p className="text-label-en text-on-surface-variant">Chưa có đơn nào</p>
          ) : (
            <ul className="space-y-1">
              {topByRevenue.map(r => (
                <li key={r.dish.id} className="flex justify-between text-label-vi text-on-surface">
                  <span>{r.dish.name_vi}</span>
                  <span className="font-bold text-primary">{r.revenue.toLocaleString('vi-VN')}đ</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {chatDraft !== null && role === 'manager' && (
        <ChatPanel role={role} branchId={branchId} initialText={chatDraft} onClose={() => setChatDraft(null)} />
      )}
    </div>
  )
}
```

Note: `role === 'manager'` gates BOTH the "Nhắn bếp" button's visibility AND the `ChatPanel` mount condition — an owner viewing this page sees restock alerts with no message-kitchen action available, consistent with their existing chat scope (owner only ever has the private owner-channel, never the public channel "Nhắn bếp" needs).

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3 (manual smoke test):** This requires a live login session — skip it, note it's pending for the human user.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/analytics/page.tsx
git commit -m "feat: add analytics dashboard page"
```

---

### Task 4: Manager + owner nav entry

**Files:**
- Modify: `components/sidebar-nav.tsx`
- Modify: `components/bottom-nav.tsx`

- [ ] **Step 1: Update `components/sidebar-nav.tsx`**

Find:
```tsx
  if (role === 'manager') {
    tabs.push({ href: '/register', labelVi: 'Thu ngân', labelEn: 'Register', icon: 'point_of_sale' })
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }
```
Replace with:
```tsx
  if (role === 'manager') {
    tabs.push({ href: '/register', labelVi: 'Thu ngân', labelEn: 'Register', icon: 'point_of_sale' })
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }

  if (role === 'manager' || role === 'owner') {
    tabs.push({ href: '/analytics', labelVi: 'Thống kê', labelEn: 'Analytics', icon: 'bar_chart' })
  }
```

- [ ] **Step 2: Update `components/bottom-nav.tsx`**

Find:
```tsx
  const tabs = [
    ...(role === 'foh' ? [] : [{ href: '/kho', labelVi: 'Kho', icon: 'inventory_2' }]),
    { href: '/dat-mon',   labelVi: 'Đặt món',   icon: 'add_shopping_cart' },
    { href: '/dang-chay', labelVi: 'Đang chạy', icon: 'receipt_long', badge: readyCount },
    ...(role === 'manager' ? [{ href: '/settings', labelVi: 'Cài đặt', icon: 'settings' }] : []),
  ]
```
Replace with:
```tsx
  const tabs = [
    ...(role === 'foh' ? [] : [{ href: '/kho', labelVi: 'Kho', icon: 'inventory_2' }]),
    { href: '/dat-mon',   labelVi: 'Đặt món',   icon: 'add_shopping_cart' },
    { href: '/dang-chay', labelVi: 'Đang chạy', icon: 'receipt_long', badge: readyCount },
    ...(role === 'manager' ? [{ href: '/settings', labelVi: 'Cài đặt', icon: 'settings' }] : []),
    ...(role === 'manager' || role === 'owner' ? [{ href: '/analytics', labelVi: 'Thống kê', icon: 'bar_chart' }] : []),
  ]
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add components/sidebar-nav.tsx components/bottom-nav.tsx
git commit -m "feat: add Thống kê nav entry for manager and owner roles"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

```bash
npm run test:run
npm run lint
npm run build
```
Expected: all tests pass (new tests from Task 1), lint shows no new errors, build succeeds.

- [ ] **Step 2: Full manual pass**

As manager: open Thống kê, switch between the three date-range presets, confirm the two top-5 lists and restock alerts look reasonable given recent order activity. Tap "Nhắn bếp" on an alert, confirm chat opens pre-filled with the expected draft text, edit it, send it, confirm it lands in the public channel.

As owner: confirm Thống kê is reachable and shows the same data for their selected branch, but confirm NO "Nhắn bếp" button appears on any restock alert.

As FOH/kitchen/register: confirm Thống kê does not appear in their nav at all.
