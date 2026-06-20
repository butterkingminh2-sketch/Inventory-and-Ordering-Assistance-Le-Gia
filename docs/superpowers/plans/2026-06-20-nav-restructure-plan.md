# Nav Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim FOH's navigation to just Đặt món + Đang chạy, and replace the cluttered top bar (branch selector + manager-only gear icon) with a condensed right-aligned Account menu (with the app's first logout) + Chat placeholder icon, applied consistently across foh/manager/kitchen/register.

**Architecture:** A new `AccountMenu` client component (icon + name/role, dropdown with logout and — manager-only — the existing branch switcher) replaces the old header chrome in three places: the FOH/manager shell, the kitchen layout, and the register layout. Each of those three server layouts already queries `user_profiles` for its own auth guard and just needs `full_name` added to that query to feed the new component. No schema changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Auth, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-20-nav-restructure-design.md` — read this for full rationale; this plan only implements it.

---

### Task 1: Trim FOH navigation (sidebar + mobile bottom nav)

**Files:**
- Modify: `components/sidebar-nav.tsx`
- Modify: `components/bottom-nav.tsx`

The design spec only discusses the desktop sidebar, but `bottom-nav.tsx` is a separate component with its own hardcoded tab list for the mobile view — it shows Kho to every role today, including foh. Both need the same trim or FOH would lose Kho on desktop but keep it on mobile.

- [ ] **Step 1: Trim the desktop sidebar's tabs for `foh`**

In `components/sidebar-nav.tsx`, find:
```tsx
  const tabs: Tab[] = [
    { href: '/kho',       labelVi: 'Kho',       labelEn: 'Inventory',    icon: 'inventory_2' },
    { href: '/dat-mon',   labelVi: 'Đặt món',   labelEn: 'Place Order',  icon: 'add_shopping_cart' },
    { href: '/dang-chay', labelVi: 'Đang chạy', labelEn: 'Active Orders', icon: 'receipt_long', badge: readyCount },
  ]

  if (role === 'manager') {
    tabs.push({ href: '/register', labelVi: 'Thu ngân', labelEn: 'Register', icon: 'point_of_sale' })
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }
```
Replace with:
```tsx
  const tabs: Tab[] = role === 'foh'
    ? [
        { href: '/dat-mon',   labelVi: 'Đặt món',   labelEn: 'Place Order',  icon: 'add_shopping_cart' },
        { href: '/dang-chay', labelVi: 'Đang chạy', labelEn: 'Active Orders', icon: 'receipt_long', badge: readyCount },
      ]
    : [
        { href: '/kho',       labelVi: 'Kho',       labelEn: 'Inventory',    icon: 'inventory_2' },
        { href: '/dat-mon',   labelVi: 'Đặt món',   labelEn: 'Place Order',  icon: 'add_shopping_cart' },
        { href: '/dang-chay', labelVi: 'Đang chạy', labelEn: 'Active Orders', icon: 'receipt_long', badge: readyCount },
      ]

  if (role === 'manager') {
    tabs.push({ href: '/register', labelVi: 'Thu ngân', labelEn: 'Register', icon: 'point_of_sale' })
    tabs.push({ href: '/settings', labelVi: 'Cài đặt', labelEn: 'Settings', icon: 'settings' })
  }
```

- [ ] **Step 2: Apply the same trim to the mobile bottom nav**

In `components/bottom-nav.tsx`, find:
```tsx
  const tabs = [
    { href: '/kho',       labelVi: 'Kho',       icon: 'inventory_2' },
    { href: '/dat-mon',   labelVi: 'Đặt món',   icon: 'add_shopping_cart' },
    { href: '/dang-chay', labelVi: 'Đang chạy', icon: 'receipt_long', badge: readyCount },
    ...(role === 'manager' ? [{ href: '/settings', labelVi: 'Cài đặt', icon: 'settings' }] : []),
  ]
```
Replace with:
```tsx
  const tabs = [
    ...(role === 'foh' ? [] : [{ href: '/kho', labelVi: 'Kho', icon: 'inventory_2' }]),
    { href: '/dat-mon',   labelVi: 'Đặt món',   icon: 'add_shopping_cart' },
    { href: '/dang-chay', labelVi: 'Đang chạy', icon: 'receipt_long', badge: readyCount },
    ...(role === 'manager' ? [{ href: '/settings', labelVi: 'Cài đặt', icon: 'settings' }] : []),
  ]
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add components/sidebar-nav.tsx components/bottom-nav.tsx
git commit -m "feat: trim FOH navigation to Đặt món + Đang chạy only"
```

---

### Task 2: Build the AccountMenu component

**Files:**
- Create: `components/account-menu.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BranchSelector } from './branch-selector'
import type { UserRole } from '@/lib/types'

const ROLE_LABELS: Record<UserRole, string> = {
  foh: 'Nhân viên',
  kitchen: 'Bếp',
  manager: 'Quản lý',
  register: 'Thu ngân',
}

interface Props {
  fullName: string | null
  role: UserRole
  branchId?: string
  onBranchChange?: (id: string) => void
}

export function AccountMenu({ fullName, role, branchId, onBranchChange }: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-2 min-h-touch-target-min px-1"
        aria-label="Tài khoản"
        aria-expanded={open}
      >
        <span className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[13px]">
          {(fullName ?? '?').charAt(0).toUpperCase()}
        </span>
        <span className="hidden md:block text-left leading-tight">
          <span className="block text-label-vi font-bold text-on-surface">{fullName ?? 'Tài khoản'}</span>
          <span className="block text-label-en text-on-surface-variant">{ROLE_LABELS[role]}</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-lg z-50 overflow-hidden">
          <div className="p-stack-md border-b border-outline-variant">
            <p className="text-label-vi font-bold text-on-surface">{fullName ?? 'Tài khoản'}</p>
            <p className="text-label-en text-on-surface-variant">{ROLE_LABELS[role]}</p>
          </div>

          {role === 'manager' && branchId && onBranchChange && (
            <div className="p-stack-md border-b border-outline-variant">
              <p className="text-label-en text-on-surface-variant mb-1">Chi nhánh</p>
              <BranchSelector branchId={branchId} onBranchChange={onBranchChange} />
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full text-left p-stack-md text-error font-bold text-label-vi hover:bg-error-container transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  )
}
```

Note: `branchId`/`onBranchChange` are only ever passed by the FOH/manager shell (Task 3), and only for `role === 'manager'`. Kitchen and register layouts (Tasks 4–5) never pass them — neither of those pages has a switchable branch concept today, and adding one is out of scope for this plan (see spec's "Out of scope").

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds. The component isn't wired up anywhere yet, so this just confirms it compiles in isolation.

- [ ] **Step 3: Commit**

```bash
git add components/account-menu.tsx
git commit -m "feat: add AccountMenu component with logout and manager-only branch switch"
```

---

### Task 3: Wire AccountMenu into the FOH/manager shell

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/app-shell.tsx`

- [ ] **Step 1: Add `full_name` to the profile query and pass it down**

In `app/(app)/layout.tsx`, find:
```tsx
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role === 'kitchen') redirect('/kitchen')
  if (profile.role === 'register') redirect('/register')

  return (
    <AppShell role={profile.role} defaultBranchId={profile.branch_id}>
      {children}
    </AppShell>
  )
```
Replace with:
```tsx
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, branch_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role === 'kitchen') redirect('/kitchen')
  if (profile.role === 'register') redirect('/register')

  return (
    <AppShell role={profile.role} defaultBranchId={profile.branch_id} fullName={profile.full_name}>
      {children}
    </AppShell>
  )
```

- [ ] **Step 2: Replace the app-shell.tsx header**

Replace the entire contents of `app/(app)/app-shell.tsx`:

```tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SidebarNav } from '@/components/sidebar-nav'
import { BottomNav } from '@/components/bottom-nav'
import { AccountMenu } from '@/components/account-menu'
import type { Branch, UserRole } from '@/lib/types'

interface BranchContextValue {
  branchId: string
  setBranchId: (id: string) => void
}

export const BranchContext = createContext<BranchContextValue>({
  branchId: '',
  setBranchId: () => {},
})

export function useBranch() {
  return useContext(BranchContext)
}

interface Props {
  role: UserRole
  defaultBranchId: string
  fullName: string | null
  children: React.ReactNode
}

export function AppShell({ role, defaultBranchId, fullName, children }: Props) {
  const [branchId, setBranchId] = useState(defaultBranchId)
  const [branches, setBranches] = useState<Branch[]>([])
  const [readyCount, setReadyCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('branches').select('*').order('name').then(({ data }) => {
      if (data) setBranches(data)
    })
  }, [])

  useEffect(() => {
    async function fetchCount() {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('branch_id', branchId)
        .eq('status', 'ready')
      setReadyCount(count ?? 0)
    }

    fetchCount()

    const channel = supabase
      .channel(`ready-count-${branchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` },
        () => fetchCount(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [branchId])

  const currentBranchName = branches.find(b => b.id === branchId)?.name

  return (
    <BranchContext.Provider value={{ branchId, setBranchId }}>
      {/* Top header */}
      <header className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        {role === 'manager' && currentBranchName && (
          <span className="text-label-vi font-bold text-on-surface px-1">{currentBranchName}</span>
        )}

        <div className="flex items-center gap-3 ml-auto">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            chat
          </span>
          <AccountMenu
            fullName={fullName}
            role={role}
            branchId={role === 'manager' ? branchId : undefined}
            onBranchChange={role === 'manager' ? setBranchId : undefined}
          />
        </div>
      </header>

      {/* Sidebar (tablet+) */}
      <aside className="hidden md:flex flex-col fixed left-0 top-touch-target-min bottom-0 w-64 bg-surface-container-low border-r border-outline-variant overflow-y-auto z-30">
        <SidebarNav role={role} readyCount={readyCount} />
      </aside>

      {/* Main content */}
      <main className="mt-touch-target-min md:ml-64 p-margin-mobile md:p-margin-tablet lg:p-margin-desktop pb-touch-target-min md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <BottomNav role={role} readyCount={readyCount} />
    </BranchContext.Provider>
  )
}
```

Note: `app-shell.tsx` now fetches the branch list itself (for the left-side name label), separately from `BranchSelector`'s own internal fetch of the same table when it renders inside `AccountMenu`'s dropdown. This is a deliberate, small duplication — `BranchSelector` is reused as-is rather than refactored to accept branches as a prop, per the spec's explicit "reuse rather than rewrite" call.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Manual smoke test**

`npm run dev`, log in as `foh`: confirm sidebar shows only Đặt món + Đang chạy, top bar shows nothing on the left and Chat+Account icons on the right, Account dropdown shows name/role + Đăng xuất (no branch row), and clicking Đăng xuất actually logs out and lands on `/login`.

Log in as `manager`: confirm sidebar is unchanged (5 tabs), top bar shows the branch name on the left, and the Account dropdown includes the branch switcher (if the account has 2+ branches) plus Đăng xuất.

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/layout.tsx app/\(app\)/app-shell.tsx
git commit -m "feat: replace branch selector + settings icon with condensed AccountMenu"
```

---

### Task 4: Wire AccountMenu into the kitchen layout

**Files:**
- Modify: `app/kitchen/layout.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `app/kitchen/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'kitchen' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            kitchen
          </span>
          <span className="font-bold text-on-surface">Bếp</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            chat
          </span>
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
      </header>
      <main className="flex-1 p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Log in as the kitchen test account: confirm the header now shows the Chat icon + Account (name + "Bếp") on the right, and Đăng xuất works. Log in as manager and visit `/kitchen`: confirm Account shows "Quản lý" as the role label (not hardcoded "Bếp"), and no branch switcher appears here (kitchen has no switchable branch concept).

- [ ] **Step 4: Commit**

```bash
git add app/kitchen/layout.tsx
git commit -m "feat: add AccountMenu to kitchen header"
```

---

### Task 5: Wire AccountMenu into the register layout

**Files:**
- Modify: `app/register/layout.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `app/register/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'register' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            point_of_sale
          </span>
          <span className="font-bold text-on-surface">Thu ngân</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            chat
          </span>
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
      </header>
      <main className="flex-1 p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

Log in as the register test account: confirm the header shows Chat + Account ("Thu ngân" role label) on the right, and Đăng xuất works.

- [ ] **Step 4: Commit**

```bash
git add app/register/layout.tsx
git commit -m "feat: add AccountMenu to register header"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

```bash
npm run test:run
npm run lint
npm run build
```
Expected: all existing tests still pass (this plan adds no new pure-logic functions, so the test count shouldn't change), lint shows no new errors, build succeeds.

- [ ] **Step 2: Full manual pass across all four roles**

For each of foh, manager, kitchen, register: log in, confirm the nav matches the spec (FOH's trimmed sidebar+bottom-nav, manager's branch name on the left, everyone's right-aligned Chat+Account), confirm the Account dropdown's contents are correct for that role (branch row only for manager), and confirm Đăng xuất logs out and lands on `/login` from every single one of the four roles' pages.

- [ ] **Step 3: Confirm no regressions in unrelated flows**

Quickly re-verify: placing an order in Đặt món still works, the ready-order badge count on Đang chạy's sidebar tab still updates via Realtime, and (for manager) switching branches via the new dropdown-based switcher still actually changes which branch's data the Kho/Đặt món/Đang chạy pages show.

---

## Self-Review Checklist (spec vs plan)

| Spec requirement | Covered by |
|---|---|
| FOH sidebar trimmed to Đặt món + Đang chạy | Task 1 |
| Mobile bottom nav given the same trim (gap found during plan self-review — spec only mentioned the sidebar) | Task 1 |
| Top bar fully right-aligned for foh/kitchen/register | Tasks 3, 4, 5 |
| Manager keeps branch name left-anchored | Task 3 |
| Branch switcher moves into Account menu, manager-only | Tasks 2, 3 |
| Chat icon present but inert (no onClick) | Tasks 3, 4, 5 |
| Branch switching removed entirely for foh/kitchen/register | Tasks 2 (no props passed), 4, 5 (no branchId passed at all) |
| Kitchen/register headers gain Account+Chat | Tasks 4, 5 |
| First logout mechanism in the app | Task 2 |
| `full_name` threaded from each layout's existing `user_profiles` query | Tasks 3, 4, 5 |
