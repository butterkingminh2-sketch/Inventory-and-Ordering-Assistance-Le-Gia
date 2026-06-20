# Menu Categorization + Dish Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add free-text dish categories with dynamic "Tất cả" + category tabs in Đặt món, and dish images (uploaded via Settings, stored in Supabase Storage) shown in a redesigned boxed card layout replacing today's text-only row.

**Architecture:** `dishes` gains nullable `category`/`image_url` columns. A new Supabase Storage bucket (`dish-images`, public read, authenticated write) holds uploaded photos. `components/dish-row.tsx` is renamed to `components/dish-card.tsx` (`DishRow` → `DishCard`) with a full layout rewrite — image on top, name below, status+qty row at the bottom, and the whole card (not a small button) is the add-one tap target. Đặt món's dish-picker step gains a category tab strip mirroring the existing table-section tabs, except "Tất cả" is always present and is the default selection, so an uncategorized dish never becomes invisible.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Storage), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-20-menu-categories-design.md` — read this for full rationale; this plan only implements it.

---

### Task 1: Database migration + Storage bucket + types

**Files:**
- Create: `supabase/migrations/006_dish_category_image.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/006_dish_category_image.sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS image_url text;
```

- [ ] **Step 2: Run the migration in Supabase**

This step requires the human user to run SQL in the Supabase Dashboard SQL Editor — skip it if you're a subagent, note it's pending. Paste and run the contents of `006_dish_category_image.sql`. Verify in Table Editor: `dishes` now has `category` and `image_url` columns.

- [ ] **Step 3: Create the Storage bucket and write policies**

This step also requires the human user, in two parts:

1. **Dashboard:** Storage → New bucket → name it exactly `dish-images` → toggle **Public bucket** on → Create bucket. (The "Public bucket" toggle automatically creates a policy allowing public read — that alone does not grant upload/write access, which is why Step 2 below is also needed.)

2. **SQL Editor**, run:
```sql
CREATE POLICY "Authenticated users can upload dish images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'dish-images');

CREATE POLICY "Authenticated users can update dish images"
ON storage.objects FOR UPDATE
TO authenticated
WITH CHECK (bucket_id = 'dish-images');
```

- [ ] **Step 4: Update `lib/types.ts`**

Find the `Dish` interface:
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
Replace with:
```ts
export interface Dish {
  id: string
  branch_id: string
  name_vi: string
  name_en: string | null
  price: number | string
  category: string | null
  image_url: string | null
  is_active: boolean
  created_at: string
}
```

- [ ] **Step 5: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/006_dish_category_image.sql lib/types.ts
git commit -m "feat: add dish category and image_url columns"
```

---

### Task 2: DishCard component (renamed + redesigned)

**Files:**
- Create: `components/dish-card.tsx`

Note: `components/dish-row.tsx` is NOT deleted in this task, even though it's being superseded — `app/(app)/dat-mon/page.tsx` still imports it, and deleting it now would break the build until Task 3 swaps that import. The deletion happens in Task 3, in the same commit as the import swap, so the build stays green at every commit boundary.

- [ ] **Step 1: Write the new component**

```tsx
'use client'

import type { Dish } from '@/lib/types'
import type { DishStatus } from '@/lib/dish-availability'

interface Props {
  dish: Dish
  status: DishStatus
  qty: number
  atMax: boolean
  onAdd: () => void
  onRemove: () => void
}

export function DishCard({ dish, status, qty, atMax, onAdd, onRemove }: Props) {
  const unavailable = status === 'unavailable'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAdd}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAdd() }
      }}
      aria-label={`Thêm ${dish.name_vi}`}
      className={`rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden cursor-pointer select-none active:scale-[0.98] transition-transform ${unavailable ? 'opacity-50' : ''}`}
    >
      <div className="aspect-[4/3] bg-surface-container-high flex items-center justify-center">
        {dish.image_url ? (
          <img src={dish.image_url} alt={dish.name_vi} className="w-full h-full object-cover" />
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

Note: the `−` button calls `e.stopPropagation()` before `onRemove()` — without this, clicking it would also bubble up and trigger the card's own `onClick={onAdd}`, adding one back immediately after removing one. The decorative `add_circle` icon is a plain `<span>`, not a button — it has no click handler of its own and relies entirely on the parent card's `onClick`, since it's just a visual affordance now that precise tapping isn't required.

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds — `dish-card.tsx` is a new, unreferenced file at this point, and `components/dish-row.tsx` still exists untouched, so nothing is broken yet.

- [ ] **Step 3: Commit**

```bash
git add components/dish-card.tsx
git commit -m "feat: add DishCard component — boxed image layout, whole-card tap to add"
```

---

### Task 3: Wire category tabs + DishCard into Đặt món

**Files:**
- Modify: `app/(app)/dat-mon/page.tsx`
- Delete: `components/dish-row.tsx`

- [ ] **Step 1: Swap the import**

Find:
```tsx
import { DishRow } from '@/components/dish-row'
```
Replace with:
```tsx
import { DishCard } from '@/components/dish-card'
```

- [ ] **Step 2: Delete the now-unused old component**

```bash
git rm components/dish-row.tsx
```

- [ ] **Step 3: Add category state and derived values**

Find:
```tsx
  const [selectedTable, setSelectedTable]   = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [quantities, setQuantities]   = useState<Record<string, number>>({})
```
Replace with:
```tsx
  const [selectedTable, setSelectedTable]   = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [quantities, setQuantities]   = useState<Record<string, number>>({})
```

Find:
```tsx
  const sections = [...new Set(tables.map(t => t.section).filter((s): s is string => s !== null))]
  const visibleTables = sections.length > 1 && selectedSection
    ? tables.filter(t => t.section === selectedSection)
    : tables
```
Replace with:
```tsx
  const sections = [...new Set(tables.map(t => t.section).filter((s): s is string => s !== null))]
  const visibleTables = sections.length > 1 && selectedSection
    ? tables.filter(t => t.section === selectedSection)
    : tables

  const categories = [...new Set(dishes.map(d => d.category).filter((c): c is string => c !== null))]
  const visibleDishes = selectedCategory === null
    ? dishes
    : dishes.filter(d => d.category === selectedCategory)
```

Note: unlike `selectedSection` (which defaults to the first section once 2+ exist, set inside the `load()` effect), `selectedCategory` always starts and stays at `null` ("Tất cả") unless the user explicitly taps a category tab — this is the deliberate fix for the uncategorized-dish-invisible risk described in the spec. Do not add any effect that auto-selects the first category.

- [ ] **Step 4: Add the category tab strip and switch to a card grid**

Find:
```tsx
          <div className="divide-y divide-outline-variant">
            {dishes.map(dish => {
              const status = getDishStatus(dish.id, recipes, items)
              const qty = quantities[dish.id] ?? 0
              const maxQty = getMaxOrderableQty(dish.id, recipes, items, quantities)
              const atMax = status !== 'unavailable' && qty >= maxQty
              return (
                <DishRow
                  key={dish.id}
                  dish={dish}
                  status={status}
                  qty={qty}
                  atMax={atMax}
                  onAdd={() => status === 'unavailable' ? handleAddUnavailable(dish.id) : adjustQty(dish.id, 1)}
                  onRemove={() => adjustQty(dish.id, -1)}
                />
              )
            })}
          </div>
```
Replace with:
```tsx
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
                  onAdd={() => status === 'unavailable' ? handleAddUnavailable(dish.id) : adjustQty(dish.id, 1)}
                  onRemove={() => adjustQty(dish.id, -1)}
                />
              )
            })}
          </div>
```

- [ ] **Step 5: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Manual smoke test**

In Cài đặt → Món ăn, give two dishes the same category (e.g. "Món chính") and leave a third uncategorized. In Đặt món's dish step, confirm: "Tất cả" appears first and is selected by default, showing all three dishes; tapping "Món chính" filters to the two categorized ones; the uncategorized dish never disappears entirely (only from the "Món chính" tab, still visible under "Tất cả"). Confirm tapping anywhere on a card (not just a small button) adds one, and the small "−" button removes one without also re-adding it.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/dat-mon/page.tsx
git commit -m "feat: add category tabs and switch Đặt món to a DishCard grid"
```

(`git rm` in Step 2 already staged the deletion of `dish-row.tsx` — this commit captures both that deletion and the page changes together.)

---

### Task 4: Category and image upload in Settings

**Files:**
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Add category and image state**

Find:
```tsx
  const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '', price: 0 })
```
Replace with:
```tsx
  const [newDish,  setNewDish]  = useState({ name_vi: '', name_en: '', price: 0, category: '' })
  const [newDishImage, setNewDishImage] = useState<File | null>(null)
```

- [ ] **Step 2: Add the upload helper and update the dish handlers**

Find:
```tsx
  // Dishes
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
Replace with:
```tsx
  // Dishes
  async function uploadDishImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('dish-images').upload(path, file)
    if (error) throw error
    const { data } = supabase.storage.from('dish-images').getPublicUrl(path)
    return data.publicUrl
  }

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

  async function updateDishPrice(id: string, price: number) {
    await supabase.from('dishes').update({ price }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, price } : d))
  }

  async function updateDishCategory(id: string, category: string) {
    await supabase.from('dishes').update({ category: category || null }).eq('id', id)
    setDishes(p => p.map(d => d.id === id ? { ...d, category: category || null } : d))
  }

  async function updateDishImage(id: string, file: File) {
    try {
      const image_url = await uploadDishImage(file)
      await supabase.from('dishes').update({ image_url }).eq('id', id)
      setDishes(p => p.map(d => d.id === id ? { ...d, image_url } : d))
    } catch {
      alert('Không thể tải ảnh lên. Vui lòng thử lại.')
    }
  }
```

- [ ] **Step 3: Add category and image inputs to the dishes tab JSX**

Find:
```tsx
      {/* Dishes */}
      {tab === 'dishes' && (
        <div className="space-y-stack-lg">
          <div className="flex gap-2">
            <input placeholder="Tên món (VI) *" value={newDish.name_vi}
              onChange={e => setNewDish(p => ({ ...p, name_vi: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input placeholder="Name (EN)" value={newDish.name_en}
              onChange={e => setNewDish(p => ({ ...p, name_en: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input type="number" placeholder="Giá (đ)" value={newDish.price} min={0}
              onChange={e => setNewDish(p => ({ ...p, price: +e.target.value || 0 }))}
              className={`w-28 ${inputCls}`} />
            <button onClick={addDish} className={btnPrimary}>+ Thêm</button>
          </div>
          <ul className="divide-y divide-outline-variant">
            {dishes.map(dish => (
              <li key={dish.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-on-surface">{dish.name_vi}</p>
                  {dish.name_en && <p className="text-label-en text-on-surface-variant">{dish.name_en}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <input type="number" value={Number(dish.price)} min={0}
                    onChange={e => updateDishPrice(dish.id, +e.target.value || 0)}
                    className="border border-outline-variant rounded px-2 py-1 w-24 text-label-en" />
                  <span className={dish.is_active ? badgeActive : badgeInactive}>
                    {dish.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                  {dish.is_active && <button onClick={() => deactivateDish(dish.id)} className={btnDanger}>Tắt</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
```
Replace with:
```tsx
      {/* Dishes */}
      {tab === 'dishes' && (
        <div className="space-y-stack-lg">
          <div className="flex flex-wrap gap-2">
            <input placeholder="Tên món (VI) *" value={newDish.name_vi}
              onChange={e => setNewDish(p => ({ ...p, name_vi: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input placeholder="Name (EN)" value={newDish.name_en}
              onChange={e => setNewDish(p => ({ ...p, name_en: e.target.value }))}
              className={`flex-1 ${inputCls}`} />
            <input placeholder="Phân loại" value={newDish.category}
              onChange={e => setNewDish(p => ({ ...p, category: e.target.value }))}
              className={`w-28 ${inputCls}`} />
            <input type="number" placeholder="Giá (đ)" value={newDish.price} min={0}
              onChange={e => setNewDish(p => ({ ...p, price: +e.target.value || 0 }))}
              className={`w-28 ${inputCls}`} />
            <input type="file" accept="image/*"
              onChange={e => setNewDishImage(e.target.files?.[0] ?? null)}
              className="text-label-en" />
            <button onClick={addDish} className={btnPrimary}>+ Thêm</button>
          </div>
          <ul className="divide-y divide-outline-variant">
            {dishes.map(dish => (
              <li key={dish.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-on-surface">{dish.name_vi}</p>
                  {dish.name_en && <p className="text-label-en text-on-surface-variant">{dish.name_en}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <input placeholder="Phân loại" value={dish.category ?? ''}
                    onChange={e => updateDishCategory(dish.id, e.target.value)}
                    className="border border-outline-variant rounded px-2 py-1 w-24 text-label-en" />
                  <input type="number" value={Number(dish.price)} min={0}
                    onChange={e => updateDishPrice(dish.id, +e.target.value || 0)}
                    className="border border-outline-variant rounded px-2 py-1 w-24 text-label-en" />
                  <label className="text-label-en text-primary font-bold cursor-pointer">
                    Đổi ảnh
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) updateDishImage(dish.id, f) }} />
                  </label>
                  <span className={dish.is_active ? badgeActive : badgeInactive}>
                    {dish.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                  {dish.is_active && <button onClick={() => deactivateDish(dish.id)} className={btnDanger}>Tắt</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

Add a new dish with a category and an image file selected. Confirm it appears in the list with both saved. Use "Đổi ảnh" on an existing dish to upload a different image and confirm it updates. Try adding a dish with no image selected at all — confirm it still saves successfully with `image_url` null (the dish-card placeholder icon should show for it in Đặt món).

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/settings/page.tsx
git commit -m "feat: add dish category and image upload to Settings"
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
Expected: existing tests still pass unchanged (no new pure-logic functions were added — `getDishStatus`/`getMaxOrderableQty` are untouched), lint shows no new errors, build succeeds.

- [ ] **Step 2: Full manual pass**

As manager: add 2-3 dishes across 2 categories with images, leave one uncategorized. As FOH: in Đặt món, confirm the card grid renders images (or the placeholder icon for the uncategorized one), category tabs work as described in Task 3, tapping a card adds one without needing to hit a small button precisely, and the existing zero-stock override confirm dialog and quantity cap (`atMax` / "Đã đạt giới hạn kho") still work exactly as before — this redesign changed where the tap target is, not the underlying ordering/stock logic.

---

## Self-Review Checklist (spec vs plan)

| Spec requirement | Covered by |
|---|---|
| `dishes.category`, `dishes.image_url` columns | Task 1 |
| Public Storage bucket + upload/update policies | Task 1 |
| "Tất cả" always first/default, fixes invisible-uncategorized-dish risk | Task 3 |
| Category tabs only render when ≥1 category in use | Task 3 |
| `DishRow` → `DishCard` rename + image-top/name/status+qty-row layout | Task 2 |
| Whole card is the add-one tap target, `−` stays precise via `stopPropagation` | Task 2 |
| Existing zero-stock override and quantity cap unchanged | Task 2, 3 (no change to `onAdd`/`onRemove`/`atMax` logic, only where they're attached) |
| Image upload via Settings, optional (dish savable without one) | Task 4 |
| Image upload failure doesn't block saving the dish | Task 4 (`addDish`'s try/catch around `uploadDishImage`) |
| `getDishStatus`/`getMaxOrderableQty` unaffected | Task 5 (explicitly verified unchanged) |
