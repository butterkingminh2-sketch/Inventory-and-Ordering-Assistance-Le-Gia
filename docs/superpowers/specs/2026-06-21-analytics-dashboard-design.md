# Analytics Dashboard — Design Spec

## Problem

Last of the six originally-requested manager-page sub-projects (units/stock-count, menu import, and real-time chat are all already shipped). Managers currently have no way to see which dishes are selling, or to know how urgently an ingredient needs restocking beyond Kho's simple "below threshold" badge — which doesn't account for how fast an item is actually being consumed.

## Scope

In scope:
- A new `/analytics` page ("Thống kê"), manager + owner only, with switchable date-range presets (today / 7 days / 30 days).
- A restock-urgency section: for each item, project days-remaining at the current consumption rate (reusing the existing recipe-based decrement math), surfacing anything under 3 days in a prominent warning box matching Kho's existing low-stock visual language.
- Two ranked lists: top 5 dishes by quantity sold, top 5 by revenue, for the selected date range.
- A "Nhắn bếp" (message kitchen) quick action per restock alert, opening the chat panel pre-filled with a draft message naming that item.

Out of scope / explicitly deferred:
- Any AI/chatbot layer on top of this data — already decided earlier (deterministic dashboard only, per explicit user choice).
- A custom date-range picker — only the three fixed presets.
- Adjustable urgency threshold (the 3-day cutoff) or adjustable top-N count (5) — both are fixed constants for v1, easily changed in code later, not exposed as settings.
- Restock alerts for items with zero consumption in the selected range — even if such an item is critically low by Kho's existing threshold, there's no meaningful burn rate to project a days-remaining number from, so it's excluded from this page (Kho's own low-stock badge still covers it).
- Per-dish profit margin, ingredient cost tracking, or any financial modeling beyond raw revenue (price × qty) — not requested.

## Architecture

**All metrics derive from existing tables — no new schema.** `orders`/`order_items` already hold everything needed for both the sales rankings and the restock projection; `recipe_lines` already define how an order line translates into ingredient consumption. This page is read-only aggregation over data that already exists, mirroring how `lib/billing.ts`'s `groupOrdersByTable` already aggregates the same `order_items` shape for a different purpose (one bill per table instead of one ranking per dish/item).

**Restock projection reuses the existing decrement math, run over a date range instead of one order.** `lib/stock.ts`'s `calculateDecrements(orderLines, recipeLines, reversal)` already computes "how much of each item does this set of order lines consume" — calling it with `reversal = true` returns positive consumption amounts directly (its sign convention already flips for that case, originally built for cancellation reversals but mathematically identical to what consumption reporting needs). A new `lib/analytics.ts` adds the parts that don't exist yet: computing a date-range boundary from a preset, dividing total consumption by the number of days in the range for a daily burn rate, and dividing current stock by that rate for days-remaining — returning `null` for any item with zero consumption in the range (avoiding a divide-by-zero and matching the explicit scope decision to exclude those items).

**"Today" reuses the same 6 AM operational-day boundary already established for chat, not literal midnight.** The chat sub-project already defined what "a day" means for this restaurant — `lib/chat.ts`'s `getPublicChannelCutoff` returns the most recent 6:00 AM local time, used there to reset the public chat. Measuring analytics' "today" from literal midnight instead would silently disagree with that and mix the last six hours of a prior late-night shift into "today." `getDateRangeStart(now, 'today')` calls `getPublicChannelCutoff(now)` directly rather than inventing a second, conflicting definition; `'7d'`/`'30d'` subtract 7 or 30 days from that same cutoff, so every preset's boundary lines up with the same operational-day convention.

**The chat integration reuses `ChatPanel` directly, bypassing the header's `ChatTrigger`.** `ChatTrigger` (the header icon) owns its own open/closed state internally with no way to inject a pre-filled draft from outside it. Rather than restructuring that, the Analytics page mounts its own separate `ChatPanel` instance when "Nhắn bếp" is tapped — the same pattern `app/(app)/dat-mon/page.tsx` already uses for `ToppingPanel` (a page mounting a panel component directly, not through a shared trigger). `ChatPanel` gains one new optional prop, `initialText?: string`, which seeds its existing internal `text` state instead of starting empty.

## Components & Files

New files:
- `lib/analytics.ts` — pure functions, no DB calls:
  - `getDateRangeStart(now: Date, preset: 'today' | '7d' | '30d'): Date` — start boundary for the selected preset, built on `getPublicChannelCutoff` from `lib/chat.ts` (today = that cutoff directly; 7d/30d = that same cutoff minus 7 or 30 days), keeping "a day" consistent with the operational-day boundary chat already established.
  - `rankByQuantity(orderItems: Array<{ dish_id: string; qty: number }>, dishes: Dish[], limit: number): Array<{ dish: Dish; qty: number }>` and `rankByRevenue(orderItems: Array<{ dish_id: string; qty: number; price_at_order: number | string }>, dishes: Dish[], limit: number): Array<{ dish: Dish; revenue: number }>` — both aggregate by `dish_id` first, then sort and slice to `limit`.
  - `getDaysRemaining(consumedInRange: number, daysInRange: number, currentStock: number): number | null` — returns `null` when `consumedInRange` is 0; otherwise `currentStock / (consumedInRange / daysInRange)`.
  - `getRestockAlerts(items: Item[], consumptionByItemId: Record<string, number>, daysInRange: number, urgencyThresholdDays: number): Array<{ item: Item; daysRemaining: number }>` — filters to items whose computed days-remaining is below the threshold, sorted most-urgent first.
- `app/(app)/analytics/page.tsx` — the page itself: date-range tab state, data fetching (orders/order_items/items/recipe_lines/dishes for the selected branch and range), rendering the restock-alert box, the two ranked lists, and the "Nhắn bếp" `ChatPanel` mount.

Modified files:
- `lib/stock.ts` — no logic change; `calculateDecrements` is reused as-is via its existing `reversal` parameter.
- `components/chat-panel.tsx` — adds the optional `initialText?: string` prop, defaulting the internal `text` state to it instead of `''`.
- `components/sidebar-nav.tsx` and `components/bottom-nav.tsx` — the existing manager-only tab-push condition is extended to `role === 'manager' || role === 'owner'`, and a new "Thống kê" tab (route `/analytics`, icon `bar_chart`) is added alongside Settings/Register.

## Data Flow

1. Manager opens "Thống kê," defaulting to the "Hôm nay" (today) preset. The page fetches all orders (and their `order_items`) for the current branch created since `getDateRangeStart(now, 'today')`, plus the branch's full `items`, `recipe_lines`, and `dishes` lists (same data shape `dat-mon`/`kho` already load).
2. `rankByQuantity`/`rankByRevenue` run over the fetched `order_items`, producing the two top-5 lists.
3. For the restock section: `order_items` are flattened into `{ dish_id, qty }` pairs and passed through `calculateDecrements(..., reversal = true)` to get total consumption per item; `getDaysRemaining` and `getRestockAlerts` turn that into the sorted, threshold-filtered alert list.
4. Manager taps "Nhắn bếp" next to "Bún tươi — còn ~1.5 ngày." The page sets local state holding a pre-filled draft (`"Bún tươi sẽ hết trong ~1.5 ngày"`) and mounts `<ChatPanel initialText={draft} ... />` directly; the manager can edit the text before sending, same as typing any other message.
5. Switching to "7 ngày" or "30 ngày" re-runs the same fetch with a different `getDateRangeStart` boundary — no new code path, just a different argument.

## Error Handling

- No orders in the selected range: both ranked lists render an empty-state message; the restock section shows nothing (consistent with "zero consumption excludes an item from this page" already being the designed behavior, not a special case to handle separately).
- An item appears in `recipe_lines` but was deleted/deactivated since: `getRestockAlerts` operates on the still-active `items` list, so a deactivated item simply won't appear, matching how deactivated items already disappear from Kho today.

## Testing

- `lib/analytics.ts` — Vitest unit tests: `getDateRangeStart` for each of the three presets (including that "today" matches `getPublicChannelCutoff`'s 6 AM boundary, not literal midnight, and that "7d"/"30d" subtract whole days from that same cutoff); `rankByQuantity`/`rankByRevenue` aggregate correctly across multiple order_items for the same dish and correctly truncate to `limit`; `getDaysRemaining` returns `null` for zero consumption and a correct positive number otherwise; `getRestockAlerts` correctly filters and sorts by urgency.
- The page itself and the `ChatPanel` `initialText` prop are UI/integration glue — verified via `npm run build`, `npm run lint`, and a manual browser smoke test (place a few orders, switch date-range presets, confirm the rankings and restock projection look reasonable, confirm "Nhắn bếp" opens chat with the expected pre-filled text).

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| Three fixed date-range presets, no custom picker | Scope, Components & Files |
| Top sellers ranked by both quantity AND revenue, as two separate lists | Components & Files, Data Flow |
| Restock urgency computed as days-remaining at current burn rate, reusing `calculateDecrements` | Architecture, Components & Files |
| Items with zero consumption excluded from restock alerts (not a divide-by-zero bug, a deliberate scope boundary) | Scope, Architecture, Error Handling |
| Manager + owner access (extends the existing manager-only nav pattern) | Components & Files |
| Restock-first, stacked layout (Option B), matching Kho's existing low-stock visual language | Scope (implied), confirmed via visual mockup |
| "Nhắn bếp" opens chat pre-filled with a draft, via a new `ChatPanel` prop rather than restructuring `ChatTrigger` | Architecture, Components & Files, Data Flow |
