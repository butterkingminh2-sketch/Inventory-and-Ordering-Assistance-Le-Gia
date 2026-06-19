# Plan 2: UI Typography & Visual Audit — Lê Gia Inventory App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the missing typography token definitions in `globals.css` so all custom text-size classes render correctly, then audit each screen against the Stitch design in `docs/DESIGN.md`.

**Architecture:** `globals.css` uses Tailwind v4's `@theme` directive. It already defines all color, spacing, and radius tokens. The typography tokens (`--text-*`) are missing — every class like `text-headline-md`, `text-label-vi`, `text-label-en`, `text-status-badge` currently produces no CSS and falls back to browser default sizes. This plan adds them, then verifies each screen visually.

**Tech Stack:** Tailwind CSS v4 · `@theme` CSS directive · Next.js dev server (hot reload)

**Prerequisite:** Plan 1 (data layer) must be complete so each screen has real data to render during the visual audit.

---

## File Structure

```
app/globals.css          ← modify: add --text-* typography tokens to @theme
```

No other files need editing unless the visual audit in Tasks 2–5 reveals specific component issues.

---

### Task 1: Add typography tokens to globals.css

In Tailwind v4, `--text-*` variables in `@theme` create `text-*` font-size utility classes. Currently `globals.css` defines colors, spacing, and radius but NOT the typography scale, so `text-headline-md`, `text-label-vi`, etc. are no-ops.

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Open `app/globals.css`**

The file currently ends after the `--spacing-margin-desktop` line and closes `}` before `@layer base`. You will add typography tokens INSIDE the existing `@theme {}` block, after the spacing tokens.

- [ ] **Step 2: Add the typography tokens**

Find this line in `globals.css`:
```css
  --spacing-margin-desktop:   32px;
}
```

Replace it with:
```css
  --spacing-margin-desktop:   32px;

  /* Typography scale — matches DESIGN.md fontSize definitions */
  --text-headline-lg:        32px;
  --text-headline-lg-mobile: 24px;
  --text-headline-md:        24px;
  --text-body-lg:            18px;
  --text-body-md:            16px;
  --text-label-vi:           14px;
  --text-label-en:           12px;
  --text-status-badge:       13px;
}
```

- [ ] **Step 3: Verify the dev server picks up the change**

The Next.js dev server uses Turbopack with hot reload. Save the file. In the terminal where `npm run dev` is running, you should see a recompile line within 1–2 seconds. No restart needed.

- [ ] **Step 4: Confirm the classes are emitting CSS**

Open http://localhost:3000/kho in the browser. Open DevTools → Elements. Click on an ingredient card's name element (the Vietnamese name). In the Computed styles panel, look for `font-size`. It should now show `24px` (from `text-headline-md`), not `16px` (browser default).

If it still shows `16px`, hard-refresh the page (Ctrl+Shift+R) and check again.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "fix: add missing typography tokens to Tailwind v4 @theme"
```

---

### Task 2: Audit the Kho (inventory) screen

**Files:** `components/ingredient-card.tsx` — modify only if visual discrepancy is found.

Open http://localhost:3000/kho on a tablet-sized viewport (DevTools → responsive mode, set to 768px wide).

- [ ] **Step 1: Check ingredient card layout**

Compare against the Stitch design in `docs/DESIGN.md` § "IngredientCard States". Each card should show:
- Vietnamese name at 24px bold (`text-headline-md font-bold`) — large enough to read at arm's length
- English subtitle at 12px normal (`text-label-en`) below it
- Quantity as a large number (32px, `font-black`) colored by status: primary (green=`text-primary`), low=`text-tertiary`, out=`text-error`
- Unit label at 12px beside the quantity
- Status badge top-right: "Đủ" (sage green), "Sắp hết" (brown), "Hết" (red)
- Minus button (grey fill) and Plus button (terracotta fill), both 48×48px

- [ ] **Step 2: Check card status colors**

To trigger all three states, run in Supabase SQL Editor:
```sql
-- Set Đậu hũ to 0 (out of stock)
UPDATE items SET quantity = 0
WHERE name_vi = 'Đậu hũ'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1');

-- Set Hành lá to 2 (below threshold of 3 = low)
UPDATE items SET quantity = 2
WHERE name_vi = 'Hành lá'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1');
```

Reload `/kho`. You should see three distinct visual states: green/sage for sufficient, brown for low, red for out. The out-of-stock card should have a red border ring (`border-2 border-error ring-2`).

Restore afterward:
```sql
UPDATE items SET quantity = 20 WHERE name_vi = 'Đậu hũ'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1');
UPDATE items SET quantity = 10 WHERE name_vi = 'Hành lá'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1');
```

- [ ] **Step 3: Check the alert footer**

With items in low/out state, a sticky footer bar should appear at the bottom of the screen in `bg-error-container` (light salmon/pink) showing counts like "1 hết · 1 sắp hết". It should NOT appear when all items are sufficient.

- [ ] **Step 4: Check the top header**

The header should be fixed to the top, show the branch selector dropdown on the left, and a settings gear icon on the right (since you logged in as manager). It should use `bg-surface` (warm off-white `#fbf9f4`) with a `border-outline-variant` bottom border.

- [ ] **Step 5: Fix any visual discrepancy found**

If a component's class names don't match the DESIGN.md description, edit the component. Compare the exact class names in `components/ingredient-card.tsx` against the DESIGN.md § "IngredientCard States" table. Use only tokens defined in `globals.css @theme` — never hardcode hex values.

---

### Task 3: Audit the Đặt món (place order) screen

**Files:** `components/dish-row.tsx`, `app/(app)/dat-mon/page.tsx` — modify only if discrepancy found.

Open http://localhost:3000/dat-mon on 768px viewport.

- [ ] **Step 1: Check table grid**

Step 1 (table selection) should show a grid of table buttons. Each button should be at least 48px tall (`min-h-touch-target-min`), use rounded corners, and have a clear visual tap target.

- [ ] **Step 2: Check dish list**

After tapping a table, the dish list should appear. Each dish row (`DishRow` component) should show:
- Vietnamese name at 14px bold (`text-label-vi font-bold`)
- English subtitle at 12px below
- A "+" button at 48×48px on the right
- When qty > 0: a quantity number and "−" button appear beside "+"
- Low ingredient warning: amber text "Sắp hết nguyên liệu" below the dish name
- Unavailable: entire row greyed out (`opacity-50`) with red "Hết nguyên liệu" text, "+" still tappable with a confirmation dialog

- [ ] **Step 3: Check the review step**

Add 2 dishes, tap "Xem lại đơn". The review screen should show the table name, a list of dish name + quantity, and a "Xác nhận đặt món" confirm button in primary color.

- [ ] **Step 4: Place a test order end-to-end**

Complete the order placement. Expected result: redirected to `/kho`, stock quantities for the ordered dish's ingredients have decreased in Supabase.

Verify in SQL Editor:
```sql
SELECT name_vi, quantity FROM items
WHERE branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY name_vi;
```

Compare quantities before and after — they should have decreased by the recipe amounts × qty ordered.

---

### Task 4: Audit the Đang chạy (active orders) screen

**Files:** `components/order-card.tsx` — modify only if discrepancy found.

To see this screen populated, first place an order via `/dat-mon`. Then open http://localhost:3000/dang-chay on 768px viewport.

- [ ] **Step 1: Check pending order card layout**

The order card should show:
- Table name at 24px bold (left)
- "Đang nấu" status badge on the right in `bg-tertiary-fixed` (warm tan)
- Elapsed time label below the table name
- List of dish names and quantities
- A "Hủy" (cancel) button in red text with cancel icon
- No "Đã mang ra" button yet (dish is still pending)

- [ ] **Step 2: Check ready order card layout**

In a separate browser tab or window, open http://localhost:3000/kitchen and log in with the same test account. Tap "Xong" on the pending order.

Switch back to the Đang chạy tab — the card should update in real time (without page refresh) to show:
- "Xong" status badge in `bg-secondary-container` (sage green)
- The large "Đã mang ra / Delivered" button appearing in `bg-secondary` (dark sage green)

- [ ] **Step 3: Check urgency animation**

The `animate-pulse-critical` animation triggers on a ready order whose `ready_at` was more than 5 minutes ago. To simulate this, in Supabase SQL Editor:

```sql
UPDATE orders
SET ready_at = now() - interval '6 minutes'
WHERE status = 'ready'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY created_at DESC
LIMIT 1;
```

Reload `/dang-chay` — the card for that order should pulse with a red border shadow animation and show the "Quá hạn · X phút trước" elapsed label in red.

- [ ] **Step 4: Test deliver**

Tap "Đã mang ra" on a ready order. The card should disappear from the list immediately (realtime removes it). Verify in SQL Editor: `SELECT status FROM orders ORDER BY created_at DESC LIMIT 1;` — should show `delivered`.

- [ ] **Step 5: Test cancel**

Place a new order. On `/dang-chay`, tap "Hủy". The card should disappear. In SQL Editor, verify the order status is `cancelled` and that ingredient quantities were restored (cancellation reverses the stock decrement).

---

### Task 5: Audit the Kitchen screen

**Files:** `app/kitchen/page.tsx` — modify only if discrepancy found.

- [ ] **Step 1: Open kitchen in a separate browser tab**

Navigate to http://localhost:3000/kitchen. The kitchen page has its own layout (no sidebar, no branch selector). It should show "Bếp" in the header.

- [ ] **Step 2: Place an order from the FOH tab**

In another tab (logged in as manager), go to `/dat-mon` and place an order for one table. Switch back to the kitchen tab — the order card should appear in real time within 1–2 seconds.

- [ ] **Step 3: Check kitchen card layout**

The kitchen order card should show:
- Table name large and bold
- Elapsed time since order was created
- List of dishes with quantities (bold)
- "Xong ✓" full-width button in `bg-secondary` at the bottom

- [ ] **Step 4: Tap Xong and verify FOH updates**

Tap "Xong" on the kitchen card. In the FOH tab on `/dang-chay`, the order should change from "Đang nấu" to "Xong" in real time.

---

### Task 6: Audit the Settings screen (manager only)

**Files:** `app/(app)/settings/page.tsx` — modify only if discrepancy found.

Open http://localhost:3000/settings on 768px viewport.

- [ ] **Step 1: Check tab bar**

Four tabs should appear: "Nguyên liệu", "Món ăn", "Công thức", "Bàn". Active tab should have `border-primary text-primary` bottom border.

- [ ] **Step 2: Add a new ingredient**

In the Nguyên liệu tab, fill in:
- Tên (VI): `Mắm tôm`
- Name (EN): `Fermented shrimp paste`
- Đơn vị: `hũ`
- Ngưỡng thấp: `2`

Tap "+ Thêm nguyên liệu". The new row should appear in the list below and the form should reset.

- [ ] **Step 3: Deactivate an ingredient**

Tap "Tắt" on one ingredient. Its badge should change from "Hoạt động" to "Tắt". It should no longer appear on the Kho screen (which filters `is_active = true`).

- [ ] **Step 4: Verify recipe CRUD**

Switch to the Công thức tab. Select "Bún riêu đặc biệt" from the dropdown. The 6 recipe lines should appear. Add a new line (select Nước mắm, qty 0.5) — it should appear in the list.

- [ ] **Step 5: Commit if any components were modified**

If any component files were edited during Tasks 2–5, commit them:

```bash
git add components/ app/
git commit -m "fix: correct component classes to match DESIGN.md visual tokens"
```

If no components needed changes, skip this step.

---

## Self-Review Checklist

| Requirement | Covered by |
|---|---|
| Typography tokens missing in globals.css | Task 1 |
| text-headline-md renders at 24px | Task 1 Step 4 |
| Ingredient card 3 status states | Task 2 Step 2 |
| Alert footer appears/disappears | Task 2 Step 3 |
| Dish availability greyed out | Task 3 Step 2 |
| Stock decrements on order | Task 3 Step 4 |
| Ready order card with Đã mang ra button | Task 4 Step 2 |
| Urgency pulse animation | Task 4 Step 3 |
| Stock reversal on cancel | Task 4 Step 5 |
| Kitchen real-time order queue | Task 5 Steps 2–4 |
| Settings CRUD | Task 6 |
