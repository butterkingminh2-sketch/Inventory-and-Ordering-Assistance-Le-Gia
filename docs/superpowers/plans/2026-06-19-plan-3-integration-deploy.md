# Plan 3: Integration & Deployment — Lê Gia Inventory App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the complete end-to-end order flow, verify all realtime subscriptions work across tabs, fix the Next.js middleware deprecation warning, and deploy to Vercel.

**Architecture:** No new features. This plan tests existing code paths that cross the Supabase boundary (orders, stock changes, realtime), then deploys to production. The middleware rename is a single file rename — Next.js 16 deprecated `middleware.ts` in favour of `proxy.ts`.

**Tech Stack:** Next.js 16 App Router · Supabase Realtime · Vercel · GitHub

**Prerequisite:** Plans 1 and 2 must be complete — database is seeded and every screen renders correctly on localhost.

---

## File Structure

```
middleware.ts              ← rename to proxy.ts (Next.js 16 deprecation fix)
```

All other changes in this plan are Vercel configuration steps, not code edits.

---

### Task 1: Full end-to-end order flow test

No code changes. This is a scripted test run in two browser tabs simultaneously.

**Setup:** Open two browser windows side by side:
- **Tab A** — http://localhost:3000 (logged in as `manager@legia.test`) 
- **Tab B** — http://localhost:3000/kitchen (same login, or a second kitchen-role user if you have one)

- [ ] **Step 1: Place an order from Tab A**

In Tab A, navigate to `/dat-mon`. Select "Bàn 3". Add:
- 1 × Bún riêu đặc biệt
- 2 × Bún riêu thường

Tap "Xem lại đơn", then "Xác nhận đặt món".

Expected: redirected to `/kho`. In Supabase SQL Editor, verify stock decreased:
```sql
SELECT name_vi, quantity FROM items
WHERE name_vi IN ('Bún tươi', 'Chả', 'Mọc', 'Riêu cua', 'Hành lá', 'Rau sống')
  AND branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY name_vi;
```
Bún tươi should have decreased by 4.5 (1.5×1 + 1.5×2), Chả by 4 (2×1 + 1×2), Mọc by 3 (3×1 only from đặc biệt).

- [ ] **Step 2: Verify order appears on kitchen Tab B in real time**

Switch to Tab B (kitchen). Without refreshing, the new order for Bàn 3 should appear within 2 seconds.

If it doesn't appear, check the browser console for Supabase Realtime errors. A common cause is the `orders` table not being in the `supabase_realtime` publication — re-run the verification from Plan 1 Task 1 Step 6.

- [ ] **Step 3: Kitchen marks order as Xong**

In Tab B, tap "Xong ✓" on the Bàn 3 order. Expected:
- The order disappears from the kitchen queue immediately (Tab B updates)
- In Tab A, navigate to `/dang-chay` — the order shows "Xong" status badge in real time

- [ ] **Step 4: FOH confirms delivery**

In Tab A on `/dang-chay`, tap "Đã mang ra" on the Bàn 3 order. Expected: card disappears from the list. Verify in SQL Editor:
```sql
SELECT status FROM orders
WHERE branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY created_at DESC
LIMIT 1;
```
Expected: `delivered`.

- [ ] **Step 5: Test order cancellation with stock reversal**

Place a second test order (any table, any dish). Before the kitchen processes it, go to `/dang-chay` and tap "Hủy".

Verify stock was restored in SQL Editor:
```sql
SELECT name_vi, quantity FROM items
WHERE branch_id = (SELECT id FROM branches WHERE name = 'Lê Gia - Chi nhánh 1')
ORDER BY name_vi;
```
The quantities should be back to what they were before you placed the cancelled order (the `apply_stock_change` reversal returned the ingredients to stock).

---

### Task 2: Realtime badge test

The ready-order count badge on the sidebar nav and bottom nav should update live as orders change state.

- [ ] **Step 1: Verify badge appears when order is ready**

Place an order. In the kitchen tab, tap "Xong". Switch back to Tab A without navigating — the badge on "Đang chạy" in the sidebar (tablet) or bottom nav (mobile) should increment to 1.

- [ ] **Step 2: Verify badge clears when order is delivered**

Still in Tab A, navigate to `/dang-chay` and deliver the ready order. The badge should disappear (back to 0).

- [ ] **Step 3: Verify branch switch clears the badge**

If there are ready orders for Chi nhánh 1, switch the branch selector in the header to "Lê Gia - Chi nhánh 2". The badge should update to reflect Chi nhánh 2's ready count (likely 0).

---

### Task 3: Fix Next.js middleware deprecation warning

The dev server logs `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.` This is caused by the file being named `middleware.ts` instead of `proxy.ts`. This is not a breaking error but will become one in a future Next.js version.

**Files:**
- Rename: `middleware.ts` → `proxy.ts`

- [ ] **Step 1: Rename the file**

```bash
git mv middleware.ts proxy.ts
```

- [ ] **Step 2: Verify dev server no longer shows the warning**

The dev server hot-reloads automatically. Check the terminal — the deprecation warning should be gone on the next request.

If the server doesn't pick it up, restart it (`Ctrl+C`, then `npm run dev`).

- [ ] **Step 3: Verify auth still works**

Open a new incognito window and navigate to http://localhost:3000/kho. You should be redirected to `/login` (proxy middleware is still guarding the routes). Log in — you should reach `/kho` successfully.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts middleware.ts
git commit -m "fix: rename middleware.ts to proxy.ts for Next.js 16 compatibility"
```

---

### Task 4: Pre-deployment checklist

No code changes. Verify these before pushing to GitHub.

- [ ] **Step 1: Run the test suite**

```bash
npm run test:run
```

Expected: all tests pass. Current test count is 12 tests across 4 files:
- `lib/__tests__/stock.test.ts` (5 tests)
- `lib/__tests__/dish-availability.test.ts` (4 tests)
- `lib/__tests__/order-urgency.test.ts` (3 tests)
- `app/login/__tests__/login.test.tsx` (2 tests)

If any test fails, fix it before deploying.

- [ ] **Step 2: Run a production build locally**

```bash
npm run build
```

Expected: Build completes with no errors. Warnings about missing `aria-` attributes or `key` props are acceptable but should be noted. TypeScript type errors are NOT acceptable.

If the build fails, read the error output and fix the issue before proceeding to Vercel.

- [ ] **Step 3: Verify `.env.local` is not in git**

```bash
git status
```

`.env.local` must NOT appear in the output. It must be listed in `.gitignore`. If it appears, run `git rm --cached .env.local` and commit before pushing.

- [ ] **Step 4: Check all commits are clean**

```bash
git log --oneline -10
```

Review the last 10 commits. No work-in-progress commits should be present.

---

### Task 5: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

If you haven't created a GitHub repository yet:

1. Go to github.com → New repository → name it `le-gia-inventory` (or similar), private
2. Copy the remote URL

Then:
```bash
git remote add origin https://github.com/YOUR-USERNAME/le-gia-inventory.git
git push -u origin main
```

If the repository already exists:
```bash
git push
```

- [ ] **Step 2: Import the project in Vercel**

1. Go to vercel.com → New Project
2. Click "Import Git Repository" → select `le-gia-inventory`
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: leave as `.` (the root)
5. Do NOT click Deploy yet — first add environment variables in Step 3

- [ ] **Step 3: Add environment variables**

In the Vercel project settings (before first deploy), go to "Environment Variables" and add all three:

| Name | Value | Where to find it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbG...` | Supabase dashboard → Project Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbG...` | Supabase dashboard → Project Settings → API → service_role secret key |

Add all three for the **Production** environment. Optionally add them for Preview as well.

- [ ] **Step 4: Deploy**

Click "Deploy". Vercel will build and deploy. Build time is typically 60–90 seconds.

Expected: deployment succeeds, Vercel shows a green checkmark and provides a production URL like `https://le-gia-inventory.vercel.app`.

- [ ] **Step 5: Smoke-test the production URL**

Open the production URL on a tablet (or browser DevTools at 768px). Test:
1. Navigate to `/login` — login form renders
2. Log in as `manager@legia.test` — redirected to `/kho`
3. Ingredient cards load
4. Place a test order — confirm stock decrements in Supabase

If the app loads but shows auth errors, check the Supabase project's "Authentication → URL Configuration" — the production URL must be added to the allowed redirect URLs list:
1. Supabase dashboard → Authentication → URL Configuration
2. Add the Vercel production URL to "Redirect URLs": `https://le-gia-inventory.vercel.app/**`
3. Also add the Site URL: `https://le-gia-inventory.vercel.app`
4. Save, then retry login on the production URL.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: production deployment verified on Vercel"
git push
```

---

## Self-Review Checklist

| Requirement | Covered by |
|---|---|
| Full order flow: place → kitchen marks ready → FOH delivers | Task 1 |
| Stock decrement verified after order | Task 1 Step 1 |
| Stock reversal verified after cancel | Task 1 Step 5 |
| Realtime badge updates live | Task 2 |
| Realtime order queue on kitchen | Task 1 Steps 2–3 |
| Next.js 16 deprecation warning removed | Task 3 |
| All tests pass | Task 4 Step 1 |
| Production build clean | Task 4 Step 2 |
| .env.local NOT committed | Task 4 Step 3 |
| Env vars added to Vercel | Task 5 Step 3 |
| Supabase redirect URLs updated | Task 5 Step 5 |
| Production smoke-test complete | Task 5 Step 5 |
