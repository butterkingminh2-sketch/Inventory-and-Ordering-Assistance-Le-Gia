# Re-order Shortcut + Kitchen Order Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+ Thêm món" shortcut on Đang chạy's order cards that jumps into Đặt món pre-selected for that table (skipping the table-picker step), and visually group a table's simultaneously-`pending` kitchen tickets so an add-on placed while the original is still cooking reads as connected rather than as an unrelated duplicate.

**Architecture:** Navigation carries the selected table via a URL query param (`/dat-mon?table=<id>`) — no new Context or storage. A new pure function, `groupAdjacentByTable`, reorders the kitchen's already-fetched order list so same-table orders become contiguous (anchored at the group's oldest member), and the kitchen page renders an order as a connected, tagged "ĐƠN MỚI" card whenever the previous order in that reordered list shares its table — each card stays independently tappable/completable.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Realtime, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-20-reorder-shortcut-design.md` — read this for full rationale; this plan only implements it.

---

### Task 1: Order grouping logic (TDD)

**Files:**
- Create: `lib/order-grouping.ts`
- Create: `lib/__tests__/order-grouping.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/order-grouping.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupAdjacentByTable } from '../order-grouping'
import type { OrderWithDetails } from '../types'

const baseOrder = {
  branch_id: 'branch-1',
  created_by: null,
  ready_at: null,
  paid_at: null,
  status: 'pending' as const,
  order_items: [],
  table: { label: 'Bàn 1' },
}

describe('groupAdjacentByTable', () => {
  it('keeps orders for distinct tables in their original order when none repeat', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: 'table-1', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: 'table-2', created_at: '2026-06-20T10:01:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    expect(result.map(o => o.id)).toEqual(['o1', 'o2'])
  })

  it('makes two orders for the same table adjacent, anchored at the first occurrence', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: 'table-1', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: 'table-2', created_at: '2026-06-20T10:01:00Z' },
      { ...baseOrder, id: 'o3', table_id: 'table-1', created_at: '2026-06-20T10:02:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    // o3 (table-1, newer) moves to sit right after o1 (table-1, older),
    // rather than staying at its natural created_at position after o2.
    expect(result.map(o => o.id)).toEqual(['o1', 'o3', 'o2'])
  })

  it('keeps two independent multi-order tables correctly separated when interleaved', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'a1', table_id: 'table-a', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'b1', table_id: 'table-b', created_at: '2026-06-20T10:01:00Z' },
      { ...baseOrder, id: 'a2', table_id: 'table-a', created_at: '2026-06-20T10:02:00Z' },
      { ...baseOrder, id: 'b2', table_id: 'table-b', created_at: '2026-06-20T10:03:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    // table-a's group anchors at a1 (the overall oldest order), ahead of table-b's group.
    expect(result.map(o => o.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('keeps three or more orders for one table all contiguous', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: 'table-1', created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: 'table-2', created_at: '2026-06-20T10:01:00Z' },
      { ...baseOrder, id: 'o3', table_id: 'table-1', created_at: '2026-06-20T10:02:00Z' },
      { ...baseOrder, id: 'o4', table_id: 'table-1', created_at: '2026-06-20T10:03:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    expect(result.map(o => o.id)).toEqual(['o1', 'o3', 'o4', 'o2'])
  })

  it('never groups orders with a null table_id together', () => {
    const orders: OrderWithDetails[] = [
      { ...baseOrder, id: 'o1', table_id: null, created_at: '2026-06-20T10:00:00Z' },
      { ...baseOrder, id: 'o2', table_id: null, created_at: '2026-06-20T10:01:00Z' },
    ]
    const result = groupAdjacentByTable(orders)
    expect(result.map(o => o.id)).toEqual(['o1', 'o2'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run`
Expected: FAIL — "Cannot find module '../order-grouping'"

- [ ] **Step 3: Write `lib/order-grouping.ts`**

```ts
import type { OrderWithDetails } from './types'

/**
 * Pure function — no DB calls. Reorders an already created_at-ascending list so
 * orders sharing a table_id become contiguous. Each group's position in the
 * output is anchored to its oldest member's original position, so grouping
 * never changes a table's overall queue/urgency position. Orders with a null
 * table_id are never grouped with anything.
 */
export function groupAdjacentByTable(orders: OrderWithDetails[]): OrderWithDetails[] {
  const result: OrderWithDetails[] = []
  const lastIndexForTable = new Map<string, number>()

  for (const order of orders) {
    const tableId = order.table_id
    if (tableId !== null && lastIndexForTable.has(tableId)) {
      const insertAt = lastIndexForTable.get(tableId)! + 1
      result.splice(insertAt, 0, order)
      for (const [tid, idx] of lastIndexForTable) {
        if (idx >= insertAt) lastIndexForTable.set(tid, idx + 1)
      }
      lastIndexForTable.set(tableId, insertAt)
    } else {
      result.push(order)
      if (tableId !== null) lastIndexForTable.set(tableId, result.length - 1)
    }
  }

  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: All 5 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/order-grouping.ts lib/__tests__/order-grouping.test.ts
git commit -m "feat: add pure function to group adjacent same-table kitchen orders"
```

---

### Task 2: Add the re-order button and wire its navigation

**Files:**
- Modify: `components/order-card.tsx`
- Modify: `app/(app)/dang-chay/page.tsx`

Both files are modified in this one task, not split across two — `OrderCard` is already consumed by `dang-chay/page.tsx`, so adding a new *required* prop to it would leave the build broken until the caller is updated to pass that prop. Doing both edits together keeps every commit green.

- [ ] **Step 1: Add the `onReorder` prop to OrderCard**

Find:
```tsx
interface Props {
  order: OrderWithDetails
  onCancel: (orderId: string) => void
  onDeliver: (orderId: string) => void
}

export function OrderCard({ order, onCancel, onDeliver }: Props) {
```
Replace with:
```tsx
interface Props {
  order: OrderWithDetails
  onCancel: (orderId: string) => void
  onDeliver: (orderId: string) => void
  onReorder: (tableId: string) => void
}

export function OrderCard({ order, onCancel, onDeliver, onReorder }: Props) {
```

- [ ] **Step 2: Add the button to OrderCard**

Find:
```tsx
      {/* Right: action buttons */}
      <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-outline-variant">
        <button
          onClick={() => onCancel(order.id)}
```
Replace with:
```tsx
      {/* Right: action buttons */}
      <div className="flex md:flex-col border-t md:border-t-0 md:border-l border-outline-variant">
        <button
          onClick={() => onReorder(order.table_id!)}
          className="flex-1 min-h-touch-target-min px-stack-lg flex flex-col items-center justify-center gap-1 text-primary hover:bg-primary-fixed transition-colors"
          aria-label="Thêm món"
        >
          <span className="material-symbols-outlined text-[24px]" aria-hidden>add_circle</span>
          <span className="text-label-en font-bold">Thêm món</span>
        </button>

        <button
          onClick={() => onCancel(order.id)}
```

Note: `order.table_id!` — every order shown here was created with a required table selection in Đặt món, so `table_id` is never actually null in practice for an order that reaches this screen, even though its type is `string | null`. This matches the existing non-null-assertion convention already used elsewhere in this codebase for the same reason (e.g. `dishes.find(d => d.id === l.dish_id)!` in `app/(app)/dat-mon/page.tsx`).

- [ ] **Step 3: Import `useRouter` and create the handler in Đang chạy**

Find:
```tsx
import { useEffect, useState, useContext, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OrderCard } from '@/components/order-card'
import { BranchContext } from '../app-shell'
import { reverseOrderStock } from '@/lib/stock'
import type { OrderWithDetails } from '@/lib/types'

export default function DangChayPage() {
  const { branchId } = useContext(BranchContext)
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const supabase = createClient()
```
Replace with:
```tsx
import { useEffect, useState, useContext, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { OrderCard } from '@/components/order-card'
import { BranchContext } from '../app-shell'
import { reverseOrderStock } from '@/lib/stock'
import type { OrderWithDetails } from '@/lib/types'

export default function DangChayPage() {
  const { branchId } = useContext(BranchContext)
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const router = useRouter()
  const supabase = createClient()
```

- [ ] **Step 4: Add `handleReorder` in Đang chạy**

Find:
```tsx
  async function handleDeliver(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    if (!order || order.status !== 'ready') return
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
  }
```
Replace with:
```tsx
  async function handleDeliver(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    if (!order || order.status !== 'ready') return
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
  }

  function handleReorder(tableId: string) {
    router.push(`/dat-mon?table=${tableId}`)
  }
```

- [ ] **Step 5: Pass the new prop to `OrderCard`**

Find:
```tsx
        <OrderCard
          key={order.id}
          order={order}
          onCancel={handleCancel}
          onDeliver={handleDeliver}
        />
```
Replace with:
```tsx
        <OrderCard
          key={order.id}
          order={order}
          onCancel={handleCancel}
          onDeliver={handleDeliver}
          onReorder={handleReorder}
        />
```

- [ ] **Step 6: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add components/order-card.tsx app/\(app\)/dang-chay/page.tsx
git commit -m "feat: add Thêm món button and wire its navigation"
```

---

### Task 3: Pre-select the table in Đặt món from the URL

**Files:**
- Modify: `app/(app)/dat-mon/page.tsx`

- [ ] **Step 1: Import `useSearchParams`**

Find:
```tsx
import { useEffect, useState, useContext } from 'react'
import { useRouter } from 'next/navigation'
```
Replace with:
```tsx
import { useEffect, useState, useContext } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
```

- [ ] **Step 2: Read the param and use it**

Find:
```tsx
export default function DatMonPage() {
  const { branchId } = useContext(BranchContext)
  const router = useRouter()
  const supabase = createClient()
```
Replace with:
```tsx
export default function DatMonPage() {
  const { branchId } = useContext(BranchContext)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
```

Find:
```tsx
      if (t.data) {
        setTables(t.data)
        const secs = [...new Set(t.data.map(tbl => tbl.section).filter((s): s is string => s !== null))]
        setSelectedSection(secs.length > 1 ? secs[0] : null)
      }
```
Replace with:
```tsx
      if (t.data) {
        setTables(t.data)
        const secs = [...new Set(t.data.map(tbl => tbl.section).filter((s): s is string => s !== null))]
        setSelectedSection(secs.length > 1 ? secs[0] : null)

        const tableParam = searchParams.get('table')
        if (tableParam && t.data.some(tbl => tbl.id === tableParam)) {
          setSelectedTable(tableParam)
          setStep('dishes')
          // Clean the one-time navigation param out of the URL so a later
          // refresh or back/forward navigation doesn't re-trigger the jump.
          router.replace('/dat-mon')
        }
      }
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4 (manual smoke test):** This requires a live login session and isn't available to you as a subagent — skip it, note it's pending for the human user.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/dat-mon/page.tsx
git commit -m "feat: pre-select table in Đặt món from the table search param"
```

---

### Task 4: Group same-table orders in the kitchen queue

**Files:**
- Modify: `app/kitchen/page.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `app/kitchen/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { elapsedLabel } from '@/lib/order-urgency'
import { groupAdjacentByTable } from '@/lib/order-grouping'
import type { OrderWithDetails } from '@/lib/types'

export default function KitchenPage() {
  const [orders, setOrders]   = useState<OrderWithDetails[]>([])
  const [branchId, setBranchId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('user_profiles').select('branch_id').eq('id', user.id).single()
      if (profile) setBranchId(profile.branch_id)
    }
    init()
  }, [])

  const loadOrders = async (bid: string) => {
    const { data } = await supabase
      .from('orders')
      .select(`*, table:tables(label), order_items(*, dish:dishes(name_vi, name_en))`)
      .eq('branch_id', bid)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (data) setOrders(data as OrderWithDetails[])
  }

  useEffect(() => {
    if (!branchId) return
    // Initial fetch on mount/branch change — async, not a synchronous setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders(branchId)

    const channel = supabase
      .channel(`kitchen-orders-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => loadOrders(branchId),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  async function handleXong(orderId: string) {
    await supabase
      .from('orders')
      .update({ status: 'ready', ready_at: new Date().toISOString() })
      .eq('id', orderId)
  }

  if (orders.length === 0) {
    return (
      <p className="text-on-surface-variant text-center mt-16 text-label-vi">
        Không có đơn nào — Bếp rảnh 🎉
      </p>
    )
  }

  const grouped = groupAdjacentByTable(orders)

  return (
    <div className="max-w-2xl mx-auto">
      {grouped.map((order, i) => {
        const isAddOn = i > 0 && grouped[i - 1].table_id === order.table_id
        const isLastOfGroup = i === grouped.length - 1 || grouped[i + 1].table_id !== order.table_id

        const roundingCls =
          !isAddOn && isLastOfGroup ? 'rounded-xl' :
          !isAddOn ? 'rounded-t-xl' :
          isLastOfGroup ? 'rounded-b-xl' :
          ''
        const marginCls = i === 0 ? '' : isAddOn ? 'mt-0' : 'mt-stack-lg'

        return (
          <div
            key={order.id}
            role="button"
            tabIndex={0}
            aria-label={`Đánh dấu xong — ${order.table.label}`}
            onClick={() => handleXong(order.id)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleXong(order.id) }
            }}
            className={`border overflow-hidden shadow-sm cursor-pointer select-none active:scale-[0.98] transition-transform bg-surface-container-lowest ${roundingCls} ${marginCls} ${
              isAddOn ? 'border-primary' : 'border-outline-variant'
            }`}
          >
            {isAddOn && (
              <div className="px-stack-lg pt-stack-md">
                <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                  + Đơn mới
                </span>
              </div>
            )}

            <div className="p-stack-lg space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-headline-md font-bold text-on-surface">{order.table.label}</p>
                <p className="text-label-en text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]" aria-hidden>schedule</span>
                  {elapsedLabel(order.created_at)}
                </p>
              </div>

              <ul className="space-y-1 pt-1">
                {order.order_items.map(oi => (
                  <li key={oi.id} className="flex justify-between text-body-lg font-medium text-on-surface">
                    <span>{oi.dish.name_vi}</span>
                    <span className="font-black text-primary">×{oi.qty}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="w-full min-h-touch-target-min bg-secondary text-on-secondary text-label-vi font-bold flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[24px]" aria-hidden>check_circle</span>
              Xong ✓ — chạm bất kỳ đâu trên thẻ
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

Note: the parent wrapper changed from `<div className="space-y-stack-lg max-w-2xl mx-auto">` to `<div className="max-w-2xl mx-auto">` — `space-y-stack-lg` applied a uniform top margin to every card via a sibling selector, which would have fought with the new per-card `marginCls` (zero margin for add-on cards). Spacing is now controlled entirely per-card instead.

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm run test:run`
Expected: all tests pass, including the 5 new ones from Task 1 — this page change doesn't touch any tested logic itself, but confirms nothing else broke.

- [ ] **Step 4 (manual smoke test):** This requires a live login session and isn't available to you as a subagent — skip it, note it's pending for the human user.

- [ ] **Step 5: Commit**

```bash
git add app/kitchen/page.tsx
git commit -m "feat: visually group simultaneously-pending same-table kitchen orders"
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
Expected: all tests pass (5 new from Task 1, rest unchanged), lint shows no new errors, build succeeds.

- [ ] **Step 2: Full manual pass**

As FOH: place an order for a table in Đặt món, then from Đang chạy tap "Thêm món" on that table's card — confirm it lands directly on the dish-picker step with that table already selected (no table-picker step shown), and that submitting creates a genuinely separate new order (check Supabase `orders` table — two rows for the same `table_id`).

As kitchen: with both of that table's orders still `pending`, confirm they render as two stacked cards with no gap, square touching corners, and the second tagged "+ Đơn mới" with an accent border. Tap "Xong" on just the add-on card and confirm only that one disappears from the queue (the original stays, now rendering as a normal standalone card again). Confirm a table with only one order still renders exactly as it did before this plan (full rounding, normal spacing, no tag).

---

## Self-Review Checklist (spec vs plan)

| Spec requirement | Covered by |
|---|---|
| "+ Thêm món" always visible, every card, no per-table dedup | Task 2 |
| URL query param navigation, no Context/storage | Tasks 2, 3 |
| Skip straight to dish-picker step | Task 3 |
| New order row (not mutating an existing order) | Unchanged — `handleSubmit` in `dat-mon/page.tsx` already always inserts a new `orders` row; this plan never touches that logic |
| Kitchen-only grouping; Đang chạy unaffected | Task 4 (Đang chạy untouched beyond the new button/handler in Task 2) |
| Two full stacked cards, not one merged card | Task 4 |
| Each card independently tappable/completable | Task 4 (`handleXong(order.id)` per card, unchanged) |
| Grouping only matters while both orders share `pending` status | Task 4 (kitchen query already filters `status = 'pending'`; unaffected by this plan) |
| `groupAdjacentByTable` pure function, unit-tested | Task 1 |
