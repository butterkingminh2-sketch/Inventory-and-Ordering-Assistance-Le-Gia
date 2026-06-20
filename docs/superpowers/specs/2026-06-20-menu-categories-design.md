# Menu Categorization + Dish Images — Design Spec

## Problem

This is sub-project #2 of a 4-part nav/UI redesign (sub-project #1, nav restructure, is complete and shipped). Đặt món currently shows every dish as a flat list — no grouping. The real physical menu spans 3 pages with many items across natural groupings (mains, drinks, hotpot, etc.), and as the owner digitizes more of it, a flat list will become unwieldy. Separately, dishes have no photos — the owner wants a boxed card layout (image top, name below) referencing their existing menu photography, replacing today's text-only row.

## Scope

In scope:
- A free-text `category` field on dishes, with dynamically-derived tabs in Đặt món's dish picker (an always-present "Tất cả" tab plus one tab per distinct category in use)
- A dish image (`image_url`), uploaded by the manager via Settings → Món ăn, stored in a new public Supabase Storage bucket
- Redesigning the dish list from a row layout to a boxed card grid (image top, name/status/controls below), with the entire card as the add-one tap target instead of a small precise button

Out of scope (other sub-projects in the larger redesign, or explicitly deferred):
- The re-order shortcut on Active Orders (sub-project #3)
- Toppings/add-ons and ingredient-removal notes (sub-project #4)
- A manager-curated fixed category list — free text was chosen deliberately over this
- Bulk menu import from the 3 physical menu pages — that's a data-entry task the owner will do via Settings once this is built, not something this plan automates

## Architecture

**Category tabs** deliberately diverge from the existing `tables.section` tab pattern in one important way: `tables.section` tabs filter to *only* the selected section, so a table with no section would become invisible once 2+ sections exist. For dishes, an explicit **"Tất cả" (All) pseudo-category is always the first tab and the default selection** — it shows every dish, categorized or not. Real category tabs (one per distinct non-null `category` value currently in use among the branch's active dishes) appear after it. Selecting a real category tab filters to exact matches only; uncategorized dishes simply never appear under a specific category tab, only under "Tất cả". If no dish has a category set yet (today's actual state), no category tabs render — just "Tất cả" implicitly being the only view, visually unchanged from today's flat list (no tab strip shown at all when there's nothing to tab between, matching the existing "tabs only show when 2+ exist" convention used for table sections).

**Dish card** replaces the current `DishRow` (renamed to `DishCard` — it's no longer a row, and keeping the old name would mislead future readers). Layout: image on top (fixed aspect box; a placeholder icon when `image_url` is null), name_vi + name_en below, then a row with the status label (text, as today: "Sắp hết nguyên liệu" / "Hết nguyên liệu" / nothing when available) and a small "−" button (only shown once qty > 0). **The entire card becomes the tap target for adding one** — tapping anywhere on an available/low-stock card increments its quantity by one, removing the need to hit a small "+" precisely on a tablet. The existing zero-stock override (confirm dialog to force-add despite "Hết nguyên liệu") is unchanged in behavior, just triggered by the card tap instead of a small button tap. The small "−" button still requires a precise tap, since removing a selection is the one action that should stay deliberate.

**Image upload**: a public Supabase Storage bucket (`dish-images`) holds the files. Upload happens client-side via the Supabase JS client (`supabase.storage.from('dish-images').upload(...)`), and the resulting public URL is what gets stored on the dish row — no signed URLs, no server-side processing, since these are non-sensitive menu photos. Bucket creation itself is a one-time manual step in the Supabase Dashboard (Storage → New bucket, public), same category of setup as a SQL migration — the implementation plan will give exact steps rather than assume it already exists.

## Data Model

New migration (`supabase/migrations/006_dish_category_image.sql`):
```sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS image_url text;
```

`lib/types.ts` `Dish` interface gains:
```ts
category: string | null
image_url: string | null
```

No changes needed to `recipe_lines`, `order_items`, or any billing/stock logic — category and image are purely presentational/organizational, orthogonal to the existing dish-availability (`getDishStatus`) and quantity-cap (`getMaxOrderableQty`) logic, both of which remain keyed by `dish_id` and recipe lines exactly as today.

## Components & Files

New files:
- `supabase/migrations/006_dish_category_image.sql` (above)

Modified files:
- `lib/types.ts` — `Dish.category`, `Dish.image_url`
- `components/dish-row.tsx` → renamed `components/dish-card.tsx`, component renamed `DishRow` → `DishCard`, full layout rewrite per Architecture above
- `app/(app)/dat-mon/page.tsx` — dish-picker step: derive category list from loaded dishes (`[...new Set(dishes.map(d => d.category).filter(...))]`), render the "Tất cả" + category tab strip (visually matching the existing table-section tab strip), filter the dish grid by selected category (or show all when "Tất cả" is selected), swap `DishRow` usage for `DishCard`, render as a grid (`grid grid-cols-2 md:grid-cols-3 gap-3`, matching the existing Kho ingredient-card grid convention) instead of a `divide-y` list
- `app/(app)/settings/page.tsx` — Món ăn tab: add a `category` text input (mirrors the existing `price` input pattern: state on `newDish`, an `updateDishCategory` handler matching `updateDishPrice`'s shape) and an image file picker. The upload logic is a local async function defined directly inside this page component (`async function uploadDishImage(file: File): Promise<string>`) — not a new `lib/` module, consistent with how every other dish/item/table mutation in this file is already inline rather than extracted. Called before insert for new dishes, or immediately on selection for existing dishes via a small "Đổi ảnh" button per row.

## Data Flow

**Adding a dish with an image**: manager fills name/price/category and picks a file in the add-dish form. On submit: if a file was selected, upload it to `dish-images/{random-uuid}.{ext}` first, get the public URL via `supabase.storage.from('dish-images').getPublicUrl(path)`, then insert the dish row with `image_url` set to that URL (or `null` if no file was picked). This is a two-step async sequence (upload, then insert), not a single DB write.

**Changing an existing dish's image**: a small "Đổi ảnh" button per dish row in Settings triggers the same upload-then-set-public-URL flow, followed by `supabase.from('dishes').update({ image_url }).eq('id', id)` — mirroring the existing `updateDishPrice`/`updateDishCategory` inline-edit pattern.

**Category tab filtering in Đặt món**: `selectedCategory` state defaults to `null` (meaning "Tất cả"). `visibleDishes = selectedCategory === null ? dishes : dishes.filter(d => d.category === selectedCategory)`. The categories tab strip only renders when at least one dish has a non-null `category` — otherwise nothing changes visually from today.

**Card tap-to-add**: `DishCard`'s root element becomes a `<button>` (or a `<div role="button">`) wrapping the whole card, `onClick` mapped to the same add-one logic `dat-mon/page.tsx` already wires to the dish row (`status === 'unavailable' ? handleAddUnavailable(dish.id) : adjustQty(dish.id, 1)`), with the small "−" button's own `onClick` calling `e.stopPropagation()` before `adjustQty(dish.id, -1)` so removing doesn't also trigger the card's add handler. The existing quantity cap (`getMaxOrderableQty`, `atMax` prop) and zero-stock override confirm dialog are unchanged — only the trigger surface (whole card vs small button) changes.

## Error Handling

- **Image upload fails** (network error, file too large, unsupported type): show an inline error message in the Settings form; do not insert/update the dish row until the upload either succeeds or the manager proceeds with no image. The dish can always be saved without an image (it's optional) — a failed upload should never block adding a dish entirely, just leave `image_url` null and let the manager retry the image separately.
- **Card tap registers during a card-to-card scroll gesture** (the classic "drag vs tap" ambiguity on touch devices): this is the same risk every other tappable card in this app already has (e.g. table-picker buttons, kitchen's full-card tap target) — no new handling needed beyond what the browser's native click-vs-scroll distinction already provides, consistent with existing patterns.

## Testing

- No new pure-logic functions are introduced (category filtering and tap-to-add are straightforward derived state / event wiring, not algorithms) — consistent with how the nav-restructure sub-project was verified: `npm run build`, `npm run lint`, and a manual browser smoke test (add a dish with an image and a category, confirm it appears under the right tab with its photo, confirm tapping the card adds it, confirm "Tất cả" always shows everything).
- The existing `getDishStatus`/`getMaxOrderableQty` test suites in `lib/__tests__/dish-availability.test.ts` are unaffected and should continue passing unchanged, since neither function's signature or behavior changes.

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| Free-text category, dynamic tabs (mirrors tables.section) | Architecture |
| "Tất cả" always first/default, fixes the invisible-uncategorized-dish risk | Architecture |
| File upload (not URL paste) for images, via Supabase Storage | Architecture, Data Model |
| Card layout: image top, name below, badge+minus row at bottom (Option A) | Architecture |
| Whole card is the add-one tap target, not a precise "+" | Architecture, Data Flow |
| Existing zero-stock override and quantity cap unchanged | Data Flow |
| Public bucket, no signed URLs | Architecture |
