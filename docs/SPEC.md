# Lê Gia Inventory App — Product Specification

## 1. Problem

At Bún riêu Lê Gia, kitchen runs out of ingredients (giò, mọc, đậu hũ) mid-service without FOH knowing. FOH takes the order, kitchen can't fill it, the customer re-orders, everyone waits twice. This app solves two things:

1. **Real-time ingredient stock** — FOH sees what's available before taking an order.
2. **Order lifecycle visibility** — FOH can track, cancel, and confirm delivery of every order from a single screen.

---

## 2. Constraints (from CLAUDE.md)

- Next.js 14 App Router + TypeScript, Tailwind CSS, Supabase (Postgres + Realtime), Vercel.
- Tablet browser is the primary device (`md:` breakpoint = base experience). Desktop supported. Mobile phone is fallback only.
- Vietnamese as primary text label on every UI element. English subtitle below.
- Branch selector visible on FOH and manager screens. Kitchen shows branch as a static label only.
- All visual values (colors, spacing, font sizes) come from `/docs/DESIGN.md` — never invented.
- Do not use localStorage, sessionStorage, or any non-Supabase state that persists across sessions.
- Do not run `npm install` for any new package without confirming with user.
- Do not commit `.env.local`.

---

## 3. Users & Roles

Authentication: **Supabase Auth** (email + password). A `user_profiles` table links `auth.uid()` to a role and a branch.

| Role      | Can do |
|-----------|--------|
| `foh`     | View inventory dashboard; place orders; manage active orders (cancel, confirm delivery) |
| `kitchen` | View incoming order queue; mark orders done ("Xong") |
| `manager` | Everything FOH + kitchen can do; manage ingredients, dishes, recipes, and tables |

Each user belongs to one branch. A manager's branch determines which branch's data they manage by default; they may switch branches via the branch selector.

---

## 4. Database Schema

### 4a. Existing tables — approved alterations

```sql
-- Soft-delete support for ingredients
ALTER TABLE items ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Wire existing table_id to the new tables table
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_table FOREIGN KEY (table_id) REFERENCES tables(id);

-- Track when an order becomes ready (used for the 5-min urgency pulse on FOH screen)
ALTER TABLE orders ADD COLUMN ready_at timestamptz;
```

`orders.status` valid values: `pending` | `ready` | `delivered` | `cancelled`

Existing columns for reference:
```
branches    — id, name, created_at
items       — id, branch_id, name_vi, name_en, unit, quantity, low_threshold, is_active, created_at
orders      — id, branch_id, table_id, status, created_by, created_at
stock_logs  — id, item_id, delta, reason, created_by, created_at
```

### 4b. New tables

```sql
-- Dishes: sellable items on the menu (per branch)
dishes (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references branches(id) not null,
  name_vi     text not null,
  name_en     text,
  is_active   boolean default true,
  created_at  timestamptz default now()
)

-- Recipe lines: how much of each ingredient one serving of a dish uses
recipe_lines (
  id              uuid primary key default gen_random_uuid(),
  dish_id         uuid references dishes(id) on delete cascade not null,
  item_id         uuid references items(id) not null,
  qty_per_serving numeric(8,2) not null,
  unique (dish_id, item_id)
)

-- Pre-set tables per branch
tables (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid references branches(id) not null,
  label      text not null,
  is_active  boolean default true
)

-- Line items within an order
order_items (
  id       uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade not null,
  dish_id  uuid references dishes(id) not null,
  qty      int not null default 1
)

-- User profiles (extends Supabase Auth users)
user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  branch_id  uuid references branches(id) not null,
  role       text not null check (role in ('foh', 'kitchen', 'manager')),
  full_name  text
)
```

**Realtime enabled on:** `items` (existing), `orders` (existing), `order_items` (new).

---

## 5. Stock Decrement & Reversal Logic

### On order submit

1. Insert one row into `orders` (status = `pending`).
2. Insert one `order_items` row per dish line.
3. For every dish × `qty`, look up `recipe_lines` and decrement `items.quantity` by `qty_per_serving × qty` using `GREATEST(quantity - delta, 0)`.
4. Insert `stock_logs` rows (`reason = 'order'`, delta = negative).
5. If any item was floored at 0, surface a toast: *"Kho không đủ — đã cập nhật về 0"*.

### On order cancel

1. Set `orders.status = 'cancelled'`.
2. For each `order_items` row, look up `recipe_lines` and add back `qty_per_serving × qty` to `items.quantity`.
3. Insert `stock_logs` rows (`reason = 'cancellation'`, delta = positive).

**Concurrency:** Last-write-wins. No optimistic locking required at this stage.

---

## 6. Navigation

**FOH — 3-tab bottom bar:**

| Tab | Label | Badge |
|-----|-------|-------|
| 1 | 📦 Kho | — |
| 2 | ➕ Đặt món | — |
| 3 | 📋 Đang chạy | Count of `ready` orders |

**Kitchen** — no tab bar. Single full-screen view with static branch label in top bar.

**Manager** — uses FOH tab bar + settings icon in top bar for Item Management.

---

## 7. Screens

### 7a. Login
- Email + password form.
- Role-based redirect on success: `foh`/`manager` → Kho tab, `kitchen` → Order Queue.
- No public routes — every screen requires auth.

---

### 7b. FOH — Kho (Inventory Dashboard)

**Top bar:** branch selector (FOH + manager), last-updated timestamp.

**Grid:** 2-column tablet (`md:`), 3-column desktop (`lg:`). One card per active ingredient (`is_active = true`).

**Ingredient card:**
- Primary: `name_vi` (large). Secondary: `name_en` (muted).
- Quantity + unit (e.g., "3 phần").
- Status badge:
  - Green "Đủ" — `quantity > low_threshold`
  - Amber "Sắp hết" — `0 < quantity ≤ low_threshold`
  - Red "Hết" — `quantity = 0`
- Inline `+` / `−` buttons (FOH + manager). Each tap: `±1` to `items.quantity`, writes `stock_logs` row (`reason = 'manual_correction'`).

**Sticky bottom strip:** count of low + out-of-stock items in warm red. Hidden when all items are sufficient.

**Realtime:** subscription on `items` for current branch.

---

### 7c. FOH — Đặt món (Place Order)

Full-screen view via the "Đặt món" tab.

**Step 1 — Select table:** grid of active `tables` for the branch. Tap to highlight selection.

**Step 2 — Select dishes:** list of active `dishes` for the branch.
- Tap `+` / `−` to adjust quantity per dish.
- Amber badge **"Sắp hết"** on a dish if any recipe ingredient is `≤ low_threshold` (and > 0).
- Greyed out + **"Hết nguyên liệu"** if **any** recipe ingredient = 0. Still tappable; shows a confirmation dialog: *"Món này hiện không đủ nguyên liệu. Vẫn muốn đặt?"* before adding to the order.

**Step 3 — Review & submit:** table + dish summary. "Xác nhận đặt món" button triggers stock decrement logic. Navigates to Kho tab on success with a toast.

---

### 7d. FOH — Đang chạy (Active Orders)

Single view showing all live orders for the current branch. Oldest first.

**Pending row** (`status = 'pending'`):
- Table label, elapsed time since `created_at`, dish list + quantities.
- **Hủy** button → sets `status = 'cancelled'`, reverses stock, removes card.

**Ready row** (`status = 'ready'`):
- Same content + pulse/glow highlight if elapsed ≥ 5 minutes.
- **Hủy** button → cancel + stock reversal.
- **Đã mang ra** button → `status = 'delivered'`, removes card.

**Urgency pulse:** ready rows where `now() - ready_at ≥ 5 minutes` show a pulsing highlight.

**Tab badge:** count of `ready` orders only (the urgent ones).

**Realtime:** subscription on `orders` for current branch, `status IN ('pending', 'ready')`.

---

### 7e. Kitchen — Order Queue

**Top bar:** branch name as static label (no switcher). Role label "Bếp".

**Cards:** full-width, oldest at top. Each shows table label, time since order placed, dish list + quantities.

**Xong** button per card → sets `status = 'ready'` and `ready_at = now()`, removes card from queue.

**Realtime:** subscription on `orders` for current branch, `status = 'pending'`.

---

### 7f. Manager — Item Management

Settings icon in top bar, visible to `manager` role only.

| Section | Actions |
|---------|---------|
| Nguyên liệu (items) | Add (`name_vi`, `name_en`, `unit`, `low_threshold`); edit inline; deactivate (`is_active = false`) |
| Món ăn (dishes) | Add (`name_vi`, `name_en`); edit; deactivate |
| Công thức (recipes) | Per dish: add / edit / delete `recipe_lines` (ingredient + `qty_per_serving`) |
| Bàn (tables) | Add (`label`); rename; deactivate |

---

## 8. Business Rules & Edge Cases

| Situation | Behaviour |
|-----------|-----------|
| Any recipe ingredient = 0 after order submitted | Floor at 0. Toast warning. Order goes through. |
| Any recipe ingredient = 0 during order entry | Dish greyed out ("Hết nguyên liệu"). Tappable with warning before confirm. |
| Any recipe ingredient ≤ low_threshold during order entry | Dish shows amber "Sắp hết" badge. Orderable normally. |
| FOH cancels a pending or ready order | Stock reversed. `status = 'cancelled'`. Card removed from Đang chạy. |
| Kitchen taps "Xong" on a cancelled order | Guard: no-op if `status ≠ 'pending'`. |
| FOH taps "Đã mang ra" on a cancelled order | Guard: no-op if `status ≠ 'ready'`. |
| Two staff correct same ingredient simultaneously | Last-write-wins. No locking. Acceptable at 2 tablets/branch. |
| Supabase Realtime drops briefly | Auto-reconnects. No special UI treatment. |
| Manager switches branch via branch selector | All fetches re-run for new `branch_id`. Realtime subscriptions torn down and re-subscribed. |
| Stock reset between services | Out of scope v1. Manual `+` corrections are the fallback. |

---

## 9. Out of Scope (v1)

- QR code ordering
- Reservation / booking system
- Automatic stock reset / scheduled refill
- SMS or push notifications (browser tab only)
- Multi-branch combined view for managers
- Audit log read UI (stock_logs writes happen, no read screen)
- User account management UI (accounts created directly in Supabase Auth for now)

---

## 10. Open Dependencies Before Coding

1. **DESIGN.md** at `/docs/DESIGN.md` must exist before any UI component is written. Generate via Stitch MCP.
2. **Supabase migrations**: run ALTER statements (§4a) and new-table DDL (§4b) before any data-layer code.
3. **`.env.local`**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Never committed.
