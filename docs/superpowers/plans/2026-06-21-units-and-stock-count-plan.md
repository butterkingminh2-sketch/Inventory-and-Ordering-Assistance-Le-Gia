# Units Overhaul + Stock-Count Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the broken Bún tươi recipe quantity, convert it and Dầu ăn to gram/ml base units, lock the `unit` field to a closed list, and let staff type an exact stock count directly into the existing Kho dashboard instead of only adjusting via ±1 buttons.

**Architecture:** A one-time migration fixes the two affected items and their recipe lines and adds a `CHECK` constraint on allowed units. A small pure conversion library backs a new `QuantityInput` component (a number field with an optional kg/g or l/ml toggle), reused both as a tap-to-reveal editor on `IngredientCard` and as Settings' `low_threshold` editor.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-21-units-and-stock-count-design.md` — read this for full rationale; this plan only implements it.

---

### Task 1: Migration + types

**Files:**
- Create: `supabase/migrations/008_units_and_stock_count.sql`
- Modify: `lib/types.ts`
- Modify: `lib/stock.ts`
- Modify: `lib/__tests__/dish-availability.test.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/008_units_and_stock_count.sql

-- One-time correction, named explicitly — not a pattern match on current unit
-- values, so a future item legitimately using some other unit is never
-- accidentally caught by this fix.
UPDATE items
SET unit = 'g', quantity = quantity * 1000, low_threshold = low_threshold * 1000
WHERE name_vi = 'Bún tươi';

UPDATE items
SET unit = 'ml', quantity = quantity * 1000, low_threshold = low_threshold * 1000
WHERE name_vi = 'Dầu ăn';

-- The old qty_per_serving (1.50, in kg) was an unvalidated guess that implied
-- 1.5kg of noodles per bowl. 150g is the real reference amount.
UPDATE recipe_lines
SET qty_per_serving = 150
WHERE item_id = (SELECT id FROM items WHERE name_vi = 'Bún tươi');

ALTER TABLE items
  ADD CONSTRAINT items_unit_check
  CHECK (unit IN ('g', 'ml', 'gói', 'phần', 'miếng', 'bó', 'viên', 'chai'));
```

- [ ] **Step 2: Run it in Supabase**

This step requires the human user to paste the SQL into the Supabase Dashboard SQL Editor — skip it if you're a subagent, note it's pending.

- [ ] **Step 3: Update `lib/types.ts`**

Add this new exported type and constant near the top of the file (after the existing `UserRole`/`OrderStatus` type exports, before the `num()` helper):

```ts
export type ItemUnit = 'g' | 'ml' | 'gói' | 'phần' | 'miếng' | 'bó' | 'viên' | 'chai'
export const ITEM_UNITS: ItemUnit[] = ['g', 'ml', 'gói', 'phần', 'miếng', 'bó', 'viên', 'chai']
```

Change the `Item` interface's `unit` field from `string` to `ItemUnit`:
```ts
export interface Item {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  unit: ItemUnit
  quantity: number | string
  low_threshold: number | string
  is_active: boolean
  created_at: string
}
```

- [ ] **Step 4: Update `lib/stock.ts`**

Find:
```ts
export async function applyStockChange(
  changes: StockChange[],
  reason: 'order' | 'manual_correction' | 'cancellation',
  userId: string,
  orderId?: string
): Promise<StockChangeResult> {
```
Replace with:
```ts
export async function applyStockChange(
  changes: StockChange[],
  reason: 'order' | 'manual_correction' | 'cancellation' | 'count',
  userId: string,
  orderId?: string
): Promise<StockChangeResult> {
```

- [ ] **Step 5: Verify the build and test suite, fixing any fixture breakage from the tightened `Item.unit` type**

Run: `npm run build` then `npm run test:run`

`Item.unit` changing from `string` to the closed `ItemUnit` union will break any test fixture using a unit value outside that list. `lib/__tests__/dish-availability.test.ts` has one: an item literal with `unit: 'kg'` (line 9, `item-bun`) — `'kg'` is no longer a valid `ItemUnit` (it's been replaced by `'g'` everywhere in this app). Find:
```ts
  { id: 'item-bun',     quantity: 5, low_threshold: 1, branch_id: '', name_vi: 'Bún',     name_en: null, unit: 'kg',   is_active: true, created_at: '' },
```
Replace with:
```ts
  { id: 'item-bun',     quantity: 5, low_threshold: 1, branch_id: '', name_vi: 'Bún',     name_en: null, unit: 'g',    is_active: true, created_at: '' },
```
This only changes the fixture's label — `getDishStatus` doesn't read the unit string, so no test assertion changes. If `npm run test:run` reports any other fixture using an out-of-list unit string, fix it the same way (pick the closest real `ItemUnit` value) — do not change any test's assertions, only fixture literals.

Expected after fixes: build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/008_units_and_stock_count.sql lib/types.ts lib/stock.ts lib/__tests__/dish-availability.test.ts
git commit -m "feat: correct Bún tươi recipe quantity, convert to g/ml units, lock unit list"
```

(Only include `dish-availability.test.ts` in the commit if Step 5 actually required changing it.)

---

### Task 2: Unit conversion helpers (TDD)

**Files:**
- Create: `lib/unit-conversion.ts`
- Create: `lib/__tests__/unit-conversion.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/unit-conversion.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BIGGER_UNIT, toCanonical, fromCanonical } from '../unit-conversion'

describe('BIGGER_UNIT', () => {
  it('defines kg for g and l for ml', () => {
    expect(BIGGER_UNIT.g).toEqual({ unit: 'kg', factor: 1000 })
    expect(BIGGER_UNIT.ml).toEqual({ unit: 'l', factor: 1000 })
  })

  it('has no entry for discrete units', () => {
    expect(BIGGER_UNIT['miếng']).toBeUndefined()
    expect(BIGGER_UNIT['phần']).toBeUndefined()
  })
})

describe('toCanonical', () => {
  it('converts kg to g when useBigger is true', () => {
    expect(toCanonical(5, 'g', true)).toBe(5000)
  })

  it('converts l to ml when useBigger is true', () => {
    expect(toCanonical(2.5, 'ml', true)).toBe(2500)
  })

  it('returns the value unchanged when useBigger is false', () => {
    expect(toCanonical(150, 'g', false)).toBe(150)
  })

  it('returns the value unchanged for a unit with no bigger counterpart, even if useBigger is true', () => {
    expect(toCanonical(98, 'miếng', true)).toBe(98)
  })
})

describe('fromCanonical', () => {
  it('converts g to kg when useBigger is true', () => {
    expect(fromCanonical(5000, 'g', true)).toBe(5)
  })

  it('converts ml to l when useBigger is true', () => {
    expect(fromCanonical(2500, 'ml', true)).toBe(2.5)
  })

  it('returns the value unchanged when useBigger is false', () => {
    expect(fromCanonical(150, 'g', false)).toBe(150)
  })

  it('round-trips through toCanonical/fromCanonical for g/kg', () => {
    const original = 7.5
    const canonical = toCanonical(original, 'g', true)
    expect(fromCanonical(canonical, 'g', true)).toBe(original)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run`
Expected: FAIL — "Cannot find module '../unit-conversion'"

- [ ] **Step 3: Write `lib/unit-conversion.ts`**

```ts
import type { ItemUnit } from './types'

export const BIGGER_UNIT: Partial<Record<ItemUnit, { unit: string; factor: number }>> = {
  g: { unit: 'kg', factor: 1000 },
  ml: { unit: 'l', factor: 1000 },
}

/** Pure function — no DB calls. Converts a value typed in the bigger unit (if useBigger) into the item's canonical small unit. */
export function toCanonical(displayValue: number, unit: ItemUnit, useBigger: boolean): number {
  const bigger = BIGGER_UNIT[unit]
  if (useBigger && bigger) return displayValue * bigger.factor
  return displayValue
}

/** Pure function — no DB calls. Converts a canonical small-unit value into the bigger unit for display (if useBigger). */
export function fromCanonical(canonicalValue: number, unit: ItemUnit, useBigger: boolean): number {
  const bigger = BIGGER_UNIT[unit]
  if (useBigger && bigger) return canonicalValue / bigger.factor
  return canonicalValue
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: All 8 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/unit-conversion.ts lib/__tests__/unit-conversion.test.ts
git commit -m "feat: add g/kg and ml/l unit conversion helpers"
```

---

### Task 3: QuantityInput component

**Files:**
- Create: `components/quantity-input.tsx`

Note: this is a new, standalone, unreferenced component — nothing imports it yet, so the build stays green regardless. Task 4 and Task 5 wire it in.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { BIGGER_UNIT, toCanonical, fromCanonical } from '@/lib/unit-conversion'
import type { ItemUnit } from '@/lib/types'

interface Props {
  value: number
  unit: ItemUnit
  onConfirm: (newCanonicalValue: number) => void
  onCancel: () => void
  autoFocus?: boolean
  inputClassName?: string
}

const defaultInputClassName =
  'w-20 border border-outline-variant rounded-lg px-2 py-1 text-label-en bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary'

export function QuantityInput({ value, unit, onConfirm, onCancel, autoFocus, inputClassName }: Props) {
  const bigger = BIGGER_UNIT[unit]
  const [useBigger, setUseBigger] = useState(false)
  const [text, setText] = useState(String(fromCanonical(value, unit, false)))

  function resetText(nextUseBigger: boolean) {
    setText(String(fromCanonical(value, unit, nextUseBigger)))
  }

  function handleToggle() {
    const next = !useBigger
    setUseBigger(next)
    resetText(next)
  }

  function handleConfirm() {
    const parsed = parseFloat(text)
    if (!Number.isFinite(parsed) || parsed < 0) {
      resetText(useBigger)
      onCancel()
      return
    }
    onConfirm(toCanonical(parsed, unit, useBigger))
  }

  function handleCancel() {
    resetText(useBigger)
    onCancel()
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        value={text}
        autoFocus={autoFocus}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') handleCancel()
        }}
        onBlur={handleConfirm}
        className={inputClassName ?? defaultInputClassName}
      />
      {bigger ? (
        <button
          type="button"
          onClick={handleToggle}
          className="text-label-en px-2 py-1 rounded-full bg-surface-container text-on-surface-variant font-bold"
        >
          {useBigger ? bigger.unit : unit}
        </button>
      ) : (
        <span className="text-label-en text-on-surface-variant">{unit}</span>
      )}
    </div>
  )
}
```

Behavior notes: toggling the unit re-expresses the *current* value in the new unit (never reinterprets whatever's been typed, avoiding ambiguity about a half-edited number). An invalid confirm (non-numeric, negative) resets the field back to the last valid display and calls `onCancel` — no garbage value is ever passed to `onConfirm`. Escape does the same reset-and-cancel.

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds — this component isn't imported anywhere yet, so nothing else can break.

- [ ] **Step 3: Commit**

```bash
git add components/quantity-input.tsx
git commit -m "feat: add QuantityInput component with kg/g and l/ml toggle"
```

---

### Task 4: Tap-to-edit count on IngredientCard + Kho wiring

**Files:**
- Modify: `components/ingredient-card.tsx`
- Modify: `components/__tests__/ingredient-card.test.tsx`
- Modify: `app/(app)/kho/page.tsx`

Both files are modified in this one task, not split across two — `IngredientCard` gains a new required prop (`onSetQuantity`) and `kho/page.tsx` is its only caller, so landing them separately would leave the build broken for a commit. The test file is included here too since it constructs `IngredientCard` directly and needs the new prop on every render call.

- [ ] **Step 1: Replace `components/ingredient-card.tsx`**

Replace its entire contents:

```tsx
'use client'

import { useState } from 'react'
import { num } from '@/lib/types'
import type { Item } from '@/lib/types'
import { QuantityInput } from './quantity-input'

type Status = 'sufficient' | 'low' | 'out'

function getStatus(item: Item): Status {
  const qty = num(item.quantity)
  const threshold = num(item.low_threshold)
  if (qty <= 0) return 'out'
  if (qty <= threshold) return 'low'
  return 'sufficient'
}

const badge = {
  sufficient: { label: 'Đủ',      classes: 'bg-secondary-container text-on-secondary-container' },
  low:        { label: 'Sắp hết', classes: 'bg-tertiary-container text-on-tertiary-container' },
  out:        { label: 'Hết',     classes: 'bg-error text-on-error' },
}

const cardWrapper = {
  sufficient: 'bg-surface-container-lowest border border-outline-variant rounded-xl p-5',
  low:        'bg-surface-container-lowest border border-outline-variant rounded-xl p-5 ring-1 ring-tertiary-fixed-dim',
  out:        'bg-error-container/20 border-2 border-error ring-2 ring-error/10 ring-offset-2 rounded-xl p-5',
}

const qtyColor = {
  sufficient: 'text-primary',
  low:        'text-tertiary',
  out:        'text-error',
}

interface Props {
  item: Item
  onAdjust: (id: string, delta: 1 | -1) => void
  onSetQuantity: (id: string, newQuantity: number) => void
}

export function IngredientCard({ item, onAdjust, onSetQuantity }: Props) {
  const status = getStatus(item)
  const qty = num(item.quantity)
  const [editing, setEditing] = useState(false)

  return (
    <article className={cardWrapper[status]}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-headline-md font-bold text-on-surface truncate">{item.name_vi}</p>
          {item.name_en && (
            <p className="text-label-en text-on-surface-variant truncate">{item.name_en}</p>
          )}
        </div>
        <span className={`shrink-0 text-status-badge font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${badge[status].classes}`}>
          {badge[status].label}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          {editing ? (
            <QuantityInput
              value={qty}
              unit={item.unit}
              autoFocus
              inputClassName="w-24 border border-outline-variant rounded-lg px-2 py-1 text-[28px] font-black text-primary bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
              onConfirm={newQty => { onSetQuantity(item.id, newQty); setEditing(false) }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Sửa số lượng ${item.name_vi}`}
              className={`text-[32px] font-black leading-none ${qtyColor[status]} border-b-2 border-dashed border-current`}
            >
              {qty}
            </button>
          )}
          {' '}
          <span className="text-label-en text-on-surface-variant">{item.unit}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onAdjust(item.id, -1)}
            aria-label={`Giảm ${item.name_vi}`}
            className="w-touch-target-min h-touch-target-min bg-surface-container-high rounded-lg border border-outline-variant text-primary text-xl font-bold flex items-center justify-center"
          >
            −
          </button>
          <button
            onClick={() => onAdjust(item.id, 1)}
            aria-label={`Tăng ${item.name_vi}`}
            className="w-touch-target-min h-touch-target-min bg-primary text-on-primary rounded-lg shadow-md text-xl font-bold flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
    </article>
  )
}
```

Only the quantity number's rendering changed (now a tappable button when not editing, or `QuantityInput` when editing) and the new `onSetQuantity` prop was added. The header, badge, card wrapper, and ± buttons are unchanged.

- [ ] **Step 2: Update `components/__tests__/ingredient-card.test.tsx`**

Replace its entire contents (adds `onSetQuantity={() => {}}` to every existing render call — no new test logic needed since this file's existing tests only check status-badge text, which is unaffected by the new prop):

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { IngredientCard } from '../ingredient-card'
import type { Item } from '@/lib/types'

const base: Item = {
  id: 'i1', branch_id: 'b1', name_vi: 'Giò', name_en: 'Pork roll',
  unit: 'phần', quantity: 5, low_threshold: 3, is_active: true, created_at: '',
}

describe('IngredientCard status badge', () => {
  it('shows Đủ when quantity > low_threshold', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Đủ')).toBeInTheDocument()
  })

  it('shows Sắp hết when 0 < quantity ≤ low_threshold', () => {
    render(<IngredientCard item={{ ...base, quantity: 2 }} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Sắp hết')).toBeInTheDocument()
  })

  it('shows Hết when quantity = 0', () => {
    render(<IngredientCard item={{ ...base, quantity: 0 }} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Hết')).toBeInTheDocument()
  })

  it('renders Vietnamese name prominently', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Giò')).toBeInTheDocument()
  })

  it('renders English subtitle', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('Pork roll')).toBeInTheDocument()
  })

  it('renders quantity and unit', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('phần')).toBeInTheDocument()
  })
})

describe('IngredientCard tap-to-edit', () => {
  it('reveals an editable input when the quantity is tapped', () => {
    render(<IngredientCard item={base} onAdjust={() => {}} onSetQuantity={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sửa số lượng Giò' }))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('calls onSetQuantity with the typed value on confirm', () => {
    let confirmedWith: number | null = null
    render(
      <IngredientCard
        item={base}
        onAdjust={() => {}}
        onSetQuantity={(_id, newQty) => { confirmedWith = newQty }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sửa số lượng Giò' }))
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(confirmedWith).toBe(12)
  })
})
```

- [ ] **Step 3: Modify `app/(app)/kho/page.tsx`**

Find:
```tsx
  async function handleAdjust(itemId: string, delta: 1 | -1) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await applyStockChange([{ item_id: itemId, delta }], 'manual_correction', user.id)
  }
```
Replace with:
```tsx
  async function handleAdjust(itemId: string, delta: 1 | -1) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await applyStockChange([{ item_id: itemId, delta }], 'manual_correction', user.id)
  }

  async function handleSetQuantity(itemId: string, newQuantity: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const delta = newQuantity - num(item.quantity)
    if (delta === 0) return
    await applyStockChange([{ item_id: itemId, delta }], 'count', user.id)
  }
```

Find:
```tsx
        {items.map(item => (
          <IngredientCard key={item.id} item={item} onAdjust={handleAdjust} />
        ))}
```
Replace with:
```tsx
        {items.map(item => (
          <IngredientCard key={item.id} item={item} onAdjust={handleAdjust} onSetQuantity={handleSetQuantity} />
        ))}
```

- [ ] **Step 4: Run tests and verify the build compiles**

Run: `npm run test:run` then `npm run build`
Expected: all tests pass (including the 2 new tap-to-edit tests), build succeeds with no TypeScript errors.

- [ ] **Step 5 (manual smoke test):** This requires a live login session — skip it, note it's pending for the human user.

- [ ] **Step 6: Commit**

```bash
git add components/ingredient-card.tsx components/__tests__/ingredient-card.test.tsx app/\(app\)/kho/page.tsx
git commit -m "feat: add tap-to-edit stock count on Kho dashboard"
```

---

### Task 5: Closed unit dropdown + QuantityInput in Settings

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Import the new pieces**

Find:
```tsx
import type { Item, Dish, RecipeLine, Table } from '@/lib/types'
```
Replace with:
```tsx
import type { Item, Dish, RecipeLine, Table, ItemUnit } from '@/lib/types'
import { ITEM_UNITS } from '@/lib/types'
import { QuantityInput } from '@/components/quantity-input'
```

- [ ] **Step 2: Require a unit to be picked before adding an item**

Find:
```tsx
  // Items
  async function addItem() {
    if (!newItem.name_vi.trim()) return
```
Replace with:
```tsx
  // Items
  async function addItem() {
    if (!newItem.name_vi.trim() || !newItem.unit) return
```

- [ ] **Step 3: Replace the add-item form's free-text unit input with a closed dropdown**

Find:
```tsx
            <input placeholder="Đơn vị" value={newItem.unit}
              onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))}
              className={inputCls} />
```
Replace with:
```tsx
            <select value={newItem.unit}
              onChange={e => setNewItem(p => ({ ...p, unit: e.target.value as ItemUnit }))}
              className={inputCls}>
              <option value="">-- Đơn vị --</option>
              {ITEM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
```

- [ ] **Step 4: Replace the per-row unit input with the same closed dropdown, and the low_threshold input with `QuantityInput`**

Find:
```tsx
                  <td className="py-2"><input value={item.unit}
                    onChange={e => updateItem(item.id, 'unit', e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-20 text-label-en" /></td>
                  <td className="py-2"><input type="number" value={Number(item.low_threshold)}
                    onChange={e => updateItem(item.id, 'low_threshold', +e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-16 text-label-en" /></td>
```
Replace with:
```tsx
                  <td className="py-2"><select value={item.unit}
                    onChange={e => updateItem(item.id, 'unit', e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-20 text-label-en">
                    {ITEM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select></td>
                  <td className="py-2">
                    <QuantityInput
                      value={Number(item.low_threshold)}
                      unit={item.unit}
                      onConfirm={newValue => updateItem(item.id, 'low_threshold', newValue)}
                      onCancel={() => {}}
                    />
                  </td>
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/settings/page.tsx
git commit -m "feat: lock items unit field to a closed dropdown in Settings"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

```bash
npm run test:run
npm run lint
npm run build
```
Expected: all tests pass (8 new from Task 2, 2 new from Task 4, rest unchanged or fixture-adjusted from Task 1), lint shows no new errors, build succeeds.

- [ ] **Step 2: Full manual pass**

As manager: in Cài đặt → Nguyên liệu, confirm the unit field is now a dropdown showing only the 8 allowed units, and confirm Bún tươi/Dầu ăn show `g`/`ml` with quantities around 8000/8000 (post-migration). Edit a low_threshold value via the new input, toggling to kg/l and back, confirm it saves correctly in both modes.

As manager/kitchen: in Kho, tap Bún tươi's quantity number, confirm it becomes editable, toggle to kg, type a new value, confirm — check the card updates and (via Supabase Table Editor) that a `stock_logs` row appears with `reason = 'count'` and the correct delta. Tap a discrete-unit item's count (e.g. Đậu hũ) and confirm no kg/l toggle appears for it.

As FOH: place an order containing a Bún Riêu dish, confirm Bún tươi's stock decrements by 150 (not 1500 or some other value) per bowl ordered.
