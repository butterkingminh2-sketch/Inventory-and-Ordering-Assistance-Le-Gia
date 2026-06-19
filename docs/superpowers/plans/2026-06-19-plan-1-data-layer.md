# Plan 1: Data Layer — Lê Gia Inventory App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the Supabase database with branches, a test manager user, and realistic seed data so every screen in the app has data to render.

**Architecture:** All steps are pure SQL run in the Supabase SQL Editor. No code files are touched. Migrations in `supabase/migrations/` are assumed to already be applied — Task 1 verifies this before any seeding begins.

**Tech Stack:** Supabase dashboard SQL Editor · PostgreSQL

---

## File Structure

No code files are created or modified in this plan. All work is done in the Supabase dashboard:
- **SQL Editor** — run each SQL block as a new query
- **Authentication → Users** — create the test user account

---

### Task 1: Verify all migrations are applied

**Files:** None

- [ ] **Step 1: Open Supabase SQL Editor**

Go to your Supabase project dashboard → SQL Editor → New query.

- [ ] **Step 2: Check all 9 tables exist**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected — all 9 must appear:
```
branches
dishes
items
order_items
orders
recipe_lines
stock_logs
tables
user_profiles
```

If any table is missing, go to SQL Editor and paste + run the content of the relevant migration file (`supabase/migrations/001_new_tables.sql` or `002_alter_existing.sql`) before continuing.

- [ ] **Step 3: Verify the `apply_stock_change` RPC exists**

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'apply_stock_change';
```

Expected: one row with `apply_stock_change`. If missing, re-run `001_new_tables.sql`.

- [ ] **Step 4: Verify `items.is_active` column exists**

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'items'
  AND column_name  = 'is_active';
```

Expected: one row. If missing, run this in SQL Editor:

```sql
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
```

- [ ] **Step 5: Verify `orders.ready_at` column exists**

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'orders'
  AND column_name  = 'ready_at';
```

Expected: one row. If missing, run:

```sql
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at timestamptz;
```

- [ ] **Step 6: Verify Realtime is enabled on the three required tables**

```sql
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```

Expected: `items`, `order_items`, `orders` all appear.

If any are missing, run:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE items;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
```

---

### Task 2: Seed branches

**Files:** None

- [ ] **Step 1: Insert the two Lê Gia branches**

```sql
INSERT INTO branches (name)
VALUES
  ('Lê Gia - Chi nhánh 1'),
  ('Lê Gia - Chi nhánh 2')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify and note the UUIDs**

```sql
SELECT id, name FROM branches ORDER BY name;
```

Expected: 2 rows. Copy the UUID for `Lê Gia - Chi nhánh 1` — you will paste it into Task 3 Step 2.

---

### Task 3: Create the test manager user

**Files:** None

- [ ] **Step 1: Create a user via Supabase Auth dashboard**

Go to Supabase dashboard → **Authentication → Users → Add user**:
- Email: `manager@legia.test`
- Password: `TestPass123!`
- Click "Create user"

After creation, click the user row to view its details and copy the **UUID** (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

- [ ] **Step 2: Create the `user_profiles` row**

Replace the two placeholders with the real UUIDs from Step 1 and Task 2 Step 2:

```sql
INSERT INTO user_profiles (id, branch_id, role, full_name)
VALUES (
  'PASTE-USER-UUID-HERE',    -- from Authentication → Users
  'PASTE-BRANCH-UUID-HERE',  -- from SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1'
  'manager',
  'Quản lý Test'
);
```

- [ ] **Step 3: Verify the profile joined to user and branch**

```sql
SELECT u.email, p.role, p.full_name, b.name AS branch
FROM user_profiles p
JOIN auth.users u ON u.id = p.id
JOIN branches   b ON b.id = p.branch_id;
```

Expected: one row — `manager@legia.test | manager | Quản lý Test | Lê Gia - Chi nhánh 1`.

---

### Task 4: Seed ingredients (items)

**Files:** None

Uses a CTE to look up the branch UUID by name — no hardcoded UUIDs needed.

- [ ] **Step 1: Insert 10 ingredients for Chi nhánh 1**

```sql
WITH b AS (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
INSERT INTO items (branch_id, name_vi, name_en, unit, quantity, low_threshold, is_active)
SELECT b.id, name_vi, name_en, unit, quantity::numeric, threshold::numeric, true
FROM b, (VALUES
  ('Bún tươi',  'Fresh rice vermicelli', 'kg',    '20', '5'),
  ('Chả',       'Pork roll',             'phần',  '30', '8'),
  ('Mọc',       'Pork balls',            'viên',  '40', '10'),
  ('Đậu hũ',    'Tofu',                  'miếng', '20', '6'),
  ('Riêu cua',  'Crab paste',            'phần',  '15', '4'),
  ('Hành lá',   'Spring onion',          'bó',    '10', '3'),
  ('Rau sống',  'Fresh herbs',           'phần',  '25', '6'),
  ('Bột ngọt',  'MSG',                   'gói',   '10', '2'),
  ('Nước mắm',  'Fish sauce',            'chai',  '5',  '1'),
  ('Dầu ăn',    'Cooking oil',           'lít',   '3',  '1')
) AS v(name_vi, name_en, unit, quantity, threshold);
```

- [ ] **Step 2: Verify**

```sql
SELECT name_vi, quantity, low_threshold, unit
FROM items
WHERE branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY name_vi;
```

Expected: 10 rows.

---

### Task 5: Seed dishes and recipe lines

**Files:** None

- [ ] **Step 1: Insert 3 dishes for Chi nhánh 1**

```sql
WITH b AS (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
INSERT INTO dishes (branch_id, name_vi, name_en, is_active)
SELECT b.id, name_vi, name_en, true
FROM b, (VALUES
  ('Bún riêu đặc biệt', 'Special bun rieu'),
  ('Bún riêu thường',   'Regular bun rieu'),
  ('Bún riêu chay',     'Vegetarian bun rieu')
) AS v(name_vi, name_en);
```

- [ ] **Step 2: Verify dishes**

```sql
SELECT name_vi FROM dishes
WHERE branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY name_vi;
```

Expected: 3 rows.

- [ ] **Step 3: Insert recipe lines for Bún riêu đặc biệt**

```sql
INSERT INTO recipe_lines (dish_id, item_id, qty_per_serving)
SELECT
  (SELECT id FROM dishes WHERE name_vi = 'Bún riêu đặc biệt' LIMIT 1),
  (SELECT id FROM items  WHERE name_vi = v.item_name
     AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1') LIMIT 1),
  v.qty
FROM (VALUES
  ('Bún tươi',  1.5),
  ('Chả',       2.0),
  ('Mọc',       3.0),
  ('Riêu cua',  1.0),
  ('Hành lá',   1.0),
  ('Rau sống',  1.0)
) AS v(item_name, qty)
ON CONFLICT (dish_id, item_id) DO NOTHING;
```

- [ ] **Step 4: Insert recipe lines for Bún riêu thường**

```sql
INSERT INTO recipe_lines (dish_id, item_id, qty_per_serving)
SELECT
  (SELECT id FROM dishes WHERE name_vi = 'Bún riêu thường' LIMIT 1),
  (SELECT id FROM items  WHERE name_vi = v.item_name
     AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1') LIMIT 1),
  v.qty
FROM (VALUES
  ('Bún tươi',  1.5),
  ('Chả',       1.0),
  ('Riêu cua',  1.0),
  ('Hành lá',   1.0),
  ('Rau sống',  1.0)
) AS v(item_name, qty)
ON CONFLICT (dish_id, item_id) DO NOTHING;
```

- [ ] **Step 5: Insert recipe lines for Bún riêu chay**

```sql
INSERT INTO recipe_lines (dish_id, item_id, qty_per_serving)
SELECT
  (SELECT id FROM dishes WHERE name_vi = 'Bún riêu chay' LIMIT 1),
  (SELECT id FROM items  WHERE name_vi = v.item_name
     AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1') LIMIT 1),
  v.qty
FROM (VALUES
  ('Bún tươi', 1.5),
  ('Đậu hũ',   2.0),
  ('Rau sống',  1.0),
  ('Hành lá',   1.0)
) AS v(item_name, qty)
ON CONFLICT (dish_id, item_id) DO NOTHING;
```

- [ ] **Step 6: Verify recipe lines**

```sql
SELECT d.name_vi AS dish, i.name_vi AS ingredient, r.qty_per_serving
FROM recipe_lines r
JOIN dishes d ON d.id = r.dish_id
JOIN items  i ON i.id = r.item_id
ORDER BY d.name_vi, i.name_vi;
```

Expected: 15 rows total (6 + 5 + 4).

---

### Task 6: Seed seating tables

**Files:** None

- [ ] **Step 1: Insert seating tables for Chi nhánh 1**

```sql
WITH b AS (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
INSERT INTO tables (branch_id, label, is_active)
SELECT b.id, label, true
FROM b, (VALUES
  ('Bàn 1'), ('Bàn 2'), ('Bàn 3'), ('Bàn 4'),
  ('Bàn 5'), ('Bàn 6'), ('Bàn 7'), ('Bàn 8'),
  ('Mang về')
) AS v(label);
```

- [ ] **Step 2: Verify**

```sql
SELECT label FROM tables
WHERE branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY label;
```

Expected: 9 rows.

---

### Task 7: Smoke-test the app with real data

**Files:** None

Ensure the dev server is running (`npm run dev` in the project root). If it stopped, start it again.

- [ ] **Step 1: Log in as the test manager**

Open http://localhost:3000. You should be redirected to `/login`.

Enter:
- Email: `manager@legia.test`
- Password: `TestPass123!`

Expected: redirected to `/kho`.

- [ ] **Step 2: Verify Kho shows ingredient cards**

On `/kho`, you should see 10 ingredient cards in a 2-column (tablet) grid. Each card shows Vietnamese name, English subtitle, quantity, unit, and status badge.

If the cards are blank or missing, open browser DevTools → Console and report any red errors.

- [ ] **Step 3: Verify Đặt món shows tables and dishes**

Navigate to `/dat-mon`. Step 1 (table selection) should show 9 tables. After tapping a table, Step 2 should show 3 dishes.

- [ ] **Step 4: Verify ingredient quantity affects dish availability**

In Supabase SQL Editor, set Đậu hũ to 0:
```sql
UPDATE items
SET quantity = 0
WHERE name_vi = 'Đậu hũ'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1');
```

Reload `/dat-mon` → select a table → the dish list should show "Bún riêu chay" greyed out with "Hết nguyên liệu" warning.

Restore afterward:
```sql
UPDATE items
SET quantity = 20
WHERE name_vi = 'Đậu hũ'
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1');
```

- [ ] **Step 5: Verify branch selector shows both branches**

The top header branch selector (`<select>`) should show both "Lê Gia - Chi nhánh 1" and "Lê Gia - Chi nhánh 2". Switching to Chi nhánh 2 should show empty ingredient cards (no data seeded for it yet).

---

## Self-Review Checklist

| Requirement | Covered by |
|---|---|
| branches table populated | Task 2 |
| Test manager user with role + branch_id | Task 3 |
| items seeded with realistic Vietnamese names | Task 4 |
| dishes seeded | Task 5 |
| recipe_lines wiring dishes to items | Task 5 Steps 3–5 |
| seating tables seeded | Task 6 |
| All queries verified | Tasks 1–6 Step 2/3/6/7 |
| End-to-end smoke test | Task 7 |
