# Lê Gia Inventory App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time tablet-first inventory and order management web app for 2 branches of Bún riêu Lê Gia, starting from an empty Next.js repo.

**Architecture:** Next.js 14 App Router with route groups — `(app)` for FOH/manager (3-tab bottom nav) and `kitchen` for kitchen (no nav). All data lives in Supabase; Realtime subscriptions drive live updates. Business logic for stock decrement/reversal is a pure TypeScript function tested with Vitest, applied to the DB via a Postgres RPC for atomicity.

**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase (Postgres + Realtime + Auth) · `@supabase/ssr` · Vitest · React Testing Library · Vercel

---

## Scope note

The spec has three natural sub-phases: (1) Foundation + logic, (2) FOH/kitchen UI, (3) Manager CRUD. They share one codebase and must be built in order, so this is one plan. The DESIGN.md gate in Phase 2 is a hard stop — do not write any UI before it.

---

## Prerequisites (confirm before Task 1)

- Supabase project created and existing tables (`branches`, `items`, `orders`, `stock_logs`) already exist
- `.env.local` created with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Node.js 18+ installed

---

## File Structure

```
├── app/
│   ├── (app)/                    # FOH + manager — has bottom nav
│   │   ├── layout.tsx            # Bottom nav layout, auth guard
│   │   ├── kho/page.tsx          # Inventory Dashboard
│   │   ├── dat-mon/page.tsx      # Place Order
│   │   ├── dang-chay/page.tsx    # Active Orders
│   │   └── settings/page.tsx     # Manager Item Management
│   ├── kitchen/
│   │   └── page.tsx              # Kitchen Order Queue
│   ├── login/
│   │   └── page.tsx
│   └── layout.tsx                # Root layout (fonts, globals)
├── components/
│   ├── branch-selector.tsx
│   ├── bottom-nav.tsx
│   ├── ingredient-card.tsx
│   ├── order-card.tsx
│   └── dish-row.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # createBrowserClient helper
│   │   └── server.ts             # createServerClient helper
│   ├── stock.ts                  # calculateDecrements (pure) + applyStockChange (RPC)
│   └── types.ts                  # All shared TypeScript types
├── supabase/
│   └── migrations/
│       ├── 001_new_tables.sql
│       └── 002_alter_existing.sql
├── middleware.ts                  # Auth session refresh + route protection
├── vitest.config.ts
├── vitest.setup.ts
└── .env.local                    # Never committed
```

---

## Phase 1: Foundation (no UI — no DESIGN.md needed yet)

---

### Task 1: Bootstrap project + packages

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```

Expected: project files created, `npm run dev` starts on port 3000.

- [ ] **Step 2: Confirm and install additional packages**

Show the user this package list and get confirmation before running:
```
@supabase/ssr
@supabase/supabase-js
vitest
@vitejs/plugin-react
@testing-library/react
@testing-library/user-event
@testing-library/jest-dom
jsdom
```

Then run:
```bash
npm install @supabase/ssr @supabase/supabase-js
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
```

- [ ] **Step 4: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Add test script to `package.json`**

In `package.json` scripts, add:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 6: Verify test runner works**

```bash
npm run test:run
```
Expected: "No test files found" (not an error — runner is working).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: bootstrap Next.js 14 project with Vitest and Supabase packages"
```

---

### Task 2: Database migrations

**Files:**
- Create: `supabase/migrations/001_new_tables.sql`
- Create: `supabase/migrations/002_alter_existing.sql`

- [ ] **Step 1: Write `supabase/migrations/001_new_tables.sql`**

```sql
-- tables must be created before orders FK is wired
CREATE TABLE IF NOT EXISTS tables (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  label      text NOT NULL,
  is_active  boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS dishes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid REFERENCES branches(id) NOT NULL,
  name_vi     text NOT NULL,
  name_en     text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id         uuid REFERENCES dishes(id) ON DELETE CASCADE NOT NULL,
  item_id         uuid REFERENCES items(id) NOT NULL,
  qty_per_serving numeric(8,2) NOT NULL,
  UNIQUE (dish_id, item_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  dish_id  uuid REFERENCES dishes(id) NOT NULL,
  qty      int NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  role       text NOT NULL CHECK (role IN ('foh', 'kitchen', 'manager')),
  full_name  text
);

-- Postgres RPC used by stock.ts to apply decrements/reversals atomically
CREATE OR REPLACE FUNCTION apply_stock_change(
  p_changes  jsonb,
  p_reason   text,
  p_user_id  uuid
) RETURNS jsonb AS $$
DECLARE
  c         jsonb;
  floored   jsonb := '[]'::jsonb;
  old_qty   numeric;
  new_qty   numeric;
  delta_val numeric;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    delta_val := (c->>'delta')::numeric;

    SELECT quantity INTO old_qty
    FROM items WHERE id = (c->>'item_id')::uuid;

    new_qty := GREATEST(old_qty + delta_val, 0);

    UPDATE items
    SET quantity = new_qty
    WHERE id = (c->>'item_id')::uuid;

    INSERT INTO stock_logs (item_id, delta, reason, created_by)
    VALUES (
      (c->>'item_id')::uuid,
      delta_val,
      p_reason,
      p_user_id
    );

    IF old_qty + delta_val < 0 THEN
      floored := floored || jsonb_build_array(c->>'item_id');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('floored', floored);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Write `supabase/migrations/002_alter_existing.sql`**

```sql
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

-- Only add FK if tables table now exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_orders_table'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT fk_orders_table FOREIGN KEY (table_id) REFERENCES tables(id);
  END IF;
END$$;
```

- [ ] **Step 3: Apply migrations in Supabase dashboard**

In the Supabase dashboard → SQL Editor, run `001_new_tables.sql` first, then `002_alter_existing.sql`. Verify all 5 new tables appear in the Table Editor.

Enable Realtime on `order_items`: Dashboard → Database → Replication → add `order_items`.

- [ ] **Step 4: Seed test data**

In Supabase SQL Editor, run (replace `<branch1_id>` with the actual UUID from your `branches` table):

```sql
-- Seed tables for branch 1
INSERT INTO tables (branch_id, label) VALUES
  ('<branch1_id>', 'Bàn 1'),
  ('<branch1_id>', 'Bàn 2'),
  ('<branch1_id>', 'Bàn 3'),
  ('<branch1_id>', 'Mang về');

-- Seed a dish
INSERT INTO dishes (branch_id, name_vi, name_en) VALUES
  ('<branch1_id>', 'Bún riêu đặc biệt', 'Special bun rieu');
```

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "chore: add database migrations for new tables and stock RPC"
```

---

### Task 3: TypeScript types + Supabase clients

**Files:**
- Create: `lib/types.ts`
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type UserRole = 'foh' | 'kitchen' | 'manager'
export type OrderStatus = 'pending' | 'ready' | 'delivered' | 'cancelled'

export interface Branch {
  id: string
  name: string
  created_at: string
}

export interface Item {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  unit: string
  quantity: number
  low_threshold: number
  is_active: boolean
  created_at: string
}

export interface Dish {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  is_active: boolean
  created_at: string
}

export interface RecipeLine {
  id: string
  dish_id: string
  item_id: string
  qty_per_serving: number
}

export interface Table {
  id: string
  branch_id: string
  label: string
  is_active: boolean
}

export interface Order {
  id: string
  branch_id: string
  table_id: string
  status: OrderStatus
  created_by: string
  created_at: string
  ready_at: string | null
}

export interface OrderItem {
  id: string
  order_id: string
  dish_id: string
  qty: number
}

export interface UserProfile {
  id: string
  branch_id: string
  role: UserRole
  full_name: string | null
}

// Joined types used by UI
export interface OrderWithDetails extends Order {
  order_items: Array<OrderItem & { dish: Pick<Dish, 'name_vi' | 'name_en'> }>
  table: Pick<Table, 'label'>
}

export interface DishWithAvailability extends Dish {
  status: 'available' | 'low' | 'unavailable'
}
```

- [ ] **Step 2: Write `lib/supabase/client.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Write `lib/supabase/server.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 4: Write `middleware.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/kho', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/ middleware.ts
git commit -m "feat: add TypeScript types, Supabase clients, and auth middleware"
```

---

### Task 4: Stock decrement/reversal logic (TDD)

**Files:**
- Create: `lib/stock.ts`
- Create: `lib/__tests__/stock.test.ts`

- [ ] **Step 1: Write failing tests for `calculateDecrements`**

Create `lib/__tests__/stock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calculateDecrements } from '../stock'
import type { RecipeLine } from '../types'

const recipes: RecipeLine[] = [
  { id: 'r1', dish_id: 'dish-special', item_id: 'item-gio',    qty_per_serving: 2 },
  { id: 'r2', dish_id: 'dish-special', item_id: 'item-moc',    qty_per_serving: 1 },
  { id: 'r3', dish_id: 'dish-thuong',  item_id: 'item-gio',    qty_per_serving: 1 },
  { id: 'r4', dish_id: 'dish-thuong',  item_id: 'item-dau-hu', qty_per_serving: 1 },
]

describe('calculateDecrements', () => {
  it('returns empty array for empty order', () => {
    expect(calculateDecrements([], recipes)).toEqual([])
  })

  it('calculates single dish correctly', () => {
    const result = calculateDecrements(
      [{ dish_id: 'dish-special', qty: 1 }],
      recipes
    )
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio', delta: -2 },
      { item_id: 'item-moc', delta: -1 },
    ]))
    expect(result).toHaveLength(2)
  })

  it('multiplies by qty', () => {
    const result = calculateDecrements(
      [{ dish_id: 'dish-special', qty: 3 }],
      recipes
    )
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio', delta: -6 },
      { item_id: 'item-moc', delta: -3 },
    ]))
  })

  it('aggregates shared ingredients across dishes', () => {
    const result = calculateDecrements(
      [
        { dish_id: 'dish-special', qty: 1 },
        { dish_id: 'dish-thuong',  qty: 2 },
      ],
      recipes
    )
    // item-gio: special(2×1) + thuong(1×2) = 4
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio',    delta: -4 },
      { item_id: 'item-moc',    delta: -1 },
      { item_id: 'item-dau-hu', delta: -2 },
    ]))
    expect(result).toHaveLength(3)
  })

  it('returns positive deltas for cancellation (negate=true)', () => {
    const result = calculateDecrements(
      [{ dish_id: 'dish-special', qty: 1 }],
      recipes,
      true  // reversal
    )
    expect(result).toEqual(expect.arrayContaining([
      { item_id: 'item-gio', delta: 2 },
      { item_id: 'item-moc', delta: 1 },
    ]))
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run
```
Expected: FAIL — "Cannot find module '../stock'"

- [ ] **Step 3: Write `lib/stock.ts`**

```ts
import type { RecipeLine } from './types'
import { createClient } from './supabase/client'

export interface StockChange {
  item_id: string
  delta: number
}

/** Pure function — no DB calls. Returns per-item deltas for an order or cancellation. */
export function calculateDecrements(
  orderItems: Array<{ dish_id: string; qty: number }>,
  recipeLines: RecipeLine[],
  reversal = false
): StockChange[] {
  const totals: Record<string, number> = {}

  for (const { dish_id, qty } of orderItems) {
    for (const line of recipeLines.filter(r => r.dish_id === dish_id)) {
      totals[line.item_id] = (totals[line.item_id] ?? 0) + line.qty_per_serving * qty
    }
  }

  const sign = reversal ? 1 : -1
  return Object.entries(totals).map(([item_id, amount]) => ({
    item_id,
    delta: sign * amount,
  }))
}

/** Calls the apply_stock_change RPC. Returns item_ids that were floored at 0. */
export async function applyStockChange(
  changes: StockChange[],
  reason: 'order' | 'manual_correction' | 'cancellation',
  userId: string
): Promise<{ floored: string[] }> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('apply_stock_change', {
    p_changes:  changes,
    p_reason:   reason,
    p_user_id:  userId,
  })
  if (error) throw error
  return data as { floored: string[] }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npm run test:run
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stock.ts lib/__tests__/stock.test.ts
git commit -m "feat: add stock decrement/reversal logic with tests"
```

---

### Task 5: Login screen + role-based redirect

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/layout.tsx` (root layout)

- [ ] **Step 1: Write root `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lê Gia Kho',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Write `app/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError('Email hoặc mật khẩu không đúng')
      setLoading(false)
      return
    }

    // Fetch role to determine redirect target
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user!.id)
      .single()

    if (profile?.role === 'kitchen') {
      router.push('/kitchen')
    } else {
      router.push('/kho')
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 bg-white p-8 rounded-2xl shadow"
      >
        <h1 className="text-xl font-bold text-gray-900">Lê Gia Kho</h1>
        <p className="text-sm text-gray-500">Đăng nhập để tiếp tục</p>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Mật khẩu / Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded-lg py-3 font-semibold text-base disabled:opacity-50 min-h-[44px]"
        >
          {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3: Write a smoke test for the login form**

Create `app/login/__tests__/login.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LoginPage from '../page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'foh' } }),
    }),
  }),
}))

describe('LoginPage', () => {
  it('renders email and password inputs', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mật khẩu/i)).toBeInTheDocument()
  })

  it('renders submit button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /đăng nhập/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```
Expected: 2 new tests PASS (total 7 passing).

- [ ] **Step 5: Smoke-test in browser**

```bash
npm run dev
```
Open http://localhost:3000 — should redirect to `/login`. Check form renders.

- [ ] **Step 6: Commit**

```bash
git add app/login/ app/layout.tsx
git commit -m "feat: add login page with role-based redirect"
```

---

## ⛔️ GATE: Do not proceed past this point until `/docs/DESIGN.md` exists.
## Generate it via the Stitch MCP. All Tailwind visual values (colors, spacing) must come from DESIGN.md.

---

## Phase 2: Navigation Shell

---

### Task 6: FOH/Manager layout + bottom nav + branch selector

> Before this task, read `/docs/DESIGN.md` and extract: primary background color, surface color, tab bar background, active tab color, badge color, text colors. Use these throughout.

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `components/bottom-nav.tsx`
- Create: `components/branch-selector.tsx`

- [ ] **Step 1: Write `components/branch-selector.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Branch } from '@/lib/types'

interface Props {
  currentBranchId: string
  onBranchChange: (branchId: string) => void
}

export function BranchSelector({ currentBranchId, onBranchChange }: Props) {
  const [branches, setBranches] = useState<Branch[]>([])
  const supabase = createClient()

  useEffect(() => {
    supabase.from('branches').select('*').then(({ data }) => {
      if (data) setBranches(data)
    })
  }, [])

  return (
    <select
      value={currentBranchId}
      onChange={e => onBranchChange(e.target.value)}
      className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer min-h-[44px]"
      aria-label="Chọn chi nhánh"
    >
      {branches.map(b => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  )
}
```

- [ ] **Step 2: Write `components/bottom-nav.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  readyCount: number
}

export function BottomNav({ readyCount }: Props) {
  const pathname = usePathname()

  const tabs = [
    { href: '/kho',       label: 'Kho',       icon: '📦' },
    { href: '/dat-mon',   label: 'Đặt món',   icon: '➕' },
    { href: '/dang-chay', label: 'Đang chạy', icon: '📋', badge: readyCount },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t" aria-label="Navigation chính">
      {tabs.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-1 flex-col items-center justify-center min-h-[56px] text-xs font-medium transition-colors ${
              active ? 'text-blue-600 border-t-2 border-blue-600 -mt-px' : 'text-gray-500'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="mt-0.5">{tab.label}</span>
            {tab.badge != null && tab.badge > 0 && (
              <span className="absolute top-1 right-[calc(50%-18px)] bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {tab.badge}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 3: Write `app/(app)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from './app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role === 'kitchen') redirect('/kitchen')

  return (
    <AppShell
      role={profile.role}
      defaultBranchId={profile.branch_id}
    >
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 4: Create `app/(app)/app-shell.tsx`** (client component that holds branch state + ready count)

```tsx
'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BottomNav } from '@/components/bottom-nav'
import { BranchSelector } from '@/components/branch-selector'
import type { UserRole } from '@/lib/types'

interface BranchContextValue {
  branchId: string
  setBranchId: (id: string) => void
}

export const BranchContext = createContext<BranchContextValue>({
  branchId: '',
  setBranchId: () => {},
})

export function useBranch() {
  return useContext(BranchContext)
}

interface Props {
  role: UserRole
  defaultBranchId: string
  children: React.ReactNode
}

export function AppShell({ role, defaultBranchId, children }: Props) {
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [readyCount, setReadyCount]   = useState(0)
  const supabase = createClient()

  useEffect(() => {
    // Initial count
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId)
      .eq('status', 'ready')
      .then(({ count }) => setReadyCount(count ?? 0))

    // Realtime subscription for badge
    const channel = supabase
      .channel(`ready-count-${branchId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `branch_id=eq.${branchId}`,
      }, () => {
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .eq('status', 'ready')
          .then(({ count }) => setReadyCount(count ?? 0))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  return (
    <BranchContext.Provider value={{ branchId, setBranchId }}>
      <div className="min-h-screen pb-14">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 border-b">
          {role !== 'kitchen' ? (
            <BranchSelector currentBranchId={branchId} onBranchChange={setBranchId} />
          ) : null}
          {role === 'manager' && (
            <a href="/settings" className="text-gray-500 hover:text-gray-900" aria-label="Cài đặt">
              ⚙️
            </a>
          )}
        </header>

        <main className="p-4">{children}</main>
      </div>

      <BottomNav readyCount={readyCount} />
    </BranchContext.Provider>
  )
}
```

- [ ] **Step 5: Verify layout compiles**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds (or only shows missing page errors for routes not yet created).

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/ components/bottom-nav.tsx components/branch-selector.tsx
git commit -m "feat: add app shell with bottom nav, branch selector, and ready-order badge"
```

---

### Task 7: Kitchen layout + page scaffold

**Files:**
- Create: `app/kitchen/page.tsx` (scaffold)
- Create: `app/kitchen/layout.tsx`

- [ ] **Step 1: Write `app/kitchen/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, branch_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'kitchen' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b">
        <span className="font-semibold">Bếp</span>
        <span className="text-sm text-gray-500">{/* branch name loaded client-side */}</span>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Scaffold `app/kitchen/page.tsx`**

```tsx
export default function KitchenPage() {
  return <p className="text-gray-400 text-center mt-16">Kitchen — coming soon</p>
}
```

- [ ] **Step 3: Also scaffold remaining (app) pages so the app compiles**

Create `app/(app)/kho/page.tsx`:
```tsx
export default function KhoPage() {
  return <p className="text-gray-400 text-center mt-16">Kho — coming soon</p>
}
```

Create `app/(app)/dat-mon/page.tsx`:
```tsx
export default function DatMonPage() {
  return <p className="text-gray-400 text-center mt-16">Đặt món — coming soon</p>
}
```

Create `app/(app)/dang-chay/page.tsx`:
```tsx
export default function DangChayPage() {
  return <p className="text-gray-400 text-center mt-16">Đang chạy — coming soon</p>
}
```

Create `app/(app)/settings/page.tsx`:
```tsx
export default function SettingsPage() {
  return <p className="text-gray-400 text-center mt-16">Cài đặt — coming soon</p>
}
```

- [ ] **Step 4: Verify full build passes**

```bash
npm run build
```
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/kitchen/ app/\(app\)/kho/ app/\(app\)/dat-mon/ app/\(app\)/dang-chay/ app/\(app\)/settings/
git commit -m "feat: scaffold all routes — builds clean"
```

---

## Phase 3: FOH Screens

> All Tailwind values used below are PLACEHOLDERS. Before writing any CSS class, check `/docs/DESIGN.md` and replace with the actual design tokens.

---

### Task 8: Inventory Dashboard (Kho)

**Files:**
- Create: `components/ingredient-card.tsx`
- Modify: `app/(app)/kho/page.tsx`

- [ ] **Step 1: Write test for IngredientCard status logic**

Create `components/__tests__/ingredient-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IngredientCard } from '../ingredient-card'
import type { Item } from '@/lib/types'

const base: Item = {
  id: 'i1', branch_id: 'b1', name_vi: 'Giò', name_en: 'Pork roll',
  unit: 'phần', quantity: 5, low_threshold: 3, is_active: true, created_at: '',
}

describe('IngredientCard status badge', () => {
  it('shows Đủ when quantity > low_threshold', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} />)
    expect(screen.getByText('Đủ')).toBeInTheDocument()
  })

  it('shows Sắp hết when 0 < quantity ≤ low_threshold', () => {
    render(<IngredientCard item={{ ...base, quantity: 2 }} onAdjust={() => {}} />)
    expect(screen.getByText('Sắp hết')).toBeInTheDocument()
  })

  it('shows Hết when quantity = 0', () => {
    render(<IngredientCard item={{ ...base, quantity: 0 }} onAdjust={() => {}} />)
    expect(screen.getByText('Hết')).toBeInTheDocument()
  })

  it('renders Vietnamese name prominently', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} />)
    expect(screen.getByText('Giò')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run
```
Expected: FAIL — "Cannot find module '../ingredient-card'"

- [ ] **Step 3: Write `components/ingredient-card.tsx`**

```tsx
'use client'

import type { Item } from '@/lib/types'

function getStatus(item: Item): 'sufficient' | 'low' | 'out' {
  if (item.quantity === 0) return 'out'
  if (item.quantity <= item.low_threshold) return 'low'
  return 'sufficient'
}

const statusConfig = {
  sufficient: { label: 'Đủ',      classes: 'bg-green-100 text-green-800' },
  low:        { label: 'Sắp hết', classes: 'bg-amber-100 text-amber-800' },
  out:        { label: 'Hết',     classes: 'bg-red-100 text-red-800'    },
}

interface Props {
  item: Item
  onAdjust: (id: string, delta: 1 | -1) => void
}

export function IngredientCard({ item, onAdjust }: Props) {
  const status = getStatus(item)
  const { label, classes } = statusConfig[status]

  return (
    <article className="rounded-xl border p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{item.name_vi}</p>
          {item.name_en && (
            <p className="text-sm text-gray-500 truncate">{item.name_en}</p>
          )}
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${classes}`}>
          {label}
        </span>
      </div>

      <div className="flex items-center justify-between mt-1">
        <span className="text-lg font-bold">
          {item.quantity} <span className="text-sm font-normal text-gray-500">{item.unit}</span>
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onAdjust(item.id, -1)}
            aria-label={`Giảm ${item.name_vi}`}
            className="w-11 h-11 rounded-lg border text-xl font-bold flex items-center justify-center"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(item.id, 1)}
            aria-label={`Tăng ${item.name_vi}`}
            className="w-11 h-11 rounded-lg border text-xl font-bold flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
    </article>
  )
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```
Expected: All tests PASS.

- [ ] **Step 5: Write full `app/(app)/kho/page.tsx`**

```tsx
'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IngredientCard } from '@/components/ingredient-card'
import { applyStockChange } from '@/lib/stock'
import { BranchContext } from '../app-shell'
import type { Item } from '@/lib/types'

export default function KhoPage() {
  const { branchId } = useContext(BranchContext)
  const [items, setItems] = useState<Item[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('items')
        .select('*')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name_vi')
      if (data) { setItems(data); setLastUpdated(new Date()) }
    }
    load()

    const channel = supabase
      .channel(`items-${branchId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'items',
        filter: `branch_id=eq.${branchId}`,
      }, payload => {
        setItems(prev => prev.map(i =>
          i.id === (payload.new as Item).id ? (payload.new as Item) : i
        ))
        setLastUpdated(new Date())
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  async function handleAdjust(itemId: string, delta: 1 | -1) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await applyStockChange(
      [{ item_id: itemId, delta }],
      'manual_correction',
      user.id
    )
  }

  const problemItems = items.filter(i => i.quantity <= i.low_threshold)

  return (
    <>
      {lastUpdated && (
        <p className="text-xs text-gray-400 mb-3">
          Cập nhật lúc {lastUpdated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => (
          <IngredientCard key={item.id} item={item} onAdjust={handleAdjust} />
        ))}
      </div>

      {problemItems.length > 0 && (
        <div className="fixed bottom-14 left-0 right-0 bg-red-600 text-white text-sm font-semibold px-4 py-2 text-center">
          ⚠ {problemItems.filter(i => i.quantity === 0).length} hết ·{' '}
          {problemItems.filter(i => i.quantity > 0).length} sắp hết
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 6: Smoke-test in browser**

Log in as an FOH user, navigate to /kho. Verify ingredient cards load, +/- buttons work (check Supabase Table Editor to see quantity changes).

- [ ] **Step 7: Commit**

```bash
git add components/ingredient-card.tsx components/__tests__/ app/\(app\)/kho/
git commit -m "feat: inventory dashboard with realtime ingredient cards"
```

---

### Task 9: Place Order — table grid + dish list

**Files:**
- Create: `components/dish-row.tsx`
- Modify: `app/(app)/dat-mon/page.tsx`

- [ ] **Step 1: Write test for dish availability logic**

Create `lib/__tests__/dish-availability.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getDishStatus } from '../dish-availability'
import type { Item, RecipeLine } from '../types'

const items: Item[] = [
  { id: 'item-gio',    quantity: 5, low_threshold: 3, branch_id: '', name_vi: '', name_en: null, unit: '', is_active: true, created_at: '' },
  { id: 'item-moc',   quantity: 2, low_threshold: 3, branch_id: '', name_vi: '', name_en: null, unit: '', is_active: true, created_at: '' },
  { id: 'item-dau-hu', quantity: 0, low_threshold: 2, branch_id: '', name_vi: '', name_en: null, unit: '', is_active: true, created_at: '' },
]

const recipes: RecipeLine[] = [
  { id: 'r1', dish_id: 'dish-ok',   item_id: 'item-gio',  qty_per_serving: 1 },
  { id: 'r2', dish_id: 'dish-low',  item_id: 'item-moc',  qty_per_serving: 1 },
  { id: 'r3', dish_id: 'dish-out',  item_id: 'item-dau-hu', qty_per_serving: 1 },
]

describe('getDishStatus', () => {
  it('returns available when all ingredients are sufficient', () => {
    expect(getDishStatus('dish-ok', recipes, items)).toBe('available')
  })

  it('returns low when any ingredient is at or below threshold', () => {
    expect(getDishStatus('dish-low', recipes, items)).toBe('low')
  })

  it('returns unavailable when any ingredient is 0', () => {
    expect(getDishStatus('dish-out', recipes, items)).toBe('unavailable')
  })

  it('returns available for dish with no recipe lines', () => {
    expect(getDishStatus('dish-no-recipe', recipes, items)).toBe('available')
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run
```
Expected: FAIL — "Cannot find module '../dish-availability'"

- [ ] **Step 3: Write `lib/dish-availability.ts`**

```ts
import type { Item, RecipeLine } from './types'

export type DishStatus = 'available' | 'low' | 'unavailable'

export function getDishStatus(
  dishId: string,
  recipeLines: RecipeLine[],
  items: Item[]
): DishStatus {
  const lines = recipeLines.filter(r => r.dish_id === dishId)
  if (lines.length === 0) return 'available'

  const itemMap = new Map(items.map(i => [i.id, i]))
  let status: DishStatus = 'available'

  for (const line of lines) {
    const item = itemMap.get(line.item_id)
    if (!item) continue
    if (item.quantity === 0) return 'unavailable'
    if (item.quantity <= item.low_threshold) status = 'low'
  }

  return status
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```
Expected: All tests PASS.

- [ ] **Step 5: Write `components/dish-row.tsx`**

```tsx
'use client'

import type { Dish } from '@/lib/types'
import type { DishStatus } from '@/lib/dish-availability'

interface Props {
  dish: Dish
  status: DishStatus
  qty: number
  onAdd: () => void
  onRemove: () => void
}

export function DishRow({ dish, status, qty, onAdd, onRemove }: Props) {
  const unavailable = status === 'unavailable'

  return (
    <div className={`flex items-center gap-3 py-3 border-b last:border-0 ${unavailable ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-base">{dish.name_vi}</p>
        {dish.name_en && <p className="text-sm text-gray-500">{dish.name_en}</p>}
        {status === 'low' && (
          <span className="text-xs font-semibold text-amber-600">Sắp hết nguyên liệu</span>
        )}
        {status === 'unavailable' && (
          <span className="text-xs font-semibold text-red-600">Hết nguyên liệu</span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {qty > 0 && (
          <button
            onClick={onRemove}
            className="w-11 h-11 rounded-lg border text-xl font-bold flex items-center justify-center"
            aria-label={`Giảm ${dish.name_vi}`}
          >
            −
          </button>
        )}
        {qty > 0 && <span className="w-6 text-center font-bold text-lg">{qty}</span>}
        <button
          onClick={onAdd}
          className="w-11 h-11 rounded-lg border text-xl font-bold flex items-center justify-center"
          aria-label={`Thêm ${dish.name_vi}`}
        >
          +
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Write full `app/(app)/dat-mon/page.tsx`**

```tsx
'use client'

import { useEffect, useState, useContext, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DishRow } from '@/components/dish-row'
import { BranchContext } from '../app-shell'
import { getDishStatus } from '@/lib/dish-availability'
import { calculateDecrements, applyStockChange } from '@/lib/stock'
import type { Dish, Item, RecipeLine, Table } from '@/lib/types'

export default function DatMonPage() {
  const { branchId } = useContext(BranchContext)
  const router = useRouter()
  const supabase = createClient()

  const [tables, setTables]     = useState<Table[]>([])
  const [dishes, setDishes]     = useState<Dish[]>([])
  const [items, setItems]       = useState<Item[]>([])
  const [recipes, setRecipes]   = useState<RecipeLine[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [quantities, setQuantities]       = useState<Record<string, number>>({})
  const [step, setStep]         = useState<'table' | 'dishes' | 'review'>('table')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]       = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [t, d, i, r] = await Promise.all([
        supabase.from('tables').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('dishes').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('items').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('recipe_lines').select('*'),
      ])
      if (t.data) setTables(t.data)
      if (d.data) setDishes(d.data)
      if (i.data) setItems(i.data)
      if (r.data) setRecipes(r.data)
    }
    load()
  }, [branchId])

  function adjustQty(dishId: string, delta: 1 | -1) {
    setQuantities(prev => ({
      ...prev,
      [dishId]: Math.max(0, (prev[dishId] ?? 0) + delta),
    }))
  }

  function handleAddUnavailable(dishId: string) {
    const confirmed = window.confirm('Món này hiện không đủ nguyên liệu. Vẫn muốn đặt?')
    if (confirmed) adjustQty(dishId, 1)
  }

  const orderLines = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([dish_id, qty]) => ({ dish_id, qty }))

  async function handleSubmit() {
    if (!selectedTable || orderLines.length === 0) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({ branch_id: branchId, table_id: selectedTable, status: 'pending', created_by: user.id })
      .select('id')
      .single()

    if (orderError || !order) { setSubmitting(false); return }

    await supabase.from('order_items').insert(
      orderLines.map(l => ({ order_id: order.id, dish_id: l.dish_id, qty: l.qty }))
    )

    const decrements = calculateDecrements(orderLines, recipes)
    const { floored } = await applyStockChange(decrements, 'order', user.id)

    setSubmitting(false)
    setQuantities({})
    setSelectedTable(null)
    setStep('table')

    if (floored.length > 0) {
      setToast('Kho không đủ — đã cập nhật về 0')
      setTimeout(() => setToast(null), 4000)
    }

    router.push('/kho')
  }

  return (
    <div className="max-w-lg mx-auto">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg z-50">
          {toast}
        </div>
      )}

      {step === 'table' && (
        <>
          <h2 className="text-lg font-bold mb-4">Chọn bàn / Select table</h2>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {tables.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTable(t.id); setStep('dishes') }}
                className="min-h-[56px] rounded-xl border-2 font-semibold text-sm"
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'dishes' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setStep('table')} className="text-blue-600 text-sm">← Bàn</button>
            <h2 className="text-lg font-bold">Chọn món / Select dishes</h2>
          </div>

          <div className="divide-y">
            {dishes.map(dish => {
              const status = getDishStatus(dish.id, recipes, items)
              const qty = quantities[dish.id] ?? 0
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  status={status}
                  qty={qty}
                  onAdd={() => status === 'unavailable' ? handleAddUnavailable(dish.id) : adjustQty(dish.id, 1)}
                  onRemove={() => adjustQty(dish.id, -1)}
                />
              )
            })}
          </div>

          {orderLines.length > 0 && (
            <div className="fixed bottom-14 left-0 right-0 p-4 bg-white border-t">
              <button
                onClick={() => setStep('review')}
                className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-base min-h-[44px]"
              >
                Xem lại đơn ({orderLines.reduce((s, l) => s + l.qty, 0)} món)
              </button>
            </div>
          )}
        </>
      )}

      {step === 'review' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setStep('dishes')} className="text-blue-600 text-sm">← Món</button>
            <h2 className="text-lg font-bold">Xác nhận đặt món</h2>
          </div>

          <div className="rounded-xl border p-4 mb-4 space-y-2">
            <p className="text-sm text-gray-500">Bàn: <span className="font-semibold text-gray-900">{tables.find(t => t.id === selectedTable)?.label}</span></p>
            {orderLines.map(l => {
              const dish = dishes.find(d => d.id === l.dish_id)!
              return (
                <div key={l.dish_id} className="flex justify-between">
                  <span>{dish.name_vi}</span>
                  <span className="font-semibold">×{l.qty}</span>
                </div>
              )
            })}
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold text-base disabled:opacity-50 min-h-[44px]"
          >
            {submitting ? 'Đang đặt…' : 'Xác nhận đặt món'}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Smoke-test in browser**

Log in as FOH, navigate to /dat-mon. Step through table → dish → review → submit. Verify order appears in Supabase `orders` table and stock decrements in `items`.

- [ ] **Step 8: Commit**

```bash
git add components/dish-row.tsx lib/dish-availability.ts lib/__tests__/dish-availability.test.ts app/\(app\)/dat-mon/
git commit -m "feat: place order screen with table selection, dish picker, and stock decrement"
```

---

### Task 10: Active Orders screen (Đang chạy)

**Files:**
- Create: `components/order-card.tsx`
- Modify: `app/(app)/dang-chay/page.tsx`

- [ ] **Step 1: Write test for urgency pulse logic**

Create `lib/__tests__/order-urgency.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test — expect failure**

```bash
npm run test:run
```
Expected: FAIL — "Cannot find module '../order-urgency'"

- [ ] **Step 3: Write `lib/order-urgency.ts`**

```ts
const URGENCY_MS = 5 * 60 * 1000

export function isUrgent(readyAt: string | null): boolean {
  if (!readyAt) return false
  return Date.now() - new Date(readyAt).getTime() >= URGENCY_MS
}

export function elapsedLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'vừa xong'
  return `${minutes} phút trước`
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```
Expected: All tests PASS.

- [ ] **Step 5: Write `components/order-card.tsx`**

```tsx
'use client'

import { isUrgent, elapsedLabel } from '@/lib/order-urgency'
import type { OrderWithDetails } from '@/lib/types'

interface Props {
  order: OrderWithDetails
  onCancel: (orderId: string) => void
  onDeliver: (orderId: string) => void
}

export function OrderCard({ order, onCancel, onDeliver }: Props) {
  const urgent = order.status === 'ready' && isUrgent(order.ready_at)

  return (
    <article
      className={`rounded-xl border p-4 space-y-3 ${
        urgent ? 'border-red-400 animate-pulse' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-bold text-base">{order.table.label}</p>
          <p className="text-sm text-gray-500">{elapsedLabel(order.created_at)}</p>
        </div>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            order.status === 'ready'
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {order.status === 'ready' ? 'Xong' : 'Đang nấu'}
        </span>
      </div>

      <ul className="space-y-1">
        {order.order_items.map(oi => (
          <li key={oi.id} className="text-sm flex justify-between">
            <span>{oi.dish.name_vi}</span>
            <span className="font-semibold">×{oi.qty}</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onCancel(order.id)}
          className="flex-1 min-h-[44px] rounded-lg border border-red-300 text-red-600 text-sm font-semibold"
        >
          Hủy
        </button>
        {order.status === 'ready' && (
          <button
            onClick={() => onDeliver(order.id)}
            className="flex-1 min-h-[44px] rounded-lg bg-green-600 text-white text-sm font-semibold"
          >
            Đã mang ra ✓
          </button>
        )}
      </div>
    </article>
  )
}
```

- [ ] **Step 6: Write full `app/(app)/dang-chay/page.tsx`**

```tsx
'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { OrderCard } from '@/components/order-card'
import { BranchContext } from '../app-shell'
import { calculateDecrements, applyStockChange } from '@/lib/stock'
import type { OrderWithDetails } from '@/lib/types'

export default function DangChayPage() {
  const { branchId } = useContext(BranchContext)
  const [orders, setOrders] = useState<OrderWithDetails[]>([])
  const supabase = createClient()

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        table:tables(label),
        order_items(*, dish:dishes(name_vi, name_en))
      `)
      .eq('branch_id', branchId)
      .in('status', ['pending', 'ready'])
      .order('created_at', { ascending: true })
    if (data) setOrders(data as OrderWithDetails[])
  }

  useEffect(() => {
    loadOrders()

    const channel = supabase
      .channel(`active-orders-${branchId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `branch_id=eq.${branchId}`,
      }, () => loadOrders())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  async function handleCancel(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    if (!order || !['pending', 'ready'].includes(order.status)) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)

    const orderLines = order.order_items.map(oi => ({ dish_id: oi.dish_id, qty: oi.qty }))
    const { data: recipes } = await supabase.from('recipe_lines').select('*')
    if (recipes) {
      const reversals = calculateDecrements(orderLines, recipes, true)
      await applyStockChange(reversals, 'cancellation', user.id)
    }
  }

  async function handleDeliver(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    if (!order || order.status !== 'ready') return
    await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
  }

  if (orders.length === 0) {
    return (
      <p className="text-center text-gray-400 mt-16">Không có đơn nào đang chạy</p>
    )
  }

  return (
    <div className="space-y-3 max-w-lg mx-auto">
      {orders.map(order => (
        <OrderCard
          key={order.id}
          order={order}
          onCancel={handleCancel}
          onDeliver={handleDeliver}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Smoke-test in browser**

Place an order via /dat-mon, navigate to /dang-chay. Verify order card appears. Test Hủy (check stock is restored) and verify Realtime updates when kitchen marks it ready.

- [ ] **Step 8: Commit**

```bash
git add components/order-card.tsx lib/order-urgency.ts lib/__tests__/order-urgency.test.ts app/\(app\)/dang-chay/
git commit -m "feat: active orders screen with cancel + deliver and urgency pulse"
```

---

## Phase 4: Kitchen

---

### Task 11: Kitchen Order Queue

**Files:**
- Modify: `app/kitchen/page.tsx`

- [ ] **Step 1: Write full `app/kitchen/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { elapsedLabel } from '@/lib/order-urgency'
import type { OrderWithDetails } from '@/lib/types'

export default function KitchenPage() {
  const [orders, setOrders]     = useState<OrderWithDetails[]>([])
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('branch_id')
        .eq('id', user.id)
        .single()
      if (!profile) return

      setBranchId(profile.branch_id)

      const { data: branch } = await supabase
        .from('branches')
        .select('name')
        .eq('id', profile.branch_id)
        .single()
      if (branch) setBranchName(branch.name)
    }
    init()
  }, [])

  async function loadOrders(bid: string) {
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
    loadOrders(branchId)

    const channel = supabase
      .channel(`kitchen-orders-${branchId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `branch_id=eq.${branchId}`,
      }, () => loadOrders(branchId))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  async function handleXong(orderId: string) {
    const order = orders.find(o => o.id === orderId)
    if (!order || order.status !== 'pending') return
    await supabase
      .from('orders')
      .update({ status: 'ready', ready_at: new Date().toISOString() })
      .eq('id', orderId)
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b bg-white">
        <span className="font-bold text-lg">Bếp</span>
        {branchName && <span className="text-sm text-gray-500">{branchName}</span>}
      </header>

      <main className="p-4 space-y-3 max-w-lg mx-auto">
        {orders.length === 0 ? (
          <p className="text-center text-gray-400 mt-16">Không có đơn nào</p>
        ) : (
          orders.map(order => (
            <article key={order.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-base">{order.table.label}</p>
                  <p className="text-sm text-gray-500">{elapsedLabel(order.created_at)}</p>
                </div>
              </div>

              <ul className="space-y-1">
                {order.order_items.map(oi => (
                  <li key={oi.id} className="flex justify-between text-sm">
                    <span>{oi.dish.name_vi}</span>
                    <span className="font-semibold">×{oi.qty}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleXong(order.id)}
                className="w-full min-h-[44px] rounded-xl bg-green-600 text-white font-semibold text-base"
              >
                Xong ✓
              </button>
            </article>
          ))
        )}
      </main>
    </>
  )
}
```

- [ ] **Step 2: Smoke-test end-to-end flow**

1. FOH logs in → places an order
2. Kitchen logs in on a separate browser/tab → sees the order appear in real time
3. Kitchen taps Xong
4. FOH's Đang chạy screen updates: pending card becomes ready card
5. FOH taps Đã mang ra → card disappears

- [ ] **Step 3: Commit**

```bash
git add app/kitchen/
git commit -m "feat: kitchen order queue with realtime and Xong button"
```

---

## Phase 5: Manager Settings

---

### Task 12: Manager — Ingredients + Dishes CRUD

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Write full `app/(app)/settings/page.tsx`**

This is a long CRUD page. Structure it with 4 tabs: Nguyên liệu | Món ăn | Công thức | Bàn.

```tsx
'use client'

import { useEffect, useState, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BranchContext } from '../app-shell'
import type { Item, Dish, RecipeLine, Table } from '@/lib/types'

type Tab = 'items' | 'dishes' | 'recipes' | 'tables'

export default function SettingsPage() {
  const { branchId } = useContext(BranchContext)
  const [tab, setTab] = useState<Tab>('items')
  const supabase = createClient()

  // -- Items state
  const [items, setItems]   = useState<Item[]>([])
  const [newItem, setNewItem] = useState({ name_vi: '', name_en: '', unit: '', low_threshold: 3 })

  // -- Dishes state
  const [dishes, setDishes] = useState<Dish[]>([])
  const [newDish, setNewDish] = useState({ name_vi: '', name_en: '' })

  // -- Recipes state
  const [recipes, setRecipes]         = useState<RecipeLine[]>([])
  const [selectedDishId, setSelectedDishId] = useState<string | null>(null)
  const [newLine, setNewLine] = useState({ item_id: '', qty_per_serving: 1 })

  // -- Tables state
  const [tables, setTables]   = useState<Table[]>([])
  const [newTable, setNewTable] = useState({ label: '' })

  useEffect(() => {
    async function load() {
      const [i, d, r, t] = await Promise.all([
        supabase.from('items').select('*').eq('branch_id', branchId).order('name_vi'),
        supabase.from('dishes').select('*').eq('branch_id', branchId).order('name_vi'),
        supabase.from('recipe_lines').select('*'),
        supabase.from('tables').select('*').eq('branch_id', branchId).order('label'),
      ])
      if (i.data) setItems(i.data)
      if (d.data) setDishes(d.data)
      if (r.data) setRecipes(r.data)
      if (t.data) setTables(t.data)
    }
    load()
  }, [branchId])

  // -- Item actions
  async function addItem() {
    if (!newItem.name_vi.trim()) return
    const { data } = await supabase.from('items')
      .insert({ ...newItem, branch_id: branchId, quantity: 0 })
      .select().single()
    if (data) { setItems(prev => [...prev, data]); setNewItem({ name_vi: '', name_en: '', unit: '', low_threshold: 3 }) }
  }

  async function deactivateItem(id: string) {
    await supabase.from('items').update({ is_active: false }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, is_active: false } : i))
  }

  async function updateItem(id: string, field: keyof Item, value: string | number) {
    await supabase.from('items').update({ [field]: value }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  // -- Dish actions
  async function addDish() {
    if (!newDish.name_vi.trim()) return
    const { data } = await supabase.from('dishes')
      .insert({ ...newDish, branch_id: branchId })
      .select().single()
    if (data) { setDishes(prev => [...prev, data]); setNewDish({ name_vi: '', name_en: '' }) }
  }

  async function deactivateDish(id: string) {
    await supabase.from('dishes').update({ is_active: false }).eq('id', id)
    setDishes(prev => prev.map(d => d.id === id ? { ...d, is_active: false } : d))
  }

  // -- Recipe actions
  async function addRecipeLine() {
    if (!selectedDishId || !newLine.item_id) return
    const { data } = await supabase.from('recipe_lines')
      .insert({ dish_id: selectedDishId, item_id: newLine.item_id, qty_per_serving: newLine.qty_per_serving })
      .select().single()
    if (data) { setRecipes(prev => [...prev, data]); setNewLine({ item_id: '', qty_per_serving: 1 }) }
  }

  async function deleteRecipeLine(id: string) {
    await supabase.from('recipe_lines').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  async function updateRecipeQty(id: string, qty: number) {
    await supabase.from('recipe_lines').update({ qty_per_serving: qty }).eq('id', id)
    setRecipes(prev => prev.map(r => r.id === id ? { ...r, qty_per_serving: qty } : r))
  }

  // -- Table actions
  async function addTable() {
    if (!newTable.label.trim()) return
    const { data } = await supabase.from('tables')
      .insert({ label: newTable.label, branch_id: branchId })
      .select().single()
    if (data) { setTables(prev => [...prev, data]); setNewTable({ label: '' }) }
  }

  async function deactivateTable(id: string) {
    await supabase.from('tables').update({ is_active: false }).eq('id', id)
    setTables(prev => prev.map(t => t.id === id ? { ...t, is_active: false } : t))
  }

  async function updateTableLabel(id: string, label: string) {
    await supabase.from('tables').update({ label }).eq('id', id)
    setTables(prev => prev.map(t => t.id === id ? { ...t, label } : t))
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'items',   label: 'Nguyên liệu' },
    { key: 'dishes',  label: 'Món ăn' },
    { key: 'recipes', label: 'Công thức' },
    { key: 'tables',  label: 'Bàn' },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Cài đặt / Settings</h1>

      {/* Tab bar */}
      <div className="flex border-b mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Items tab */}
      {tab === 'items' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input placeholder="Tên (VI) *" value={newItem.name_vi}
              onChange={e => setNewItem(p => ({ ...p, name_vi: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm col-span-2 md:col-span-1" />
            <input placeholder="Name (EN)" value={newItem.name_en}
              onChange={e => setNewItem(p => ({ ...p, name_en: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Đơn vị (phần...)" value={newItem.unit}
              onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm" />
            <input type="number" placeholder="Ngưỡng thấp" value={newItem.low_threshold}
              onChange={e => setNewItem(p => ({ ...p, low_threshold: +e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm" />
            <button onClick={addItem}
              className="col-span-2 md:col-span-4 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold min-h-[44px]">
              + Thêm nguyên liệu
            </button>
          </div>

          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Tên</th><th className="pb-2">Đơn vị</th>
              <th className="pb-2">Ngưỡng</th><th className="pb-2">Trạng thái</th><th />
            </tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2">
                    <div className="font-medium">{item.name_vi}</div>
                    {item.name_en && <div className="text-gray-500 text-xs">{item.name_en}</div>}
                  </td>
                  <td className="py-2">
                    <input value={item.unit} onChange={e => updateItem(item.id, 'unit', e.target.value)}
                      className="border rounded px-2 py-1 w-20 text-xs" />
                  </td>
                  <td className="py-2">
                    <input type="number" value={item.low_threshold}
                      onChange={e => updateItem(item.id, 'low_threshold', +e.target.value)}
                      className="border rounded px-2 py-1 w-16 text-xs" />
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {item.is_active ? 'Hoạt động' : 'Tắt'}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {item.is_active && (
                      <button onClick={() => deactivateItem(item.id)}
                        className="text-xs text-red-500 hover:underline">
                        Tắt
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dishes tab */}
      {tab === 'dishes' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input placeholder="Tên món (VI) *" value={newDish.name_vi}
              onChange={e => setNewDish(p => ({ ...p, name_vi: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <input placeholder="Name (EN)" value={newDish.name_en}
              onChange={e => setNewDish(p => ({ ...p, name_en: e.target.value }))}
              className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={addDish}
              className="bg-blue-600 text-white rounded-lg px-4 text-sm font-semibold min-h-[44px]">
              + Thêm
            </button>
          </div>

          <ul className="divide-y">
            {dishes.map(dish => (
              <li key={dish.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{dish.name_vi}</p>
                  {dish.name_en && <p className="text-sm text-gray-500">{dish.name_en}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${dish.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {dish.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                  {dish.is_active && (
                    <button onClick={() => deactivateDish(dish.id)} className="text-xs text-red-500 hover:underline">Tắt</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recipes tab */}
      {tab === 'recipes' && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Chọn món ăn</label>
            <select value={selectedDishId ?? ''} onChange={e => setSelectedDishId(e.target.value || null)}
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[44px]">
              <option value="">-- Chọn món --</option>
              {dishes.filter(d => d.is_active).map(d => (
                <option key={d.id} value={d.id}>{d.name_vi}</option>
              ))}
            </select>
          </div>

          {selectedDishId && (
            <>
              <ul className="divide-y">
                {recipes.filter(r => r.dish_id === selectedDishId).map(r => {
                  const item = items.find(i => i.id === r.item_id)
                  return (
                    <li key={r.id} className="py-2 flex items-center gap-3">
                      <span className="flex-1 text-sm">{item?.name_vi ?? r.item_id}</span>
                      <input type="number" value={r.qty_per_serving} min={0.5} step={0.5}
                        onChange={e => updateRecipeQty(r.id, +e.target.value)}
                        className="border rounded px-2 py-1 w-20 text-sm" />
                      <span className="text-sm text-gray-500">{item?.unit}</span>
                      <button onClick={() => deleteRecipeLine(r.id)}
                        className="text-red-500 text-sm hover:underline">Xóa</button>
                    </li>
                  )
                })}
              </ul>

              <div className="flex gap-2">
                <select value={newLine.item_id} onChange={e => setNewLine(p => ({ ...p, item_id: e.target.value }))}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm min-h-[44px]">
                  <option value="">-- Chọn nguyên liệu --</option>
                  {items.filter(i => i.is_active).map(i => (
                    <option key={i.id} value={i.id}>{i.name_vi}</option>
                  ))}
                </select>
                <input type="number" value={newLine.qty_per_serving} min={0.5} step={0.5}
                  onChange={e => setNewLine(p => ({ ...p, qty_per_serving: +e.target.value }))}
                  className="w-20 border rounded-lg px-3 py-2 text-sm" />
                <button onClick={addRecipeLine}
                  className="bg-blue-600 text-white rounded-lg px-4 text-sm font-semibold min-h-[44px]">
                  + Thêm
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tables tab */}
      {tab === 'tables' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input placeholder="Tên bàn (Bàn 1, Mang về...)" value={newTable.label}
              onChange={e => setNewTable({ label: e.target.value })}
              className="flex-1 border rounded-lg px-3 py-2 text-sm" />
            <button onClick={addTable}
              className="bg-blue-600 text-white rounded-lg px-4 text-sm font-semibold min-h-[44px]">
              + Thêm
            </button>
          </div>

          <ul className="divide-y">
            {tables.map(t => (
              <li key={t.id} className="py-2 flex items-center gap-3">
                <input value={t.label} onChange={e => updateTableLabel(t.id, e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm" />
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.is_active ? 'Hoạt động' : 'Tắt'}
                </span>
                {t.is_active && (
                  <button onClick={() => deactivateTable(t.id)} className="text-xs text-red-500 hover:underline">Tắt</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Smoke-test each settings section**

Log in as manager, navigate to /settings:
- Add a new ingredient → verify it appears in the Kho dashboard
- Add a new dish → verify it appears in Đặt món
- Add recipe lines for a dish → place an order for that dish → verify correct ingredients decrement
- Add a new table → verify it appears in Đặt món table grid

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/settings/
git commit -m "feat: manager settings — CRUD for ingredients, dishes, recipes, and tables"
```

---

## Phase 6: Deploy

---

### Task 13: Vercel deployment

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin <your-github-url>
git push -u origin main
```

- [ ] **Step 2: Import project in Vercel**

Go to vercel.com → New Project → import the GitHub repo.

- [ ] **Step 3: Set environment variables in Vercel**

In Vercel project settings → Environment Variables, add:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 4: Deploy and smoke-test production URL**

Trigger a deploy. Open the production URL on a tablet browser. Test the full flow: login → inventory → place order → kitchen marks ready → FOH delivers.

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: production deployment verified"
```

---

## Self-Review Checklist (spec vs plan)

| Spec requirement | Covered by |
|-----------------|-----------|
| Realtime on items (Kho) | Task 8 — Realtime subscription in kho/page.tsx |
| Realtime on orders (Đang chạy + Kitchen) | Tasks 10, 11 |
| Realtime badge (ready count) | Task 6 — AppShell subscription |
| Stock decrement on order submit | Task 9 — calculateDecrements + applyStockChange |
| Stock reversal on cancel | Task 10 — handleCancel with calculateDecrements(reversal=true) |
| ready_at set on Xong | Task 11 — handleXong sets ready_at |
| Urgency pulse (≥5 min) | Task 10 — isUrgent() in order-card.tsx |
| Dish greyed out (any ingredient = 0) | Task 9 — getDishStatus('unavailable') |
| Dish amber warning (any ingredient low) | Task 9 — getDishStatus('low') in dish-row.tsx |
| Floor at 0 toast | Task 9 — floored check after applyStockChange |
| Branch selector (FOH + manager) | Task 6 — BranchSelector in AppShell |
| Kitchen static branch label | Task 11 — branchName label, no switcher |
| Role-based redirect on login | Task 5 — handleSubmit checks profile.role |
| Manager-only settings gear icon | Task 6 — role === 'manager' guard in AppShell |
| Min touch target 44px | All buttons use min-h-[44px] or w-11 h-11 |
| md: as primary breakpoint | Grid uses grid-cols-2 md:grid-cols-2 lg:grid-cols-3 |
| items.is_active migration | Task 2 — 002_alter_existing.sql |
| orders.ready_at migration | Task 2 — 002_alter_existing.sql |
| orders FK to tables | Task 2 — 002_alter_existing.sql |
| apply_stock_change RPC | Task 2 — 001_new_tables.sql |
| DESIGN.md gate | Explicit gate between Task 5 and Task 6 |
