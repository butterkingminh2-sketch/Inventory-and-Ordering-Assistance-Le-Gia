# Units Overhaul + Stock-Count Input — Design Spec

## Problem

First of several manager-facing sub-projects requested for this app (an analytics dashboard, a chat feature, and a menu import are separate sub-projects to be brainstormed later). This one fixes two related problems found by inspecting the real `items`/`recipe_lines` data:

1. **The recipe is wrong.** Every dish's `recipe_lines.qty_per_serving` for "Bún tươi" is `1.50` in a `kg` column — the system believes each bowl uses 1.5kg of raw noodles. At that rate the current 8kg stock would only cover ~5 bowls. This is an unvalidated placeholder, not a real measurement.
2. **Entering or correcting stock is painful.** Item quantities can currently only be adjusted via ±1 buttons. Setting an opening-of-day count for an item from scratch can mean dozens of taps.

## Scope

In scope:
- Converting the two continuous-measure items (Bún tươi: kg→g, Dầu ăn: lít→ml) to a finer base unit, and correcting Bún tươi's `qty_per_serving` to a real value (150g/bowl, per the user's reference for a standard Bún Riêu bowl) across all three dishes that use it.
- Replacing the free-text `unit` field (Settings → Nguyên liệu) with a fixed, closed list of allowed units, enforced both in the UI (a `<select>`) and at the database level (a `CHECK` constraint).
- A way to type an exact stock count directly into the existing Kho dashboard instead of only adjusting via ±1, available at all times (not a separate mode or screen).
- For the two continuous-measure items only, an input convenience: typing a count in the bigger everyday unit (kg, l) instead of the canonical small unit (g, ml), auto-converted on save.
- A distinct `stock_logs.reason` value (`'count'`) for typed-count corrections, separate from the existing `'manual_correction'` used by the ± buttons, so the two are distinguishable in history later.

Out of scope / explicitly deferred:
- The other 8 items (gói, phần, miếng, bó, viên, chai) — their stored values and units are already correct and are not touched.
- Dầu ăn getting a `recipe_lines` entry — it has none today and stays manual-only; oil is almost certainly used in bulk broth prep, not measurable per bowl, and assigning a per-serving amount would be another guess.
- Auto-converting a previously-recorded quantity if a manager changes an item's unit *after* stock has already accrued (see Error Handling).
- Persisting a staff member's last-used input unit (kg vs g) — every entry defaults to the canonical small unit; switching is a one-tap-per-entry convenience, not a saved preference.

## Architecture

**Fix the data once, via a migration — not a generalized unit-conversion engine.** Only two items need converting, and they're named explicitly in the migration (not matched by scanning for "anything currently in kg"), so a future item that's legitimately stored in some other unit is never accidentally caught by this one-time fix.

**The canonical unit stays small (g/ml); a unit *toggle* on the input is a presentation-only convenience.** Every part of the app that displays or calculates with an item's quantity (Kho cards, recipe math, low-stock comparisons) continues to use the same small unit it always will — `g` or `ml`. The new toggle never changes what's stored; it only changes what a person is allowed to *type*, converting once on confirm. This keeps recipe math exact (150g, not 0.15kg) while letting a manager who's holding a 5kg bag just type "5" and flip to kg instead of doing the multiplication themselves.

**A single reusable input component, used in two different reveal styles.** A new `QuantityInput` is just "a number field with an optional bigger-unit toggle next to it" — it has no opinion on how it's revealed. `IngredientCard` wraps it in a tap-to-reveal interaction (the existing big quantity number becomes the trigger). Settings' `low_threshold` field renders it directly, always visible, matching how every other Settings field already works. Same conversion logic, two natural presentations, no duplicated logic.

**The unit list is closed, not extensible through the UI.** `g, ml, gói, phần, miếng, bó, viên, chai` covers every unit currently in real use plus the two new base units. A `CHECK` constraint backs the UI's `<select>` so the restriction holds even against a direct API call. Adding a 9th unit later is a one-line change to the allowed list in both the DB constraint and the UI — not a feature to build preemptively.

## Data Model

New migration (`supabase/migrations/008_units_and_stock_count.sql`):
```sql
-- One-time correction, named explicitly — not a pattern match on current unit values.
UPDATE items
SET unit = 'g', quantity = quantity * 1000, low_threshold = low_threshold * 1000
WHERE name_vi = 'Bún tươi';

UPDATE items
SET unit = 'ml', quantity = quantity * 1000, low_threshold = low_threshold * 1000
WHERE name_vi = 'Dầu ăn';

UPDATE recipe_lines
SET qty_per_serving = 150
WHERE item_id = (SELECT id FROM items WHERE name_vi = 'Bún tươi');

ALTER TABLE items
  ADD CONSTRAINT items_unit_check
  CHECK (unit IN ('g', 'ml', 'gói', 'phần', 'miếng', 'bó', 'viên', 'chai'));
```

No column type changes — `numeric(8,2)` already comfortably holds gram/ml-scale values for a restaurant's realistic stock (max ~999,999.99).

`lib/types.ts`: add `export type ItemUnit = 'g' | 'ml' | 'gói' | 'phần' | 'miếng' | 'bó' | 'viên' | 'chai'` and change `Item.unit` from `string` to `ItemUnit`, so the app-level type matches the new DB guarantee.

`lib/stock.ts`: `applyStockChange`'s `reason` parameter gains `'count'` as a fourth allowed literal alongside the existing `'order' | 'manual_correction' | 'cancellation'`. No DB migration needed for this — `stock_logs.reason` has always been a plain `text NOT NULL` column with no `CHECK` constraint.

## Components & Files

New files:
- `lib/unit-conversion.ts` — a small lookup, `BIGGER_UNIT: Partial<Record<ItemUnit, { unit: string; factor: number }>> = { g: { unit: 'kg', factor: 1000 }, ml: { unit: 'l', factor: 1000 } }`, plus pure helper functions `toCanonical(displayValue: number, unit: ItemUnit, useBigger: boolean): number` and `fromCanonical(canonicalValue: number, unit: ItemUnit, useBigger: boolean): number` that the new component uses for the kg/g and l/ml conversion math.
- `components/quantity-input.tsx` — a controlled numeric input. Props: `{ value: number; unit: ItemUnit; onConfirm: (newCanonicalValue: number) => void; onCancel: () => void; autoFocus?: boolean }`. If `BIGGER_UNIT[unit]` exists, renders a small toggle pill next to the input (e.g. "g | kg") that re-expresses the *currently displayed* value in the newly chosen unit when tapped (it does not reinterpret already-typed text — toggling resets the field's text to the current value converted into the new unit, so there's never ambiguity about what a half-edited number means). Enter or blur confirms: parses the text, rejects non-finite or negative values by calling `onCancel()` unchanged, otherwise converts to canonical via `toCanonical` and calls `onConfirm`. Escape calls `onCancel()` directly.

Modified files:
- `components/ingredient-card.tsx` — adds local `editing: boolean` state. The big quantity number gains a tap target (dashed-underline affordance, matching the approved mockup) that sets `editing = true`. While editing, the number is replaced by `<QuantityInput value={qty} unit={item.unit} onConfirm={...} onCancel={() => setEditing(false)} autoFocus />`; confirming calls the new `onSetQuantity` prop and exits editing mode. The existing ± buttons and their `onAdjust` prop are unchanged — both interactions coexist.
- `app/(app)/kho/page.tsx` — adds `handleSetQuantity(itemId, newQuantity)`: looks up the item's current quantity, computes `delta = newQuantity − currentQuantity`, and (if non-zero) calls `applyStockChange([{ item_id: itemId, delta }], 'count', user.id)` — reusing the existing stock pipeline, just a new reason string. Passes this down to `IngredientCard` as the new `onSetQuantity` prop.
- `app/(app)/settings/page.tsx` — the Nguyên liệu tab's free-text `unit` input (both in the add-item form and the per-row editor) becomes a `<select>` populated from the fixed `ItemUnit` list. The `low_threshold` per-row input is replaced with `<QuantityInput>`, calling the existing `updateItem(id, 'low_threshold', canonicalValue)` on confirm.

## Data Flow

1. **Migration applied once** (manually, by the user, via the Supabase SQL Editor — consistent with how every prior migration this session has been applied): Bún tươi and Dầu ăn convert to g/ml with their values ×1000; Bún tươi's three recipe lines correct to 150; the `CHECK` constraint locks in the allowed unit list going forward.
2. **Daily count:** a manager taps "8000" on the Bún tươi card. It becomes an editable field showing "8000 g" with a "g | kg" toggle. They tap "kg", the field re-displays as "8" (8000 ÷ 1000), type "7.5", and confirm. `QuantityInput` converts 7.5 × 1000 = 7500 and calls `onSetQuantity('bun-tuoi-id', 7500)`. `KhoPage` computes `delta = 7500 − 8000 = −500`, logs it via `applyStockChange` with `reason: 'count'`.
3. **Settings unit selection:** when adding a new item, the manager picks a unit from the closed dropdown instead of typing one — no possibility of an inconsistent unit string entering the system.
4. **Discrete items unaffected:** tapping the count on "Đậu hũ" (unit `miếng`) shows the same `QuantityInput`, but since `miếng` has no entry in `BIGGER_UNIT`, no toggle renders — it behaves exactly like a plain number field.

## Error Handling

- **Invalid input (non-numeric, negative, empty):** `QuantityInput` calls `onCancel()` on confirm, discarding the edit and reverting to the original displayed value — no partial/garbage write ever reaches `applyStockChange`.
- **Changing an item's unit after stock has already accrued:** explicitly *not* handled by this sub-project. If a manager later changes, say, Đậu hũ's unit from `miếng` to `g`, the existing stored quantity number is not auto-converted — it would simply be redisplayed under the new unit's label with no actual unit conversion applied. Unit selection should be treated as a one-time setup decision made carefully when an item is created. This is a known, accepted limitation, not an oversight.
- **Stock-log audit trail:** distinguishing `'count'` (a typed recount) from `'manual_correction'` (a ± button nudge) in `stock_logs.reason` means a future report can answer "was today's opening count actually done?" by checking for a `'count'`-reason log per item today — though building that report itself is out of scope here (candidate for the later analytics sub-project).

## Testing

- `lib/unit-conversion.ts` — unit tests (Vitest): `toCanonical`/`fromCanonical` round-trip correctly for `g`/`kg` and `ml`/`l`; an item unit with no `BIGGER_UNIT` entry (e.g. `miếng`) returns the value unchanged regardless of the `useBigger` flag.
- `components/quantity-input.tsx` and the `ingredient-card`/`kho`/`settings` wiring are UI/integration glue — verified via `npm run build`, `npm run lint`, and a manual browser smoke test (tap Bún tươi's count, toggle to kg, type a value, confirm, verify the card updates and a `stock_logs` row with `reason = 'count'` appears with the correct delta; verify the Settings unit dropdown only offers the 8 fixed options; verify a discrete-unit item's count editor has no toggle).

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| Only Bún tươi (kg→g) and Dầu ăn (lít→ml) convert; the other 8 items are untouched | Scope, Data Model |
| Bún tươi's `qty_per_serving` corrected to the real 150g reference, same value across all 3 dishes | Data Model, Problem |
| Dầu ăn stays without a recipe_line (manual-only) | Scope |
| Unit field becomes a closed dropdown (no free text, no "other" escape hatch), backed by a DB `CHECK` | Architecture, Data Model |
| Stock count entered by tapping the number directly — no separate screen, no mode toggle (Option C) | Architecture, Components & Files |
| kg/g and l/ml input toggle, canonical storage unit stays small (g/ml) | Architecture, Components & Files, Data Flow |
| Toggling re-expresses the current value rather than reinterpreting typed text | Components & Files |
| Distinct `'count'` stock_logs reason, separate from existing `'manual_correction'` | Data Model, Error Handling |
