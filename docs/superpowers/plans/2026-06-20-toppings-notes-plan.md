# Toppings + Ingredient-Removal Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add toppings (dishes flagged `is_topping`) and per-order-line ingredient-removal notes, surfaced via a side-drawer customization panel that opens on every dish-card tap and replaces today's instant-add.

**Architecture:** Toppings are ordinary dishes — same price/recipe/stock/billing pipeline, just flagged. A new pure function ranks a dish's toppings by shared-ingredient relevance. A new `ToppingPanel` component lets staff add toppings and a note, then confirms exactly one more unit of the base dish. `DishCard`'s tap target changes from instant-add to opening this panel. Notes (`order_items.note`) flow through to every screen that already renders order_items — kitchen, Đang chạy, and the register (which required also threading the field through `lib/billing.ts`'s bill aggregation).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-20-toppings-notes-design.md` — read this for full rationale; this plan only implements it.

---

### Task 1: Database migration + types

**Files:**
- Create: `supabase/migrations/007_topping_and_notes.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/007_topping_and_notes.sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_topping boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS note text;
```

- [ ] **Step 2: Run it in Supabase**

This step requires the human user to paste the SQL into the Supabase Dashboard SQL Editor — skip it if you're a subagent, note it's pending.

- [ ] **Step 3: Update `lib/types.ts`**

Add `is_topping: boolean` to the `Dish` interface:
```ts
export interface Dish {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  price: number | string
  category: string | null
  image_url: string | null
  is_topping: boolean
  is_active: boolean
  created_at: string
}
```

Add `note: string | null` to the `OrderItem` interface:
```ts
export interface OrderItem {
  id: string
  order_id: string
  dish_id: string
  qty: number
  price_at_order: number | string
  note: string | null
}
```

- [ ] **Step 4: Verify the build and test suite**

Run: `npm run build` then `npm run test:run`
Expected: build succeeds. `OrderItem.note` is a new *required* field on the type (even though its value is nullable, the property itself must be present on any literal typed as `OrderItem`) — check whether this breaks any existing test fixture that constructs an `order_items` array inline (e.g. `lib/__tests__/billing.test.ts` builds `OrderWithDetails` fixtures with inline `order_items: [{ id, order_id, dish_id, qty, price_at_order, dish: {...} }]` literals, missing `note`). If `npm run test:run` reports a type error there, add `note: null` to each such literal so it still satisfies the type. Do NOT change any test's assertions — only add the missing field to fixture literals that need it to compile.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/007_topping_and_notes.sql lib/types.ts lib/__tests__/billing.test.ts
git commit -m "feat: add is_topping and order item notes columns"
```

(Only include `lib/__tests__/billing.test.ts` in the `git add` if Step 4 actually required changing it — if the build/tests were already green without touching it, omit it from the commit.)

---

### Task 2: Topping relevance sorting (TDD)

**Files:**
- Create: `lib/topping-relevance.ts`
- Create: `lib/__tests__/topping-relevance.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/topping-relevance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sortToppingsByRelevance } from '../topping-relevance'
import type { Dish, RecipeLine } from '../types'

const baseDish = {
  branch_id: '', name_en: null, price: 0, category: null, image_url: null, is_active: true, created_at: '',
}

const bunRieu: Dish = { ...baseDish, id: 'bun-rieu', name_vi: 'Bún riêu', is_topping: false }
const bunThem: Dish = { ...baseDish, id: 'bun-them', name_vi: 'Bún thêm', is_topping: true }
const dauHuThem: Dish = { ...baseDish, id: 'dau-hu-them', name_vi: 'Đậu hũ thêm', is_topping: true }
const trungVitLon: Dish = { ...baseDish, id: 'trung-vit-lon', name_vi: 'Trứng vịt lộn', is_topping: true }
const noRecipeDish: Dish = { ...baseDish, id: 'no-recipe-dish', name_vi: 'Trà đá', is_topping: false }

const recipes: RecipeLine[] = [
  { id: 'r1', dish_id: 'bun-rieu', item_id: 'item-bun', qty_per_serving: 1 },
  { id: 'r2', dish_id: 'bun-rieu', item_id: 'item-dau-hu', qty_per_serving: 1 },
  { id: 'r3', dish_id: 'bun-them', item_id: 'item-bun', qty_per_serving: 1 },
  { id: 'r4', dish_id: 'dau-hu-them', item_id: 'item-dau-hu', qty_per_serving: 1 },
  // trung-vit-lon and no-recipe-dish have no recipe line at all
]

describe('sortToppingsByRelevance', () => {
  it('sorts toppings sharing an ingredient with the dish before ones that do not', () => {
    const result = sortToppingsByRelevance(bunRieu, [trungVitLon, bunThem], recipes)
    expect(result.map(t => t.id)).toEqual(['bun-them', 'trung-vit-lon'])
  })

  it('preserves relative order within the relevant group', () => {
    const result = sortToppingsByRelevance(bunRieu, [dauHuThem, bunThem], recipes)
    expect(result.map(t => t.id)).toEqual(['dau-hu-them', 'bun-them'])
  })

  it('preserves relative order within the other group', () => {
    const otherTopping: Dish = { ...baseDish, id: 'other-topping', name_vi: 'Khác', is_topping: true }
    const result = sortToppingsByRelevance(bunRieu, [trungVitLon, otherTopping], recipes)
    expect(result.map(t => t.id)).toEqual(['trung-vit-lon', 'other-topping'])
  })

  it('puts every topping in the other group when the dish has no recipe lines', () => {
    const result = sortToppingsByRelevance(noRecipeDish, [bunThem, trungVitLon], recipes)
    expect(result.map(t => t.id)).toEqual(['bun-them', 'trung-vit-lon'])
  })

  it('returns an empty array when there are no toppings to sort', () => {
    expect(sortToppingsByRelevance(bunRieu, [], recipes)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run`
Expected: FAIL — "Cannot find module '../topping-relevance'"

- [ ] **Step 3: Write `lib/topping-relevance.ts`**

```ts
import type { Dish, RecipeLine } from './types'

/**
 * Pure function — no DB calls. Returns `toppings` reordered so any topping
 * sharing at least one ingredient with `dish`'s own recipe sorts before
 * every topping that doesn't, preserving relative order within each group.
 */
export function sortToppingsByRelevance(
  dish: Dish,
  toppings: Dish[],
  recipeLines: RecipeLine[],
): Dish[] {
  const dishItemIds = new Set(
    recipeLines.filter(r => r.dish_id === dish.id).map(r => r.item_id)
  )

  function isRelevant(topping: Dish): boolean {
    return recipeLines.some(r => r.dish_id === topping.id && dishItemIds.has(r.item_id))
  }

  const relevant = toppings.filter(isRelevant)
  const other = toppings.filter(t => !isRelevant(t))
  return [...relevant, ...other]
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: All 5 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/topping-relevance.ts lib/__tests__/topping-relevance.test.ts
git commit -m "feat: add topping relevance sorting by shared ingredient"
```

---

### Task 3: "Là món gọi thêm" checkbox in Settings

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Add `is_topping` to the new-dish state**

Find:
```tsx
  const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '', price: 0, category: '' })
```
Replace with:
```tsx
  const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '', price: 0, category: '', is_topping: false })
```

- [ ] **Step 2: Reset `is_topping` after adding a dish, and add an `updateDishIsTopping` handler**

Find:
```tsx
  async function addDish() {
    if (!newDish.name_vi.trim()) return

    let image_url: string | null = null
    if (newDishImage) {
      try {
        image_url = await uploadDishImage(newDishImage)
      } catch {
        alert('Không thể tải ảnh lên. Món ăn sẽ được lưu không có ảnh.')
      }
    }

    const { data } = await supabase.from('dishes')
      .insert({ ...newDish, category: newDish.category || null, branch_id: branchId, image_url })
      .select().single()
    if (data) {
      setDishes(p => [...p, data])
      setNewDish({ name_vi: '', name_en: '', price: 0, category: '' })
      setNewDishImage(null)
    }
  }
```
Replace with:
```tsx
  async function addDish() {
    if (!newDish.name_vi.trim()) return

    let image_url: string | null = null
    if (newDishImage) {
      try {
        image_url = await uploadDishImage(newDishImage)
      } catch {
        alert('Không thể tải ảnh lên. Món ăn sẽ được lưu không có ảnh.')
      }
    }

    const { data } = await supabase.from('dishes')
      .insert({ ...newDish, category: newDish.category || null, branch_id: branchId, image_url })
      .select().single()
    if (data) {
      setDishes(p => [...p, data])
      setNewDish({ name_vi: '', name_en: '', price: 0, category: '', is_topping: false })
      setNewDishImage(null)
    }
  }

  async function updateDishIsTopping(id: string, is_topping: boolean) {
    await supabase.from('dishes').update({ is_topping }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, is_topping } : d))
  }
```

- [ ] **Step 3: Add the checkbox to the add-dish form**

Find:
```tsx
            <input type="file" accept="image/*"
              onChange={e => setNewDishImage(e.target.files?.[0] ?? null)}
              className="text-label-en" />
            <button onClick={addDish} className={btnPrimary}>+ Thêm</button>
```
Replace with:
```tsx
            <input type="file" accept="image/*"
              onChange={e => setNewDishImage(e.target.files?.[0] ?? null)}
              className="text-label-en" />
            <label className="flex items-center gap-1 text-label-en text-on-surface-variant">
              <input type="checkbox" checked={newDish.is_topping}
                onChange={e => setNewDish(p => ({ ...p, is_topping: e.target.checked }))} />
              Món gọi thêm
            </label>
            <button onClick={addDish} className={btnPrimary}>+ Thêm</button>
```

- [ ] **Step 4: Add the checkbox to the dish list**

Find:
```tsx
                  <label className="text-label-en text-primary font-bold cursor-pointer">
                    Đổi ảnh
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) updateDishImage(dish.id, f) }} />
                  </label>
                  <span className={dish.is_active ? badgeActive : badgeInactive}>
```
Replace with:
```tsx
                  <label className="text-label-en text-primary font-bold cursor-pointer">
                    Đổi ảnh
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) updateDishImage(dish.id, f) }} />
                  </label>
                  <label className="flex items-center gap-1 text-label-en text-on-surface-variant">
                    <input type="checkbox" checked={dish.is_topping}
                      onChange={e => updateDishIsTopping(dish.id, e.target.checked)} />
                    Gọi thêm
                  </label>
                  <span className={dish.is_active ? badgeActive : badgeInactive}>
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/settings/page.tsx
git commit -m "feat: add is_topping checkbox to Settings dish CRUD"
```

---

### Task 4: ToppingPanel component

**Files:**
- Create: `components/topping-panel.tsx`

Note: this is a new, standalone, unreferenced component — nothing imports it yet, so the build stays green regardless. Task 5 wires it in.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { num } from '@/lib/types'
import type { Dish } from '@/lib/types'

interface ConfirmResult {
  toppingQuantities: Record<string, number>
  note: string
}

interface Props {
  dish: Dish
  toppings: Dish[]
  initialNote: string
  onConfirm: (result: ConfirmResult) => void
  onClose: () => void
}

export function ToppingPanel({ dish, toppings, initialNote, onConfirm, onClose }: Props) {
  const [toppingQuantities, setToppingQuantities] = useState<Record<string, number>>({})
  const [note, setNote] = useState(initialNote)

  function adjustTopping(toppingId: string, delta: 1 | -1) {
    setToppingQuantities(prev => ({
      ...prev,
      [toppingId]: Math.max(0, (prev[toppingId] ?? 0) + delta),
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface h-full overflow-y-auto p-stack-lg shadow-lg">
        <h3 className="text-headline-md font-bold text-on-surface mb-1">{dish.name_vi}</h3>
        <p className="text-label-en text-on-surface-variant mb-stack-lg">Thêm món / Ghi chú</p>

        {toppings.length > 0 && (
          <ul className="divide-y divide-outline-variant mb-stack-lg">
            {toppings.map(topping => {
              const qty = toppingQuantities[topping.id] ?? 0
              return (
                <li key={topping.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-label-vi font-bold text-on-surface truncate">{topping.name_vi}</p>
                    <p className="text-label-en text-on-surface-variant">{num(topping.price).toLocaleString('vi-VN')}đ</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {qty > 0 && (
                      <>
                        <button
                          onClick={() => adjustTopping(topping.id, -1)}
                          className="w-touch-target-min h-touch-target-min rounded-lg border border-outline-variant text-primary text-xl font-bold flex items-center justify-center"
                          aria-label={`Giảm ${topping.name_vi}`}
                        >
                          −
                        </button>
                        <span className="w-6 text-center font-bold text-on-surface">{qty}</span>
                      </>
                    )}
                    <button
                      onClick={() => adjustTopping(topping.id, 1)}
                      className="w-touch-target-min h-touch-target-min rounded-lg bg-primary text-on-primary text-xl font-bold flex items-center justify-center"
                      aria-label={`Thêm ${topping.name_vi}`}
                    >
                      +
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <label className="text-label-en text-on-surface-variant block mb-1">Ghi chú (VD: không đậu hũ)</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Nhập ghi chú..."
          className="w-full border border-outline-variant rounded-lg px-3 py-2 text-label-vi bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary min-h-touch-target-min mb-stack-lg"
        />

        <button
          onClick={() => onConfirm({ toppingQuantities, note })}
          className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md"
        >
          Xong
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds — this component isn't imported anywhere yet, so nothing else can break.

- [ ] **Step 3: Commit**

```bash
git add components/topping-panel.tsx
git commit -m "feat: add ToppingPanel component for dish customization"
```

---

### Task 5: Replace instant-add with the panel in Đặt món

**Files:**
- Modify: `components/dish-card.tsx`
- Modify: `app/(app)/dat-mon/page.tsx`

Both files are modified in this one task, not split across two — `DishCard`'s tap behavior and `dat-mon/page.tsx`'s consumption of it are inseparable; landing the prop-contract change without its only caller's matching update would leave the build broken for a commit, exactly the failure mode self-review caught in two earlier plans this session.

- [ ] **Step 1: Replace `components/dish-card.tsx`**

Replace its entire contents:

```tsx
'use client'

import { useState } from 'react'
import type { Dish } from '@/lib/types'
import type { DishStatus } from '@/lib/dish-availability'

interface Props {
  dish: Dish
  status: DishStatus
  qty: number
  atMax: boolean
  onCardTap: () => void
  onRemove: () => void
}

export function DishCard({ dish, status, qty, atMax, onCardTap, onRemove }: Props) {
  const unavailable = status === 'unavailable'
  const [imageError, setImageError] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCardTap}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardTap() }
      }}
      aria-label={`Tùy chọn ${dish.name_vi}`}
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden cursor-pointer select-none active:scale-[0.98] transition-transform ${unavailable ? 'opacity-50' : ''}`}
    >
      <div className="aspect-[4/3] bg-surface-container-high flex items-center justify-center">
        {dish.image_url && !imageError ? (
          <img
            src={dish.image_url}
            alt={dish.name_vi}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="material-symbols-outlined text-[32px] text-on-surface-variant" aria-hidden>
            restaurant
          </span>
        )}
      </div>

      <div className="p-stack-md">
        <p className="text-label-vi font-bold text-on-surface truncate">{dish.name_vi}</p>
        {dish.name_en && (
          <p className="text-label-en text-on-surface-variant truncate">{dish.name_en}</p>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex-1 min-w-0">
            {status === 'low' && (
              <p className="text-label-en font-bold text-tertiary">Sắp hết nguyên liệu</p>
            )}
            {status === 'unavailable' && (
              <p className="text-label-en font-bold text-error">Hết nguyên liệu</p>
            )}
            {!unavailable && atMax && (
              <p className="text-label-en font-bold text-tertiary">Đã đạt giới hạn kho</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {qty > 0 && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); onRemove() }}
                  className="w-touch-target-min h-touch-target-min rounded-lg border border-outline-variant bg-surface-container-high text-primary text-xl font-bold flex items-center justify-center"
                  aria-label={`Giảm ${dish.name_vi}`}
                >
                  −
                </button>
                <span className="w-7 text-center font-bold text-[18px] text-on-surface">{qty}</span>
              </>
            )}
            {!atMax && (
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
                add_circle
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

Note: only the prop name (`onAdd` → `onCardTap`) and what `onClick`/`onKeyDown` call changed — the `aria-label` changed from "Thêm" (add) to "Tùy chọn" (customize) since tapping no longer adds directly, it opens the panel. Everything else (image fallback, status text, the "−" decrement button with its `stopPropagation`, the decorative add icon) is byte-for-byte unchanged.

- [ ] **Step 2: Replace `app/(app)/dat-mon/page.tsx`**

Replace its entire contents:

```tsx
'use client'

import { useEffect, useState, useContext } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DishCard } from '@/components/dish-card'
import { ToppingPanel } from '@/components/topping-panel'
import { BranchContext } from '../app-shell'
import { getDishStatus, getMaxOrderableQty } from '@/lib/dish-availability'
import { sortToppingsByRelevance } from '@/lib/topping-relevance'
import { calculateDecrements, applyStockChange } from '@/lib/stock'
import { num } from '@/lib/types'
import type { Dish, Item, RecipeLine, Table } from '@/lib/types'

type Step = 'table' | 'dishes' | 'review'

export default function DatMonPage() {
  const { branchId } = useContext(BranchContext)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [tables, setTables]           = useState<Table[]>([])
  const [dishes, setDishes]           = useState<Dish[]>([])
  const [items, setItems]             = useState<Item[]>([])
  const [recipes, setRecipes]         = useState<RecipeLine[]>([])
  const [selectedTable, setSelectedTable]   = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [quantities, setQuantities]   = useState<Record<string, number>>({})
  const [notes, setNotes]             = useState<Record<string, string>>({})
  const [panelDish, setPanelDish]     = useState<Dish | null>(null)
  const [bypassCapFor, setBypassCapFor] = useState<string | null>(null)
  const [step, setStep]               = useState<Step>('table')
  const [submitting, setSubmitting]   = useState(false)
  const [toast, setToast]             = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [t, d, i, r] = await Promise.all([
        supabase.from('tables').select('*').eq('branch_id', branchId).eq('is_active', true).order('section').order('label'),
        supabase.from('dishes').select('*').eq('branch_id', branchId).eq('is_active', true).order('name_vi'),
        supabase.from('items').select('*').eq('branch_id', branchId).eq('is_active', true),
        supabase.from('recipe_lines').select('*'),
      ])
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
      if (d.data) setDishes(d.data)
      if (i.data) setItems(i.data)
      if (r.data) setRecipes(r.data)
    }
    load()
  }, [branchId])

  const sections = [...new Set(tables.map(t => t.section).filter((s): s is string => s !== null))]
  const visibleTables = sections.length > 1 && selectedSection
    ? tables.filter(t => t.section === selectedSection)
    : tables

  // Unlike selectedSection above, selectedCategory never auto-selects away from
  // null ("Tất cả") — an uncategorized dish must never become invisible just
  // because other categories exist.
  const categories = [...new Set(dishes.map(d => d.category).filter((c): c is string => c !== null))]
  const visibleDishes = selectedCategory === null
    ? dishes
    : dishes.filter(d => d.category === selectedCategory)

  const toppingDishes = dishes.filter(d => d.is_topping)
  const panelToppings = panelDish ? sortToppingsByRelevance(panelDish, toppingDishes, recipes) : []

  function adjustQty(dishId: string, delta: 1 | -1, options?: { bypassCap?: boolean }) {
    setQuantities(prev => {
      const current = prev[dishId] ?? 0
      if (delta === 1 && !options?.bypassCap) {
        const maxQty = getMaxOrderableQty(dishId, recipes, items, prev)
        if (current >= maxQty) return prev
      }
      return { ...prev, [dishId]: Math.max(0, current + delta) }
    })
  }

  function addToppingQuantities(toppingQuantities: Record<string, number>) {
    setQuantities(prev => {
      const next = { ...prev }
      for (const [toppingId, addQty] of Object.entries(toppingQuantities)) {
        if (addQty > 0) next[toppingId] = (next[toppingId] ?? 0) + addQty
      }
      return next
    })
  }

  function handleCardTap(dish: Dish) {
    const status = getDishStatus(dish.id, recipes, items)

    if (status === 'unavailable') {
      if (window.confirm('Món này hiện không đủ nguyên liệu. Vẫn muốn đặt?')) {
        setBypassCapFor(dish.id)
        setPanelDish(dish)
      }
      return
    }

    const maxQty = getMaxOrderableQty(dish.id, recipes, items, quantities)
    const currentQty = quantities[dish.id] ?? 0
    if (currentQty >= maxQty) return

    setPanelDish(dish)
  }

  function handlePanelConfirm({ toppingQuantities, note }: { toppingQuantities: Record<string, number>; note: string }) {
    if (!panelDish) return
    const dishId = panelDish.id

    adjustQty(dishId, 1, { bypassCap: bypassCapFor === dishId })
    addToppingQuantities(toppingQuantities)

    setNotes(prev => {
      const next = { ...prev }
      const trimmed = note.trim()
      if (trimmed) next[dishId] = trimmed
      else delete next[dishId]
      return next
    })

    setPanelDish(null)
    setBypassCapFor(null)
  }

  function handlePanelClose() {
    setPanelDish(null)
    setBypassCapFor(null)
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
      orderLines.map(l => {
        const dish = dishes.find(d => d.id === l.dish_id)!
        return {
          order_id: order.id,
          dish_id: l.dish_id,
          qty: l.qty,
          price_at_order: num(dish.price),
          note: notes[l.dish_id] || null,
        }
      })
    )

    const decrements = calculateDecrements(orderLines, recipes)
    const { floored } = await applyStockChange(decrements, 'order', user.id, order.id)

    setSubmitting(false)
    setQuantities({})
    setNotes({})
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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-error text-on-error text-label-vi font-bold px-stack-lg py-2 rounded-xl z-50 shadow-lg">
          {toast}
        </div>
      )}

      {panelDish && (
        <ToppingPanel
          dish={panelDish}
          toppings={panelToppings}
          initialNote={notes[panelDish.id] ?? ''}
          onConfirm={handlePanelConfirm}
          onClose={handlePanelClose}
        />
      )}

      {step === 'table' && (
        <>
          <h2 className="text-headline-md font-bold text-on-surface mb-stack-lg">
            Chọn bàn
            <span className="block text-label-en font-normal text-on-surface-variant">Select table</span>
          </h2>

          {sections.length > 1 && (
            <div className="flex gap-2 mb-stack-lg overflow-x-auto pb-1">
              {sections.map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedSection(s)}
                  className={`px-4 rounded-full text-label-vi font-bold whitespace-nowrap min-h-touch-target-min transition-colors ${
                    selectedSection === s
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {visibleTables.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTable(t.id); setStep('dishes') }}
                className="min-h-touch-target-min rounded-xl border-2 border-outline-variant bg-surface-container-lowest font-bold text-label-vi text-on-surface hover:border-primary hover:bg-primary-fixed transition-all"
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'dishes' && (
        <>
          <div className="flex items-center gap-3 mb-stack-lg">
            <button onClick={() => setStep('table')} className="text-primary text-label-vi font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>
              Bàn
            </button>
            <h2 className="text-headline-md font-bold text-on-surface">Chọn món</h2>
          </div>

          {categories.length > 0 && (
            <div className="flex gap-2 mb-stack-lg overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 rounded-full text-label-vi font-bold whitespace-nowrap min-h-touch-target-min transition-colors ${
                  selectedCategory === null
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                Tất cả
              </button>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={`px-4 rounded-full text-label-vi font-bold whitespace-nowrap min-h-touch-target-min transition-colors ${
                    selectedCategory === c
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {visibleDishes.map(dish => {
              const status = getDishStatus(dish.id, recipes, items)
              const qty = quantities[dish.id] ?? 0
              const maxQty = getMaxOrderableQty(dish.id, recipes, items, quantities)
              const atMax = status !== 'unavailable' && qty >= maxQty
              return (
                <DishCard
                  key={dish.id}
                  dish={dish}
                  status={status}
                  qty={qty}
                  atMax={atMax}
                  onCardTap={() => handleCardTap(dish)}
                  onRemove={() => adjustQty(dish.id, -1)}
                />
              )
            })}
          </div>

          {orderLines.length > 0 && (
            <div className="fixed bottom-touch-target-min md:bottom-0 left-0 right-0 p-gutter bg-surface border-t border-outline-variant">
              <button
                onClick={() => setStep('review')}
                className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold min-h-touch-target-min shadow-md"
              >
                Xem lại đơn ({orderLines.reduce((s, l) => s + l.qty, 0)} món)
              </button>
            </div>
          )}
        </>
      )}

      {step === 'review' && (
        <>
          <div className="flex items-center gap-3 mb-stack-lg">
            <button onClick={() => setStep('dishes')} className="text-primary text-label-vi font-bold flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_back</span>
              Món
            </button>
            <h2 className="text-headline-md font-bold text-on-surface">Xác nhận đặt món</h2>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg mb-stack-lg space-y-2">
            <p className="text-label-en text-on-surface-variant">
              Bàn: <span className="font-bold text-on-surface">{tables.find(t => t.id === selectedTable)?.label}</span>
            </p>
            {orderLines.map(l => {
              const dish = dishes.find(d => d.id === l.dish_id)!
              return (
                <div key={l.dish_id} className="flex justify-between items-center">
                  <div>
                    <span className="text-label-vi font-bold text-on-surface">{dish.name_vi}</span>
                    {notes[l.dish_id] && (
                      <span className="block text-label-en text-on-surface-variant">{notes[l.dish_id]}</span>
                    )}
                  </div>
                  <span className="text-label-vi font-black text-primary">×{l.qty}</span>
                </div>
              )
            })}
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-primary text-on-primary rounded-xl py-3 text-label-vi font-bold disabled:opacity-50 min-h-touch-target-min shadow-md"
          >
            {submitting ? 'Đang đặt…' : 'Xác nhận đặt món'}
          </button>
        </>
      )}
    </div>
  )
}
```

Note on the simplification this task makes deliberately, beyond what the spec covers explicitly: `ToppingPanel`'s own +/− steppers do **not** check `getMaxOrderableQty` live while a staff member is building up topping quantities inside the panel. The existing floor-at-zero protection in `applyStockChange` (already built earlier this session) still catches any oversell at submit time exactly as it does for ordinary dishes today, showing the same "Kho không đủ" toast — so this isn't a new gap, just one that already existed for any over-order and continues to apply uniformly. Building live cap-checking inside the panel would require passing `recipes`/`items`/the in-progress draft state into it and recomputing remaining capacity on every keystroke — real complexity for a low-frequency edge case (a topping running out mid-panel-session). Flag this for a future task if it turns out to matter in practice; do not build it now.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4 (manual smoke test):** This requires a live login session — skip it, note it's pending for the human user.

- [ ] **Step 5: Commit**

```bash
git add components/dish-card.tsx app/\(app\)/dat-mon/page.tsx
git commit -m "feat: replace instant-add with topping/notes customization panel"
```

---

### Task 6: Thread notes through register billing

**Files:**
- Modify: `lib/billing.ts`
- Modify: `lib/__tests__/billing.test.ts`
- Modify: `app/register/page.tsx`

- [ ] **Step 1: Add `note` to `TableBillItem` and its construction**

Find in `lib/billing.ts`:
```ts
export interface TableBillItem {
  name_vi: string
  qty: number
  lineTotal: number
}
```
Replace with:
```ts
export interface TableBillItem {
  name_vi: string
  qty: number
  lineTotal: number
  note: string | null
}
```

Find:
```ts
    const items: TableBillItem[] = tableOrders.flatMap(order =>
      order.order_items.map(oi => ({
        name_vi: oi.dish.name_vi,
        qty: oi.qty,
        lineTotal: oi.qty * num(oi.price_at_order),
      }))
    )
```
Replace with:
```ts
    const items: TableBillItem[] = tableOrders.flatMap(order =>
      order.order_items.map(oi => ({
        name_vi: oi.dish.name_vi,
        qty: oi.qty,
        lineTotal: oi.qty * num(oi.price_at_order),
        note: oi.note,
      }))
    )
```

- [ ] **Step 2: Update the existing billing tests for the new field**

Read `lib/__tests__/billing.test.ts` and add `note: null` to every inline `order_items` literal that doesn't already have one (Task 1 may have already done this — check first; if so, skip this step). Then add one new test confirming a note passes through:

Find the first `describe('groupOrdersByTable', ...)` test (the "sums line totals for a single delivered order" one) and add this new test right after it, inside the same `describe` block:

```ts
  it('passes a non-null note through to the bill item', () => {
    const orders: OrderWithDetails[] = [
      {
        ...baseOrder,
        id: 'order-1',
        table_id: 'table-1',
        status: 'delivered',
        table: { label: 'Bàn 1' },
        order_items: [
          { id: 'oi-1', order_id: 'order-1', dish_id: 'dish-1', qty: 1, price_at_order: 65000, note: 'không đậu hũ', dish: { name_vi: 'Bún riêu', name_en: null } },
        ],
      },
    ]

    const bills = groupOrdersByTable(orders)

    expect(bills[0].items[0].note).toBe('không đậu hũ')
  })
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm run test:run`
Expected: all tests pass, including the new one.

- [ ] **Step 4: Display the note in the register's confirm and receipt steps**

Find in `app/register/page.tsx`:
```tsx
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg mb-stack-lg space-y-2">
          {selectedBill.items.map((item, i) => (
            <div key={i} className="flex justify-between text-body-lg text-on-surface">
              <span>{item.name_vi} ×{item.qty}</span>
              <span className="font-bold">{item.lineTotal.toLocaleString('vi-VN')}đ</span>
            </div>
          ))}
```
Replace with:
```tsx
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-stack-lg mb-stack-lg space-y-2">
          {selectedBill.items.map((item, i) => (
            <div key={i} className="flex justify-between text-body-lg text-on-surface">
              <span>
                {item.name_vi} ×{item.qty}
                {item.note && <span className="block text-label-en text-on-surface-variant">{item.note}</span>}
              </span>
              <span className="font-bold">{item.lineTotal.toLocaleString('vi-VN')}đ</span>
            </div>
          ))}
```

Find:
```tsx
          {receipt.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>{item.name_vi} x{item.qty}</span>
              <span>{item.lineTotal.toLocaleString('vi-VN')}</span>
            </div>
          ))}
```
Replace with:
```tsx
          {receipt.items.map((item, i) => (
            <div key={i} className="flex justify-between">
              <span>
                {item.name_vi} x{item.qty}
                {item.note && <span className="block">{item.note}</span>}
              </span>
              <span>{item.lineTotal.toLocaleString('vi-VN')}</span>
            </div>
          ))}
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add lib/billing.ts lib/__tests__/billing.test.ts app/register/page.tsx
git commit -m "feat: thread order notes through register billing and receipt"
```

---

### Task 7: Display notes in OrderCard and the kitchen queue

**Files:**
- Modify: `components/order-card.tsx`
- Modify: `app/kitchen/page.tsx`

- [ ] **Step 1: Show the note in OrderCard's item list**

Find in `components/order-card.tsx`:
```tsx
        <ul className="space-y-1 pt-1">
          {order.order_items.map(oi => (
            <li key={oi.id} className="flex justify-between text-body-md text-on-surface">
              <span>{oi.dish.name_vi}</span>
              <span className="font-bold text-primary">×{oi.qty}</span>
            </li>
          ))}
        </ul>
```
Replace with:
```tsx
        <ul className="space-y-1 pt-1">
          {order.order_items.map(oi => (
            <li key={oi.id} className="flex justify-between text-body-md text-on-surface">
              <span>
                {oi.dish.name_vi}
                {oi.note && <span className="block text-label-en text-on-surface-variant">{oi.note}</span>}
              </span>
              <span className="font-bold text-primary">×{oi.qty}</span>
            </li>
          ))}
        </ul>
```

- [ ] **Step 2: Show the note in the kitchen queue's item list**

Find in `app/kitchen/page.tsx`:
```tsx
              <ul className="space-y-1 pt-1">
                {order.order_items.map(oi => (
                  <li key={oi.id} className="flex justify-between text-body-lg font-medium text-on-surface">
                    <span>{oi.dish.name_vi}</span>
                    <span className="font-black text-primary">×{oi.qty}</span>
                  </li>
                ))}
              </ul>
```
Replace with:
```tsx
              <ul className="space-y-1 pt-1">
                {order.order_items.map(oi => (
                  <li key={oi.id} className="flex justify-between text-body-lg font-medium text-on-surface">
                    <span>
                      {oi.dish.name_vi}
                      {oi.note && <span className="block text-label-en font-bold text-error">{oi.note}</span>}
                    </span>
                    <span className="font-black text-primary">×{oi.qty}</span>
                  </li>
                ))}
              </ul>
```

Note: the kitchen's note is styled in `text-error` (the same red used for "Hết nguyên liệu" elsewhere in this app) since a removal note is an instruction the cook must actually follow, not just informational — it's worth it standing out more than the equivalent note shown to FOH/register.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add components/order-card.tsx app/kitchen/page.tsx
git commit -m "feat: display order item notes in OrderCard and kitchen queue"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

```bash
npm run test:run
npm run lint
npm run build
```
Expected: all tests pass (5 new from Task 2, 1 new from Task 6, rest unchanged or fixture-adjusted from Task 1), lint shows no new errors, build succeeds.

- [ ] **Step 2: Full manual pass**

As manager: in Cài đặt → Món ăn, flag 2-3 dishes (e.g. "Mọc thêm", "Bún thêm") as "Món gọi thêm", with at least one sharing a recipe ingredient with a real dish.

As FOH: in Đặt món, tap a dish — confirm the panel opens (not instant-add), shows the relevant topping(s) sorted first, add a topping and a note, confirm. Verify the dish's card now shows qty 1 and the review step shows the note under the dish name. Submit the order.

As kitchen: confirm the note shows under the dish name in red, and the topping shows as its own separate line item (no special treatment needed since it's just a dish).

As register: once the order is delivered, check out that table and confirm the note appears in both the confirm screen and the printed/previewed receipt.

Confirm the existing zero-stock override flow still works (tap an unavailable dish, confirm the override dialog, then the panel opens and you can still add it).
