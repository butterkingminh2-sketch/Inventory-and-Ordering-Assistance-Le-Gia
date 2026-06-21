# Re-order Shortcut + Kitchen Order Grouping — Design Spec

## Problem

This is sub-project #3 of a 4-part nav/UI redesign (sub-projects #1 nav restructure, #2 menu categorization + dish images, are complete and shipped). Today, if a table that already has a live order wants more food (e.g. another bowl, or a topping), an FOH staff member must re-run the full Đặt món flow from the table-picker step, even though the table is already known — there's no shortcut from the Đang chạy (Active Orders) screen. Separately, building that shortcut surfaces a real consequence: if the original order is still cooking when the add-on is placed, the kitchen queue (which renders one card per order, not per table) would show two same-table cards with no visual relationship, which is confusing for kitchen staff mid-rush.

## Scope

In scope:
- A "+ Thêm món" button on every order card in Đang chạy, navigating to Đặt món pre-selected for that table and skipping the table-picker step
- Visually grouping a table's simultaneously-`pending` kitchen tickets so an add-on placed while the original is still cooking reads as connected, not as an unrelated duplicate

Out of scope:
- "Table tabs" for juggling multiple draft carts mid-order-build (the alternative considered and explicitly deferred in an earlier brainstorm — revisit only if losing in-progress cart state during interruptions turns out to be a real problem in practice)
- Any change to how Đang chạy itself displays multiple cards for one table (only the kitchen queue's grouping changes; Đang chạy keeps today's one-card-per-order display)
- Merging the underlying `orders` rows themselves — an add-on always creates a new, independent order row (this is required for the existing per-order stock-decrement/reversal and per-order billing logic to keep working correctly; see Architecture)

## Architecture

**Re-order navigation**: a URL query parameter (`/dat-mon?table=<tableId>`) carries the selected table from Đang chạy to Đặt món — no new Context, no storage of any kind (this is a navigation parameter, not persisted state, so it doesn't run into CLAUDE.md's storage restrictions). Đặt món checks this param once its `tables` list has loaded; if it matches an active table for the branch, it pre-sets `selectedTable` and jumps straight to the dish-picker step. If the param is absent, or doesn't match anything (wrong branch, deactivated table, or just a normal visit), it falls back to today's table-picker step unchanged.

**Why a new order, not an edit to the existing one**: an add-on placed via the shortcut always creates a brand-new `orders` row (exactly like any other order placement), never mutates an existing order's items. This is a hard constraint from existing architecture, not a simplification: `stock_logs` rows are linked to the specific `order_id` that caused them (added during an earlier bug fix this session), and reversing a cancelled order works by negating exactly the logged rows for that order's ID — retroactively appending items to an existing order would break that 1:1 correspondence. Likewise, register billing sums a table's tab across however many separate orders it has; a new order for an already-active table is already handled correctly by that existing logic (it was explicitly designed to support multiple orders per table).

**Kitchen grouping**: the kitchen queue currently fetches all `pending` orders for the branch and renders one card per order. A new pure function, `groupAdjacentByTable(orders)`, reorders an already-`created_at`-ascending-sorted list so that orders sharing a `table_id` become contiguous — each group's position in the overall list is anchored to its *oldest* order (so a table's overall queue position/urgency is unaffected by grouping), and orders within a group stay ordered oldest-first. The kitchen page then tags an order as an add-on whenever the immediately preceding order in this reordered list shares its `table_id` — no need for an O(n²) scan, since adjacency after grouping is sufficient to detect it.

Rendering: each order is still its own full, independently-tappable card (same internals as today — table label, elapsed time, item list, full-width "Xong" button as the entire tap target). When an order is tagged as an add-on, its card renders with zero top margin from the previous card (so they visually touch) and square corners where they meet (rounded only on the outer edges of the stack), plus an "ĐƠN MỚI" badge and an accent-colored border to distinguish it. Each card's "Xong" button still only ever resolves `handleXong(order.id)` for its own order — completing one has zero effect on the other, since a cook may finish them at different times.

Note: this grouping only ever has visible effect while 2+ orders for the same table are simultaneously `pending` — the moment either is marked `ready`, it leaves the kitchen queue entirely (kitchen only ever queries `status = 'pending'`), so there's never a stale "ĐƠN MỚI" tag lingering after the situation that caused it has resolved.

## Components & Files

New files:
- `lib/order-grouping.ts` — exports `groupAdjacentByTable(orders: OrderWithDetails[]): OrderWithDetails[]`, a pure function (no DB calls), unit-testable like the other pure-logic modules already in this codebase (`lib/billing.ts`, `lib/dish-availability.ts`, `lib/stock.ts`).

Modified files:
- `components/order-card.tsx` — new "+ Thêm món" button, always rendered alongside the existing Hủy/Đã mang ra buttons, calling a new `onReorder: (tableId: string) => void` prop (the card stays presentational; navigation lives in the page, same pattern as the existing `onCancel`/`onDeliver` props)
- `app/(app)/dang-chay/page.tsx` — new `handleReorder(tableId)` calling `router.push('/dat-mon?table=' + tableId)`; needs `useRouter` from `next/navigation` (not currently imported here)
- `app/(app)/dat-mon/page.tsx` — reads `useSearchParams()` for a `table` param once `tables` has loaded; if it matches an active table, sets `selectedTable` and `step` to `'dishes'` directly
- `app/kitchen/page.tsx` — runs the fetched orders through `groupAdjacentByTable` before rendering; computes the add-on tag per order based on adjacency to the previous order in that list; adjusts each card's margin/corner classes and adds the "ĐƠN MỚI" badge + accent border when tagged

## Data Flow

1. FOH taps "+ Thêm món" on Bàn 4's card in Đang chạy → `handleReorder('bàn-4-id')` → `router.push('/dat-mon?table=bàn-4-id')`.
2. Đặt món loads tables as usual; once loaded, checks the `table` search param against the loaded list. Match found → `setSelectedTable('bàn-4-id')`, `setStep('dishes')`. The rest of the flow (dish-picker → review → submit) is completely unchanged from today — submitting creates a new `orders` row for Bàn 4, with its own `order_items`, its own stock decrement (tied to its own `order_id` via the existing `applyStockChange(..., order.id)` call), exactly like any other order.
3. If Bàn 4's *original* order is still `pending` in the kitchen queue, the new order also lands there as `pending`. `groupAdjacentByTable` places it immediately after Bàn 4's original order in the render list (regardless of where it would naturally sort by `created_at` alone, since other tables' orders could be interleaved in between). The kitchen page detects the adjacency and renders it as a connected, "ĐƠN MỚI"-tagged card.
4. The cook completes each independently — tapping "Xong" on either card only changes that one order's status to `ready`, which removes it from the kitchen queue (and the grouping naturally stops applying once only one of the pair remains `pending`).

## Error Handling

- **`table` param refers to a table that's been deactivated or belongs to a different branch since the shortcut was tapped** (e.g. a manager deactivates it in Settings in the few seconds between the tap and the page loading): the match check naturally fails (it's not in the loaded `tables` array), and Đặt món silently falls back to the normal table-picker step — no error message needed, since this degrades to exactly today's experience.
- **Two add-ons placed back-to-back for the same table while the original is still cooking** (3 simultaneously-pending orders for one table): `groupAdjacentByTable`'s grouping handles any group size, not just pairs — all three would stack contiguously, with the 2nd and 3rd both tagged as add-ons relative to their immediate predecessor.

## Testing

- `lib/order-grouping.ts` — unit tests (Vitest, following the same pattern as `lib/billing.ts`'s tests): orders for distinct tables stay in their original relative order; two orders for the same table become adjacent even if other tables' orders were originally interleaved between them; a group's position is anchored to its oldest member (an older order for table A appearing before a newer one for table B keeps table A's group earlier in the list even after grouping); three-or-more orders for one table all end up contiguous.
- `app/(app)/dat-mon/page.tsx`'s new search-param handling and `app/kitchen/page.tsx`'s new tagging logic are UI/integration glue, not algorithms — verified via `npm run build`, `npm run lint`, and a manual browser smoke test (tap the shortcut from a real table with an active order; place two near-simultaneous orders for the same table and confirm the kitchen view stacks them as designed).

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| "+ Thêm món" always visible, on every card (no per-table dedup) | Components & Files |
| URL query param, not Context/storage | Architecture |
| Skip straight to dish-picker step, not review | Data Flow |
| New order row, never mutate an existing order's items | Architecture (rationale tied to stock-reversal/billing correctness) |
| Kitchen-only grouping; Đang chạy unaffected | Scope |
| Two full stacked cards (Option B), not one merged card | Architecture |
| Each card independently tappable/completable | Architecture, Data Flow |
| Grouping only matters while both orders share `pending` status | Architecture (note) |
