# Register Role + Billing — Design Spec

## Problem

The app currently has no concept of price, payment, or billing. Front-of-house and kitchen staff can place orders, track stock, and mark orders delivered, but nothing tallies what a table owes or closes out a tab. We're adding a fourth role — **register** (cashier) — that tallies a table's running total and produces a printable receipt with a VietQR payment code.

## Scope

In scope:
- New `register` role, with its own screen and route guard
- Dish pricing (added to the existing `dishes` table)
- Per-table running tab, computed from existing `orders` + `order_items`
- Marking a table's orders as paid
- A printable, thermal-printer-sized receipt with a VietQR bank-transfer QR code

Out of scope (unchanged from `docs/SPEC.md` §9):
- QR code *ordering* (customer scan-to-order) — this feature only adds a payment QR on the receipt, which is a different thing
- Split bills / multiple simultaneous visits at the same table (see "Tab model" below)
- Cash drawer / change calculation, discounts, tax breakdown, refunds
- Any printer integration beyond the browser's native `window.print()`

## Architecture

A new `register` role is added alongside `foh` / `kitchen` / `manager`. It gets its own route (`/register`) with a layout guard mirroring `/kitchen`'s pattern: allows `register` and `manager` roles, redirects everyone else to `/kho`.

The register screen is a single-page flow with three steps (same state-machine pattern as Đặt món's `table → dishes → review`):

1. **List** — cards for tables that currently have an unpaid balance, grouped from existing Realtime-subscribed `orders`/`order_items`. Tables where everything has been delivered show a "Thanh toán" button; tables with a pending/cooking item show their blocking status instead (greyed out, no button).
2. **Confirm** — itemized breakdown of every unpaid order for that table, with a "Xác nhận thanh toán" button.
3. **Receipt** — printable view (itemized lines → total → VietQR at the bottom, with bank name/account shown as plain text underneath as a fallback), with a "In hóa đơn" button that calls `window.print()` against a print stylesheet scoped to just the receipt, sized for an 80mm thermal printer.

No backend/server code is needed for the QR — it's an `<img>` pointing at VietQR's public quick-link image endpoint (`img.vietqr.io`), with bank info, amount, and a transfer note baked into the URL query string. No API key required.

`/register` sits outside the `(app)` shell's `BranchContext` (no sidebar, no branch selector — same as `/kitchen`). It fetches the user's `branch_id` directly from `user_profiles` on mount, exactly like `app/kitchen/page.tsx` already does. A manager visiting `/register` sees only their `defaultBranchId`'s tables, not a switchable selector — consistent with how `/kitchen` behaves for a manager today.

## Tab Model

A table's bill = sum of every **non-cancelled** order for that table that hasn't been marked paid yet (`paid_at IS NULL`). Paying marks all of them paid at once, closing the tab. The next order placed for that table starts a fresh tab. There is no explicit "visit/session" entity — multiple orders placed for the same table over a meal are summed naturally by this query, and once paid, they're excluded from future tallies.

A table can only be checked out once **every** one of its currently-unpaid, non-cancelled orders has `status = 'delivered'`. If anything is still `pending` or `ready`, the register shows that table as not-yet-payable.

## Data Model

New migration (`supabase/migrations/004_register_billing.sql`):

```sql
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS price numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price_at_order numeric(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('foh', 'kitchen', 'manager', 'register'));
```

- `price_at_order` is filled in by Đặt món at order-submit time, copying the dish's current `price`. This makes every line item a permanent record of what was actually charged — later menu price changes never retroactively alter an existing bill or a reprinted receipt.
- A table's bill is computed client-side (same pattern as the existing Đang chạy screen): fetch the table's orders where `paid_at IS NULL AND status != 'cancelled'`, then sum `qty × price_at_order` across their `order_items`. No database view or stored total column needed.

`lib/types.ts` additions:
- `UserRole` gains `'register'`
- `Dish.price: number | string`
- `OrderItem.price_at_order: number | string`
- `Order.paid_at: string | null`

**Bank info** (shared by both branches) lives in env vars only — `NEXT_PUBLIC_VIETQR_BANK_BIN`, `NEXT_PUBLIC_VIETQR_ACCOUNT_NO`, `NEXT_PUBLIC_VIETQR_ACCOUNT_NAME`. No new Supabase table. `NEXT_PUBLIC_` prefix is fine since this info is printed on every receipt anyway — it isn't a secret. Changing the bank account requires a redeploy (acceptable trade-off, chosen over adding a new settings table).

## Components & Files

New files:
- `app/register/layout.tsx` — guard: allow `register` or `manager`, else redirect to `/kho` (mirrors `app/kitchen/layout.tsx`). Standalone layout, no sidebar.
- `app/register/page.tsx` — the 3-step flow (list → confirm → receipt), Realtime-subscribed to `orders` for the branch.
- `lib/billing.ts` — pure function `groupOrdersByTable(orders, orderItems)` → per-table `{ tableId, label, total, canCheckout, orderIds }`. Unit-testable, no Supabase calls.
- `lib/vietqr.ts` — pure function `buildVietQrUrl(amount, addInfo)` → the `img.vietqr.io` URL string.

Modified files:
- `lib/types.ts` — additions listed above
- `app/(app)/layout.tsx` — add `if (profile.role === 'register') redirect('/register')`, same pattern as the existing kitchen redirect
- `app/login/page.tsx` — route `register` role straight to `/register` after sign-in
- `app/(app)/dat-mon/page.tsx` — `handleSubmit` looks up each dish's current `price` (already loaded in the `dishes` array — no extra query) and writes `price_at_order` on the `order_items` insert
- `app/(app)/settings/page.tsx` — add a `price` input to the Món ăn (dishes) tab, alongside the existing name fields
- `components/sidebar-nav.tsx` — add a "Thu ngân / Register" link, visible only when `role === 'manager'` (same conditional pattern as the existing Settings link)

## Data Flow

**Placing an order (modified):** Đặt món already builds `orderLines` (dish_id + qty) and inserts into `order_items`. Before that insert, it now also reads each dish's current `price` from the already-loaded `dishes` array and includes `price_at_order: dish.price` per line.

**Register list:** On mount and on every Realtime `orders` change for the branch, fetch all orders where `paid_at IS NULL AND status != 'cancelled'`, with their `order_items` and `table.label`. `groupOrdersByTable` reduces this into one card per table: sum of `qty × price_at_order`, and `canCheckout = every order.status === 'delivered'`.

**Confirm step:** Tapping a checkout-ready table shows its itemized lines (dish name × qty × line total) and the grand total, with a "Xác nhận thanh toán" button.

**Marking paid:** On confirm, `UPDATE orders SET paid_at = now() WHERE table_id = X AND branch_id = Y AND paid_at IS NULL`. The gate already guarantees everything currently unpaid for that table is `delivered`. The `.select()` on the update returns the affected rows — used to build the receipt and to detect the race condition below.

**Receipt step:** Renders the confirmed items/total plus `<img src={buildVietQrUrl(total, addInfo)}>` and the bank name/account number as plain text underneath. `addInfo` is an ASCII-safe string like `LeGia Ban4 190626` (diacritics stripped) since some banking apps mangle Vietnamese accents in transfer notes. "In hóa đơn" calls `window.print()`, scoped via print CSS to only the receipt element, sized for 80mm.

## Error Handling

- **Race condition:** if a new order for that table arrives between opening the Confirm step and tapping pay, the `UPDATE ... WHERE paid_at IS NULL` simply won't include it — it stays as a fresh open tab. No double-charging risk.
- **Zero rows affected** (e.g. another register device already paid this table first): show an error toast, skip the receipt, and refresh the list instead of printing a receipt for a payment that didn't happen.
- **VietQR image fails to load:** bank name/account/amount are always shown as plain text alongside the QR, so the cashier can read it aloud as a fallback.

## Testing

- `lib/billing.ts` — unit tests: all-delivered table totals correctly, mixed pending/ready/delivered blocks checkout, cancelled orders excluded, multiple separate orders for one table sum correctly.
- `lib/vietqr.ts` — unit tests: URL structure, amount formatting, diacritic-stripping in `addInfo`, special-character encoding.
- Register page itself is a manual/browser smoke test (Supabase + `window.print()` + real QR rendering aren't practical to unit test), same as the rest of the app's pages.

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| VietQR via public `img.vietqr.io` quick-link, no API key | Architecture, Data Flow |
| One shared bank account for both branches | Data Model |
| Tab = sum of unpaid, non-cancelled orders per table | Tab Model |
| Checkout blocked until all orders delivered | Tab Model |
| Thermal printer (80mm), `window.print()` | Architecture, Data Flow |
| Register list layout: cards for open tabs only (not full grid) | Architecture |
| Receipt layout: items → total → QR at bottom | Data Flow |
| Bank info in env vars, not a new table | Data Model |
| Price snapshotted at order time, not live | Data Model |
| Manager can also access `/register` | Architecture, Components & Files |
