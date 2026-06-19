# Register Role + Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth "register" (cashier) role that tallies a table's running food total and produces a printable receipt with a VietQR payment code.

**Architecture:** A new `/register` route (standalone layout, no sidebar, same pattern as the existing `/kitchen`) is gated to `register`/`manager` roles. It computes per-table bills client-side from existing `orders`/`order_items` data (no new tables), snapshots dish prices onto `order_items` at order time so historical bills never drift, and marks a table's orders paid in one bulk update. The VietQR code is a plain `<img>` pointing at the public `img.vietqr.io` quick-link endpoint — no backend integration code needed.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Realtime), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-19-register-role-billing-design.md` — read this for full rationale; this plan only implements it.

**Note on design tokens:** `/docs/DESIGN.md` only documents the original Inventory Dashboard and Order-Ready Notification screens. Every screen built since (Đặt món, Đang chạy, Kitchen, Settings) has reused the same color/spacing/typography tokens from that file rather than fetching a new Stitch design per screen. This plan follows that established precedent for the register screen and receipt — no new Stitch screen is fetched.

---

### Task 1: Database migration + TypeScript types

**Files:**
- Create: `supabase/migrations/004_register_billing.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/004_register_billing.sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS price numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_at_order numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('foh', 'kitchen', 'manager', 'register'));
```

- [ ] **Step 2: Run it in Supabase**

Open the Supabase Dashboard → SQL Editor, paste the contents of `004_register_billing.sql`, and run it. Verify in Table Editor: `dishes` has a `price` column, `order_items` has `price_at_order`, `orders` has `paid_at`.

- [ ] **Step 3: Update `lib/types.ts`**

Change the `UserRole` line near the top:

```ts
export type UserRole = 'foh' | 'kitchen' | 'manager' | 'register'
```

Add `price` to the `Dish` interface:

```ts
export interface Dish {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  price: number | string
  is_active: boolean
  created_at: string
}
```

Add `price_at_order` to the `OrderItem` interface:

```ts
export interface OrderItem {
  id: string
  order_id: string
  dish_id: string
  qty: number
  price_at_order: number | string
}
```

Add `paid_at` to the `Order` interface:

```ts
export interface Order {
  id: string
  branch_id: string
  table_id: string | null
  status: OrderStatus
  created_by: string | null
  created_at: string
  ready_at: string | null
  paid_at: string | null
}
```

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors (existing code that constructs `Dish`/`OrderItem`/`Order` literals — like test fixtures — may need the new fields; if `npm run build` is clean but `npm run test:run` fails on a type error in a fixture, add the missing field there too).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/004_register_billing.sql lib/types.ts
git commit -m "feat: add price, price_at_order, paid_at columns and register role"
```

---

### Task 2: VietQR URL builder (TDD)

**Files:**
- Create: `lib/vietqr.ts`
- Create: `lib/__tests__/vietqr.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/vietqr.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildVietQrUrl } from '../vietqr'

const bank = { bankBin: '970422', accountNo: '0123456789', accountName: 'NGUYEN VAN A' }

describe('buildVietQrUrl', () => {
  it('builds the base URL with bank bin, account number, and qr_only template', () => {
    const url = buildVietQrUrl(bank, 140000, 'LeGia Ban4')
    expect(url).toContain('https://img.vietqr.io/image/970422-0123456789-qr_only.png')
  })

  it('rounds the amount and includes it as a query param', () => {
    const url = buildVietQrUrl(bank, 139999.6, 'LeGia Ban4')
    expect(url).toContain('amount=140000')
  })

  it('strips Vietnamese diacritics from addInfo', () => {
    const url = buildVietQrUrl(bank, 100000, 'Lê Gia Bàn 4')
    expect(url).toContain('addInfo=Le+Gia+Ban+4')
  })

  it('strips diacritics from accountName, including đ/Đ which NFD does not decompose', () => {
    const url = buildVietQrUrl({ ...bank, accountName: 'Nguyễn Văn Đậu' }, 100000, 'note')
    expect(url).toContain('accountName=Nguyen+Van+Dau')
  })

  it('removes special characters from addInfo', () => {
    const url = buildVietQrUrl(bank, 100000, 'Ban#4!@2026')
    expect(url).toContain('addInfo=Ban42026')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run`
Expected: FAIL — "Cannot find module '../vietqr'"

- [ ] **Step 3: Write `lib/vietqr.ts`**

```ts
export interface VietQrBankInfo {
  bankBin: string
  accountNo: string
  accountName: string
}

function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/** Pure function — no network calls. Builds an img.vietqr.io quick-link URL. */
export function buildVietQrUrl(bank: VietQrBankInfo, amount: number, addInfo: string): string {
  const safeAddInfo = stripDiacritics(addInfo).replace(/[^a-zA-Z0-9 ]/g, '').trim()
  const safeAccountName = stripDiacritics(bank.accountName)

  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: safeAddInfo,
    accountName: safeAccountName,
  })

  return `https://img.vietqr.io/image/${bank.bankBin}-${bank.accountNo}-qr_only.png?${params.toString()}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: All 5 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/vietqr.ts lib/__tests__/vietqr.test.ts
git commit -m "feat: add VietQR quick-link URL builder"
```

---

### Task 3: Per-table billing logic (TDD)

**Files:**
- Create: `lib/billing.ts`
- Create: `lib/__tests__/billing.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/billing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupOrdersByTable } from '../billing'
import type { OrderWithDetails } from '../types'

const baseOrder = {
  branch_id: 'branch-1',
  created_by: null,
  created_at: '2026-06-19T10:00:00Z',
  ready_at: null,
  paid_at: null,
}

describe('groupOrdersByTable', () => {
  it('sums line totals for a single delivered order', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 2, price_at_order: 65000, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills).toHaveLength(1)
    expect(bills[0].tableId).toBe('table-1')
    expect(bills[0].tableLabel).toBe('Bàn 1')
    expect(bills[0].total).toBe(130000)
    expect(bills[0].canCheckout).toBe(true)
  })

  it('sums across multiple separate orders for the same table', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 3, price_at_order: 5000, dish: { name_vi: 'Trà đá', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills).toHaveLength(1)
    expect(bills[0].total).toBe(80000)
    expect(bills[0].orderIds).toEqual(['order-1', 'order-2'])
  })

  it('blocks checkout when any order for the table is not delivered', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'pending',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 1, price_at_order: 20000, dish: { name_vi: 'Chả', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].canCheckout).toBe(false)
    expect(bills[0].total).toBe(85000)
  })

  it('excludes cancelled orders entirely', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-1',
        status: 'cancelled',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 5, price_at_order: 100000, dish: { name_vi: 'Mọc', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].total).toBe(65000)
    expect(bills[0].orderIds).toEqual(['order-1'])
  })

  it('groups separate tables independently', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
      {
        ...baseOrder,
        id: 'order-2',
        table_id: 'table-2',
        status: 'delivered',
        table: { label: 'Bàn 2' },
        order_items: [
          { id: 'oi-2', order_id: 'order-2', dish_id: 'dish-2', qty: 1, price_at_order: 40000, dish: { name_vi: 'Chả', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run`
Expected: FAIL — "Cannot find module '../billing'"

- [ ] **Step 3: Write `lib/billing.ts`**

```ts
import { num } from './types'
import type { OrderWithDetails } from './types'

export interface TableBillItem {
  name_vi: string
  qty: number
  lineTotal: number
}

export interface TableBill {
  tableId: string
  tableLabel: string
  total: number
  canCheckout: boolean
  orderIds: string[]
  items: TableBillItem[]
}

/** Pure function — no DB calls. Groups unpaid, non-cancelled orders into one bill per table. */
export function groupOrdersByTable(orders: OrderWithDetails[]): TableBill[] {
  const byTable = new Map<string, OrderWithDetails[]>()

  for (const order of orders) {
    if (order.status === 'cancelled' || !order.table_id) continue
    const existing = byTable.get(order.table_id) ?? []
    existing.push(order)
    byTable.set(order.table_id, existing)
  }

  return Array.from(byTable.entries()).map(([tableId, tableOrders]) => {
    const items: TableBillItem[] = tableOrders.flatMap(order =>
      order.order_items.map(oi => ({
        name_vi: oi.dish.name_vi,
        qty: oi.qty,
        lineTotal: oi.qty * num(oi.price_at_order),
      }))
    )

    return {
      tableId,
      tableLabel: tableOrders[0].table.label,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0),
      canCheckout: tableOrders.every(order => order.status === 'delivered'),
      orderIds: tableOrders.map(order => order.id),
      items,
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: All 5 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing.ts lib/__tests__/billing.test.ts
git commit -m "feat: add per-table billing aggregation logic"
```

---

### Task 4: Dish pricing in Settings

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Add `price` to the new-dish state**

Find:
```tsx
const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '' })
```
Replace with:
```tsx
const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '', price: 0 })
```

- [ ] **Step 2: Reset `price` after adding a dish**

Find:
```tsx
  async function addDish() {
    if (!newDish.name_vi.trim()) return
    const { data } = await supabase.from('dishes')
      .insert({ ...newDish, branch_id: branchId }).select().single()
    if (data) { setDishes(p => [...p, data]); setNewDish({ name_vi: '', name_en: '' }) }
  }
```
Replace with:
```tsx
  async function addDish() {
    if (!newDish.name_vi.trim()) return
    const { data } = await supabase.from('dishes')
      .insert({ ...newDish, branch_id: branchId }).select().single()
    if (data) { setDishes(p => [...p, data]); setNewDish({ name_vi: '', name_en: '', price: 0 }) }
  }

  async function updateDishPrice(id: string, price: number) {
    await supabase.from('dishes').update({ price }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, price } : d))
  }
```

- [ ] **Step 3: Add a price input to the add-dish form**

Find:
```tsx
            <input placeholder="Name (EN)" value={newDish.name_en}
              onChange={e => setNewDish(p => ({ ...p, name_en: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <button onClick={addDish} className={btnPrimary}>+ Thêm</button>
```
Replace with:
```tsx
            <input placeholder="Name (EN)" value={newDish.name_en}
              onChange={e => setNewDish(p => ({ ...p, name_en: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input type="number" placeholder="Giá (đ)" value={newDish.price}
              onChange={e => setNewDish(p => ({ ...p, price: +e.target.value }))}
              className={`w-28 ${inputCls}`} />
            <button onClick={addDish} className={btnPrimary}>+ Thêm</button>
```

- [ ] **Step 4: Show an editable price in the dish list**

Find:
```tsx
                <div className="flex items-center gap-3">
                  <span className={dish.is_active ? badgeActive : badgeInactive}>
                    {dish.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                  {dish.is_active && <button onClick={() => deactivateDish(dish.id)} className={btnDanger}>Tắt</button>}
                </div>
```
Replace with:
```tsx
                <div className="flex items-center gap-3">
                  <input type="number" value={Number(dish.price)}
                    onChange={e => updateDishPrice(dish.id, +e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-24 text-label-en" />
                  <span className={dish.is_active ? badgeActive : badgeInactive}>
                    {dish.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                  {dish.is_active && <button onClick={() => deactivateDish(dish.id)} className={btnDanger}>Tắt</button>}
                </div>
```

- [ ] **Step 5: Smoke-test in the browser**

Run `npm run dev`, log in as manager, go to Cài đặt → Món ăn. Set a price on "Bún riêu đặc biệt" (e.g. `65000`), refresh the page, confirm the price persisted.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/settings/page.tsx
git commit -m "feat: add dish price field to settings CRUD"
```

---

### Task 5: Snapshot price at order time

**Files:**
- Modify: `app/(app)/dat-mon/page.tsx`

- [ ] **Step 1: Import `num`**

Find:
```tsx
import type { Dish, Item, RecipeLine, Table } from '@/lib/types'
```
Replace with:
```tsx
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine, Table } from '@/lib/types'
```

- [ ] **Step 2: Include `price_at_order` on insert**

Find:
```tsx
    await supabase.from('order_items').insert(
      orderLines.map(l => ({ order_id: order.id, dish_id: l.dish_id, qty: l.qty }))
    )
```
Replace with:
```tsx
    await supabase.from('order_items').insert(
      orderLines.map(l => {
        const dish = dishes.find(d => d.id === l.dish_id)
        return {
          order_id: order.id,
          dish_id: l.dish_id,
          qty: l.qty,
          price_at_order: dish ? num(dish.price) : 0,
        }
      })
    )
```

- [ ] **Step 3: Smoke-test in the browser**

Place an order for a dish with a price set in Task 4 (e.g. "Bún riêu đặc biệt" at 65.000đ). In Supabase Table Editor, open `order_items` and confirm the new row has `price_at_order = 65000`.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/dat-mon/page.tsx
git commit -m "feat: snapshot dish price onto order_items at order time"
```

---

### Task 6: Register route guard

**Files:**
- Create: `app/register/layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'register' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 flex items-center gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
          point_of_sale
        </span>
        <span className="font-bold text-on-surface">Thu ngân</span>
      </header>
      <main className="flex-1 p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Add a placeholder page so the route compiles**

Create `app/register/page.tsx` with a temporary placeholder (Task 9 replaces this with the real screen):

```tsx
export default function RegisterPage() {
  return <p className="text-on-surface-variant text-center mt-16 text-label-vi">Thu ngân — coming soon</p>
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds, `/register` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add app/register/layout.tsx app/register/page.tsx
git commit -m "feat: add register route guard and placeholder page"
```

---

### Task 7: Role-based redirects to /register

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/login/page.tsx`

- [ ] **Step 1: Redirect `register` role away from the `(app)` shell**

Find in `app/(app)/layout.tsx`:
```tsx
  if (!profile) redirect('/login')
  if (profile.role === 'kitchen') redirect('/kitchen')
```
Replace with:
```tsx
  if (!profile) redirect('/login')
  if (profile.role === 'kitchen') redirect('/kitchen')
  if (profile.role === 'register') redirect('/register')
```

- [ ] **Step 2: Route `register` role to `/register` after login**

Find in `app/login/page.tsx`:
```tsx
      router.push(profile.role === 'kitchen' ? '/kitchen' : '/kho')
```
Replace with:
```tsx
      const target =
        profile.role === 'kitchen'  ? '/kitchen' :
        profile.role === 'register' ? '/register' :
        '/kho'
      router.push(target)
```

- [ ] **Step 3: Smoke-test in the browser**

Create a test user with `role = 'register'` in `user_profiles` (same process as the kitchen test account: Supabase Dashboard → Authentication → add user, then insert/update `user_profiles`). Log in with it — should land on `/register` and see the Task 6 placeholder. Manually visiting `/kho` while logged in as this user should redirect back to `/register`.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/layout.tsx app/login/page.tsx
git commit -m "feat: redirect register role to /register on login and shell access"
```

---

### Task 8: Sidebar link for manager

**Files:**
- Modify: `components/sidebar-nav.tsx`

- [ ] **Step 1: Add the Thu ngân tab for managers**

Find:
```tsx
  if (role === 'manager') {
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }
```
Replace with:
```tsx
  if (role === 'manager') {
    tabs.push({ href: '/register', labelVi: 'Thu ngân', labelEn: 'Register', icon: 'point_of_sale' })
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }
```

- [ ] **Step 2: Smoke-test in the browser**

Log in as manager. Confirm "Thu ngân" appears in the sidebar between "Đang chạy" and "Cài đặt", and clicking it navigates to `/register`.

- [ ] **Step 3: Commit**

```bash
git add components/sidebar-nav.tsx
git commit -m "feat: add Thu ngân sidebar link for manager role"
```

---

### Task 9: Register screen — list, confirm, and receipt

**Files:**
- Modify: `app/register/page.tsx` (replaces the Task 6 placeholder)
- Modify: `app/globals.css`

- [ ] **Step 1: Write the full register screen**

Replace the entire contents of `app/register/page.tsx`:

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { groupOrdersByTable } from '@/lib/billing'
import type { TableBill, TableBillItem } from '@/lib/billing'
import { buildVietQrUrl } from '@/lib/vietqr'
import type { OrderWithDetails } from '@/lib/types'

type Step = 'list' | 'confirm' | 'receipt'

interface Receipt {
  tableLabel: string
  items: TableBillItem[]
  total: number
  paidAt: string
}

export default function RegisterPage() {
  const [branchId, setBranchId] = useState<string | null>(null)
  const [bills, setBills] = useState<TableBill[]>([])
  const [step, setStep] = useState<Step>('list')
  const [selectedBill, setSelectedBill] = useState<TableBill | null>(null)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
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

  const fetchBills = useCallback(async (bid: string) => {
    const { data } = await supabase
      .from('orders')
      .select(`*, table:tables(label), order_items(*, dish:dishes(name_vi, name_en))`)
      .eq('branch_id', bid)
      .is('paid_at', null)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
    if (data) setBills(groupOrdersByTable(data as OrderWithDetails[]))
  }, [supabase])

  useEffect(() => {
    if (!branchId) return
    // Initial fetch on mount/branch change — async, not a synchronous setState call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBills(branchId)

    const channel = supabase
      .channel(`register-orders-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => fetchBills(branchId),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId, fetchBills])

  function handleSelectTable(bill: TableBill) {
    if (!bill.canCheckout) return
    setSelectedBill(bill)
    setErrorMsg(null)
    setStep('confirm')
  }

  async function handleConfirmPay() {
    if (!selectedBill || !branchId) return

    const { data, error } = await supabase
      .from('orders')
      .update({ paid_at: new Date().toISOString() })
      .eq('table_id', selectedBill.tableId)
      .eq('branch_id', branchId)
      .is('paid_at', null)
      .select('id')

    if (error || !data || data.length === 0) {
      setErrorMsg('Bàn này đã được thanh toán hoặc có lỗi xảy ra. Vui lòng thử lại.')
      setStep('list')
      setSelectedBill(null)
      fetchBills(branchId)
      return
    }

    setReceipt({
      tableLabel: selectedBill.tableLabel,
      items: selectedBill.items,
      total: selectedBill.total,
      paidAt: new Date().toLocaleString('vi-VN'),
    })
    setStep('receipt')
  }

  function handleBackToList() {
    setSelectedBill(null)
    setReceipt(null)
    setErrorMsg(null)
    setStep('list')
    if (branchId) fetchBills(branchId)
  }

  if (step === 'confirm' && selectedBill) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-stack-lg">
          <button onClick={handleBackToList} className="text-primary text-label-vi font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>
            Bàn
          </button>
          <h2 className="text-headline-md font-bold text-on-surface">{selectedBill.tableLabel}</h2>
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg mb-stack-lg space-y-2">
          {selectedBill.items.map((item, i) => (
            <div key={i} className="flex justify-between text-body-lg text-on-surface">
              <span>{item.name_vi} ×{item.qty}</span>
              <span className="font-bold">{item.lineTotal.toLocaleString('vi-VN')}đ</span>
            </div>
          ))}
          <hr className="border-outline-variant" />
          <div className="flex justify-between text-headline-md font-black text-primary">
            <span>TỔNG</span>
            <span>{selectedBill.total.toLocaleString('vi-VN')}đ</span>
          </div>
        </div>

        <button
          onClick={handleConfirmPay}
          className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md"
        >
          Xác nhận thanh toán
        </button>
      </div>
    )
  }

  if (step === 'receipt' && receipt) {
    const bank = {
      bankBin: process.env.NEXT_PUBLIC_VIETQR_BANK_BIN ?? '',
      accountNo: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NO ?? '',
      accountName: process.env.NEXT_PUBLIC_VIETQR_ACCOUNT_NAME ?? '',
    }
    const qrUrl = buildVietQrUrl(bank, receipt.total, `LeGia ${receipt.tableLabel}`)

    return (
      <div className="max-w-sm mx-auto">
        <div id="receipt-print-area" className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg font-mono text-[13px] text-on-surface">
          <p className="text-center font-bold">LÊ GIA - BÚN RIÊU</p>
          <p className="text-center">{receipt.paidAt}</p>
          <p className="mt-2">{receipt.tableLabel}</p>
          <hr className="border-dashed border-outline-variant my-2" />
          {receipt.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.name_vi} x{item.qty}</span>
              <span>{item.lineTotal.toLocaleString('vi-VN')}</span>
            </div>
          ))}
          <hr className="border-dashed border-outline-variant my-2" />
          <div className="flex justify-between font-bold text-[15px]">
            <span>TỔNG</span>
            <span>{receipt.total.toLocaleString('vi-VN')}đ</span>
          </div>
          <div className="text-center mt-3">
            <img src={qrUrl} alt="VietQR" width={160} height={160} className="mx-auto" />
            <p className="mt-1">Quét để chuyển khoản</p>
            <p>{bank.accountName} - {bank.accountNo}</p>
          </div>
          <p className="text-center mt-3 text-on-surface-variant">Cảm ơn quý khách!</p>
        </div>

        <div className="flex gap-2 mt-stack-lg">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min"
          >
            In hóa đơn
          </button>
          <button
            onClick={handleBackToList}
            className="flex-1 bg-surface-container text-on-surface rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min"
          >
            Xong
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto space-y-stack-md">
      <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">
        Thu ngân
        <span className="block text-label-en font-normal text-on-surface-variant">Register</span>
      </h2>

      {errorMsg && (
        <p className="text-error text-label-vi font-bold bg-error-container rounded-lg p-stack-md">{errorMsg}</p>
      )}

      {bills.length === 0 && (
        <p className="text-on-surface-variant text-center mt-16 text-label-vi">Không có bàn nào đang mở</p>
      )}

      {bills.map(bill => (
        <button
          key={bill.tableId}
          onClick={() => handleSelectTable(bill)}
          disabled={!bill.canCheckout}
          className={`w-full text-left rounded-xl border p-stack-lg transition-all ${
            bill.canCheckout
              ? 'border-outline-variant bg-surface-container-lowest hover:border-primary'
              : 'border-outline-variant bg-surface-container opacity-60 cursor-not-allowed'
          }`}
        >
          <div className="flex justify-between font-bold text-body-lg text-on-surface">
            <span>{bill.tableLabel}</span>
            <span>{bill.total.toLocaleString('vi-VN')}đ</span>
          </div>
          <p className="text-label-en text-on-surface-variant mt-1">
            {bill.canCheckout
              ? `${bill.items.length} món · Tất cả đã giao`
              : 'Còn món chưa giao — chưa thể thanh toán'}
          </p>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add print CSS so only the receipt prints**

Add to the end of `app/globals.css` (after the `.animate-pulse-critical` rule):

```css
/* Register receipt — print only the receipt card, sized for an 80mm thermal printer */
@media print {
  body * {
    visibility: hidden;
  }
  #receipt-print-area, #receipt-print-area * {
    visibility: visible;
  }
  #receipt-print-area {
    position: absolute;
    top: 0;
    left: 0;
    width: 80mm;
  }
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Smoke-test the list step**

With the register test account from Task 7, and at least one fully-delivered, unpaid order from Task 5 (with a priced dish), open `/register`. Confirm the table appears with the correct total and a "Thanh toán" tap target. Place a second order for the same table that's still `pending` and confirm a different table shows as blocked ("Còn món chưa giao").

- [ ] **Step 5: Smoke-test the confirm + pay step**

Tap a checkout-ready table. Confirm the itemized breakdown and total match what Kho/Settings show for that dish's price × qty. Tap "Xác nhận thanh toán".

- [ ] **Step 6: Smoke-test the receipt step**

Confirm the receipt shows the same items/total, a QR image loads from `img.vietqr.io` (requires the env vars from Task 10 to be set), and the bank name/account number are readable as plain text under the QR. Click "In hóa đơn" and confirm the browser print preview shows only the receipt card at a narrow (80mm) width. Click "Xong" and confirm the table no longer appears in the list (since it's now paid).

- [ ] **Step 7: Commit**

```bash
git add app/register/page.tsx app/globals.css
git commit -m "feat: register screen — table list, checkout confirm, and printable VietQR receipt"
```

---

### Task 10: Environment variables + end-to-end verification

**Files:**
- Modify: `.env.local` (not committed — local only)

- [ ] **Step 1: Add VietQR bank info to `.env.local`**

Add these three lines to your local `.env.local` (replace with your actual bank details — find your bank's BIN code at https://api.vietqr.io/v2/banks if needed):

```
NEXT_PUBLIC_VIETQR_BANK_BIN=<your_bank_bin>
NEXT_PUBLIC_VIETQR_ACCOUNT_NO=<your_account_number>
NEXT_PUBLIC_VIETQR_ACCOUNT_NAME=<account holder name, e.g. NGUYEN VAN A>
```

- [ ] **Step 2: Restart the dev server**

Next.js only reads `.env.local` at startup. Stop `npm run dev` and run it again so the new variables are picked up.

- [ ] **Step 3: Full end-to-end smoke test**

1. As manager, set a price on at least 2 dishes in Cài đặt → Món ăn.
2. As FOH, place an order for one of those tables with multiple dishes.
3. As kitchen, mark the order ready; as FOH, mark it delivered.
4. As register (or manager via the sidebar "Thu ngân" link), open `/register`, confirm the table's total matches `Σ(qty × price)`, check out, and confirm the printed/previewed receipt shows correct items, total, and a scannable-looking VietQR code with the right bank details underneath.
5. Confirm the table disappears from the register list after payment, and that placing a brand-new order for that same table starts a fresh (zero) tab rather than reappearing with the old total.

- [ ] **Step 4: Run full verification suite**

```bash
npm run test:run
npm run lint
npm run build
```
Expected: all tests pass, lint shows no new errors, build succeeds.

- [ ] **Step 5: Commit**

Nothing to commit for this task (`.env.local` is gitignored) — if you added bank info to Vercel's environment variables for production, no local commit is needed either.

---

## Self-Review Checklist (spec vs plan)

| Spec requirement | Covered by |
|---|---|
| `dishes.price`, `order_items.price_at_order`, `orders.paid_at` columns | Task 1 |
| `register` added to role check constraint + `UserRole` type | Task 1 |
| VietQR quick-link URL builder, diacritic-safe | Task 2 |
| Per-table bill aggregation, checkout gate, cancelled-order exclusion | Task 3 |
| Manager can edit dish prices | Task 4 |
| Price snapshotted at order time | Task 5 |
| `/register` route guard (register + manager only) | Task 6 |
| Login/shell redirects for register role | Task 7 |
| Manager sidebar access to register | Task 8 |
| List → confirm → receipt flow | Task 9 |
| Print CSS scoped to receipt, 80mm | Task 9 |
| Race-condition handling (zero rows affected) | Task 9 (`handleConfirmPay` error branch) |
| VietQR image fallback (bank info as text) | Task 9 (receipt JSX) |
| Bank info via env vars, no new table | Task 10 |
| Full end-to-end verification | Task 10 |
