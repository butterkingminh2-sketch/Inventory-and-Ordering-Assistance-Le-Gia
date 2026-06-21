# Toppings + Ingredient-Removal Notes — Design Spec

## Problem

This is sub-project #4 (the last) of a 4-part nav/UI redesign — sub-projects #1-3 are complete and shipped. The real menu has priced add-on items ("ĐỒ GỌI THÊM": Mọc, Giò tai, Trứng vịt lộn, etc.) that today can only be ordered as if they were any other dish, with no way to associate them with the bowl they're being added to, and no way to record a customer's removal request (e.g. "không đậu hũ" — no tofu) against a specific order line at all.

## Scope

In scope:
- Marking dishes as toppings/add-ons (`dishes.is_topping`), reusing the entire existing dish/recipe/stock/billing pipeline — a topping is not a new kind of entity, just a dish flagged as one
- A side-drawer panel, opened by tapping any `DishCard`, showing that dish's relevant toppings (sorted ingredient-relevant-first) and a free-text note field
- A `note` column on `order_items`, one per dish line, covering the whole quantity ordered for that line in this order
- Displaying notes wherever order_items already render (kitchen, Đang chạy, register receipt) — toppings need no special display handling since they're just ordinary dishes already rendered everywhere

Out of scope / explicitly simplified:
- True per-unit notes (e.g. "2 plain + 1 no-tofu" of the *same* dish in one order) — the cart's `quantities: Record<dishId, qty>` model stays as-is; a note applies to the entire quantity of that dish line. A genuinely mixed request gets written into the note's free text instead (e.g. "1 phần không đậu hũ"), same as a server would handle it on a paper ticket.
- Any explicit manager-curated association between a specific dish and specific toppings — relevance is derived automatically from shared recipe ingredients, not manually configured.
- Quantity stepper inside the panel for the base dish itself — each time the panel's OK is confirmed, it adds exactly one more unit of the base dish (with whatever toppings/note were set that pass). The existing small "−" button on the card still removes units without opening the panel.

## Architecture

**Toppings are dishes.** A new boolean column, `dishes.is_topping`, marks which dishes are eligible to appear inside the customization panel — independent of (but normally also tagged with) the dish's `category` from sub-project #2, since `category` controls which tab a dish shows under in the *main* grid, while `is_topping` controls whether it's offered inside *any* dish's panel. Decoupling these avoids fragile string-matching against a free-text category value. Toppings are added to the cart and to `order_items` exactly like any other dish — same `quantities` state, same price snapshot, same recipe-based stock decrement, same billing aggregation. No new mechanism needed for them anywhere else in the app.

**Panel trigger replaces instant-add.** Every tap on a `DishCard` now opens a side-drawer panel for that dish, instead of instantly adding one unit (the behavior built in sub-project #2). The panel shows: the dish's relevant toppings (computed by checking whether a topping dish's `recipe_lines` share any `item_id` with the tapped dish's `recipe_lines` — relevant ones sort first, everything else below), a free-text note field (pre-filled with the dish's current note, if one was already set this session), and an "OK" button. Confirming OK increments the base dish's quantity by 1, increments each selected topping's quantity by however many were tapped, and sets/overwrites the note for that dish line. Dismissing the panel without confirming (e.g. a close button or backdrop tap) adds nothing.

**Unavailable-dish override stays a separate gate, ahead of the panel.** If a dish is `unavailable` (out of stock), tapping it still shows the existing `window.confirm` override dialog first ("Món này hiện không đủ nguyên liệu. Vẫn muốn đặt?") — only after confirming does the panel open. This preserves the existing override behavior unchanged; it just moves before panel-opening instead of before instant-add.

**Notes flow straight through to wherever order_items already render.** Kitchen, Đang chạy (`OrderCard`), and the register receipt all already map over `order.order_items` — each just needs the note text shown alongside the dish name when present. No new query is needed since `order_items(*, ...)` selects already include every column.

## Data Model

New migration (`supabase/migrations/007_topping_and_notes.sql`):
```sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS is_topping boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS note text;
```

`lib/types.ts` additions:
- `Dish.is_topping: boolean`
- `OrderItem.note: string | null`

No changes to `recipe_lines`, `stock_logs`, or any billing/stock logic — a topping's stock decrement and price snapshot already work exactly like any other dish's, since it *is* one.

## Components & Files

New files:
- `lib/topping-relevance.ts` — pure function `sortToppingsByRelevance(dish: Dish, toppings: Dish[], recipeLines: RecipeLine[]): Dish[]`, returning the topping list with ingredient-sharing ones first, preserving relative order within each group.
- `components/topping-panel.tsx` — the side-drawer panel: receives the dish being customized, the sorted topping list, the dish's current note (if any), and calls `onConfirm({ toppingQuantities: Record<string, number>, note: string })` on OK or `onClose()` on dismiss without confirming. Each topping row has its own +/− stepper (each tap is ±1, with the running count shown next to it) — not a binary toggle — so ordering 2 of the same topping in one panel session is a normal case, not a special one.

Modified files:
- `components/dish-card.tsx` — `onAdd: () => void` is replaced with `onCardTap: () => void` (opens the panel instead of adding directly); the small "−" decrement button and its `onRemove` callback are unchanged.
- `app/(app)/dat-mon/page.tsx` — adds panel open/close state (which dish is being customized, if any), a `notes: Record<string, string>` state alongside the existing `quantities`, the unavailable-override-then-open-panel gating logic, the `onConfirm` handler that updates `quantities`/`notes` and closes the panel, and includes `note: notes[dish_id] || null` in the `order_items` insert.
- `app/(app)/settings/page.tsx` — Món ăn tab gains an "Là món gọi thêm" (is a topping) checkbox alongside the existing name/price/category/image fields.
- `components/order-card.tsx`, `app/kitchen/page.tsx`, `app/register/page.tsx` — each adds the note text under the relevant `oi.dish.name_vi` line whenever `oi.note` is present.

## Data Flow

1. FOH taps "Bún riêu chay" in the dish grid. If it's `unavailable`, the existing override `confirm()` fires first; on cancel, nothing else happens.
2. The panel opens for that dish: `sortToppingsByRelevance` filters `dishes` to `is_topping === true`, then sorts by whether each shares a `recipe_lines.item_id` with the tapped dish.
3. FOH taps "+" next to "Bún thêm" (now selected once in the panel's local draft state) and types "không đậu hũ" in the note field, then taps OK.
4. `onConfirm` fires: `quantities['bún-riêu-chay-id']` +1, `quantities['bún-thêm-id']` +1, `notes['bún-riêu-chay-id'] = 'không đậu hũ'`. Panel closes.
5. If FOH taps "Bún riêu chay" again later in the same order (to add a second one), the panel reopens pre-filled with the existing "không đậu hũ" note — confirming again adds another unit of the base dish and overwrites the note with whatever's in the field at that point (unchanged if untouched).
6. On submit, `order_items` insert includes `note: notes[dish_id] || null` per line — toppings typically have no note of their own (their `notes[dish_id]` entry is simply never set), but nothing prevents one if a future case needs it.
7. Kitchen, Đang chạy, and the register receipt all already iterate `order.order_items` — each renders `oi.note` under the dish name when present. Toppings need no special handling anywhere — "Bún thêm ×1" just appears as its own line, exactly like any other dish would.

## Error Handling

- **A dish has zero toppings flagged (`is_topping` never set for anything yet, e.g. right after this ships before any manager has flagged a dish)**: the panel still opens (consistent — every tap opens it), just shows an empty toppings section with only the note field and OK button. Confirming with nothing selected adds the plain dish, identical to today's instant-add behavior in net effect, just one tap slower.
- **Topping with no shared ingredient with any dish ever** (e.g. Trứng vịt lộn, a standalone add-on with no overlap): always sorts into the "other" group in every panel, never the "relevant" group — expected, not an error.

## Testing

- `lib/topping-relevance.ts` — unit tests (Vitest): a topping sharing an ingredient sorts before one that doesn't; multiple relevant toppings preserve their relative order; a dish with no recipe lines at all (no ingredients to match against) puts everything in the "other" group; toppings list excludes non-topping dishes entirely.
- `components/topping-panel.tsx` and the `dat-mon/page.tsx` wiring are UI/integration glue — verified via `npm run build`, `npm run lint`, and a manual browser smoke test (open the panel for a dish with known relevant toppings, confirm sort order; add a topping + note, confirm both end up correctly in `order_items` after submit; confirm notes show up in kitchen/Đang chạy/register).

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| Toppings are just dishes (`is_topping` flag, not a new entity) | Architecture, Data Model |
| "More of an existing ingredient" is also just a topping-dish | Architecture (no special mechanism needed) |
| Relevance sort: shared-ingredient toppings first, others below (not filtered out) | Architecture, Components & Files |
| Every card tap opens the panel (not instant-add, not a separate gear icon) | Architecture |
| Side-drawer panel (Option B layout) | Components & Files |
| OK confirms +1 unit of base dish + selected toppings + note | Data Flow |
| Note is one-per-dish-line, covers the whole quantity, no per-unit granularity | Scope |
| Unavailable-override confirm stays a gate before the panel, not replaced by it | Architecture |
| Notes displayed everywhere order_items already render, zero new queries | Architecture, Data Flow |
