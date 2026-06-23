# Site-Wide Language Toggle (VI / EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted, per-user toggle between full Vietnamese and full English that covers every label, dish/ingredient name, and alert/confirm/toast message across the app.

**Architecture:** One pure function (`pickLabel`) decides which string to show; a `LanguageProvider`/`useLanguage()` Context makes it available everywhere (both inside JSX via a `<BilingualText>` component and inside plain event handlers via the `t()` function the hook returns); the choice persists to a new `user_profiles.language` column. Conversion proceeds in stages: infrastructure, then one full representative screen to prove the mechanism end-to-end, then every remaining file in size order.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Vitest.

**Note on scope:** Not every Vietnamese string in this codebase already has a genuine English counterpart written somewhere — that's true for the original CLAUDE.md-specified screens (dashboard, order-ready view), but many smaller, later-added strings (confirm-dialog text, badge labels, toast messages) only ever had Vietnamese text, sometimes styled with the smaller `text-label-en` CSS token for visual hierarchy, not because real English text was ever written for it. Tasks below that ask you to convert such a string include writing a concise, accurate English translation as part of the step — this is expected, not a gap to flag.

---

## Task 1: Migration + types

**Files:**
- Create: `supabase/migrations/020_user_profiles_language.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'vi';

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_language_check CHECK (language IN ('vi', 'en'));
```

- [ ] **Step 2: Add the `Language` type and extend `UserProfile`**

In `lib/types.ts`, after the existing `export type ItemUnit = ...` line near the top, add:

```ts
export type Language = 'vi' | 'en'
```

Then change the existing `UserProfile` interface (currently):

```ts
export interface UserProfile {
  id: string
  branch_id: string
  role: UserRole
  full_name: string | null
}
```

to:

```ts
export interface UserProfile {
  id: string
  branch_id: string
  role: UserRole
  full_name: string | null
  language: Language
}
```

- [ ] **Step 3: Verify the build still passes**

Run: `npm run build`
Expected: succeeds (no code yet reads `UserProfile.language`, so nothing breaks).

- [ ] **Step 4: Tell the user to apply the migration**

This migration must be run manually in the Supabase SQL Editor — consistent with every prior migration this session. Note it in your final summary; do not attempt to run it yourself.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/020_user_profiles_language.sql lib/types.ts
git commit -m "feat: add user_profiles.language column and Language type"
```

---

## Task 2: `lib/language.ts` pure functions (TDD)

**Files:**
- Create: `lib/language.ts`
- Create: `lib/__tests__/language.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/language.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickLabel, pickName } from '../language'

describe('pickLabel', () => {
  it('returns the Vietnamese string when language is vi', () => {
    expect(pickLabel('vi', 'Xin chào', 'Hello')).toBe('Xin chào')
  })

  it('returns the English string when language is en', () => {
    expect(pickLabel('en', 'Xin chào', 'Hello')).toBe('Hello')
  })
})

describe('pickName', () => {
  it('returns name_en when language is en and name_en is present', () => {
    const row = { name_vi: 'Quẩy', name_en: 'Fried dough stick' }
    expect(pickName(row, 'en')).toBe('Fried dough stick')
  })

  it('returns name_vi when language is vi, regardless of name_en', () => {
    const row = { name_vi: 'Quẩy', name_en: 'Fried dough stick' }
    expect(pickName(row, 'vi')).toBe('Quẩy')
  })

  it('falls back to name_vi when name_en is null, even in English mode', () => {
    const row = { name_vi: 'Rau sống', name_en: null }
    expect(pickName(row, 'en')).toBe('Rau sống')
  })

  it('falls back to name_vi when name_en is an empty string, even in English mode', () => {
    const row = { name_vi: 'Hành lá', name_en: '' }
    expect(pickName(row, 'en')).toBe('Hành lá')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:run -- lib/__tests__/language.test.ts`
Expected: FAIL with "Cannot find module '../language'"

- [ ] **Step 3: Write the implementation**

Create `lib/language.ts`:

```ts
import type { Language } from './types'

/** Pure function — no DB calls. */
export function pickLabel(language: Language, vi: string, en: string): string {
  return language === 'vi' ? vi : en
}

/**
 * Pure function — no DB calls. Falls back to name_vi whenever name_en is
 * missing or empty, regardless of the selected language — there's nothing
 * to show in English otherwise.
 */
export function pickName(row: { name_vi: string; name_en: string | null }, language: Language): string {
  if (language === 'vi' || !row.name_en) return row.name_vi
  return row.name_en
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:run -- lib/__tests__/language.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/language.ts lib/__tests__/language.test.ts
git commit -m "feat: add pickLabel/pickName pure functions for language toggle"
```

---

## Task 3: `lib/language-context.tsx`

**Files:**
- Create: `lib/language-context.tsx`

- [ ] **Step 1: Write the provider and hook**

Create `lib/language-context.tsx`:

```tsx
'use client'

import { createContext, useContext, useState } from 'react'
import { createClient } from './supabase/client'
import { pickLabel } from './language'
import type { Language } from './types'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (vi: string, en: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'vi',
  setLanguage: () => {},
  t: (vi: string) => vi,
})

export function useLanguage() {
  return useContext(LanguageContext)
}

interface Props {
  initialLanguage: Language
  userId: string
  children: React.ReactNode
}

export function LanguageProvider({ initialLanguage, userId, children }: Props) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  function setLanguage(next: Language) {
    setLanguageState(next)
    const supabase = createClient()
    // Fire-and-forget — a low-stakes preference, not order/stock data. If
    // this fails silently, the next successful toggle (or the next login,
    // which would just read the prior value back) is the natural recovery.
    void supabase.from('user_profiles').update({ language: next }).eq('id', userId)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: (vi, en) => pickLabel(language, vi, en) }}>
      {children}
    </LanguageContext.Provider>
  )
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: succeeds (nothing imports this file yet, but it must compile standalone).

- [ ] **Step 3: Commit**

```bash
git add lib/language-context.tsx
git commit -m "feat: add LanguageProvider/useLanguage context"
```

---

## Task 4: `components/bilingual-text.tsx`

**Files:**
- Create: `components/bilingual-text.tsx`

- [ ] **Step 1: Write the component**

Create `components/bilingual-text.tsx`:

```tsx
'use client'

import { useLanguage } from '@/lib/language-context'

interface Props {
  vi: string
  en: string
  className?: string
}

/**
 * Drop-in replacement for the old two-line "VI primary + EN subtitle"
 * stack — renders one line, in whichever language is currently selected,
 * at whatever size className specifies (normally the old primary label's
 * classes; the subtitle's classes are no longer needed once only one line
 * renders).
 */
export function BilingualText({ vi, en, className }: Props) {
  const { t } = useLanguage()
  return <span className={className}>{t(vi, en)}</span>
}
```

- [ ] **Step 2: Verify the build passes**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/bilingual-text.tsx
git commit -m "feat: add BilingualText component"
```

---

## Task 5: Wire `LanguageProvider` into all three layouts

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/app-shell.tsx`
- Modify: `app/kitchen/layout.tsx`
- Modify: `app/register/layout.tsx`

- [ ] **Step 1: Update `app/(app)/layout.tsx`**

Current content selects `'role, branch_id, full_name'` and renders `<AppShell role={...} defaultBranchId={...} fullName={...}>`. Change the select and the render to also pass `language` and `userId`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from './app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, branch_id, full_name, language')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role === 'kitchen') redirect('/kitchen')
  if (profile.role === 'register') redirect('/register')

  return (
    <AppShell
      role={profile.role}
      defaultBranchId={profile.branch_id}
      fullName={profile.full_name}
      language={profile.language}
      userId={user.id}
    >
      {children}
    </AppShell>
  )
}
```

- [ ] **Step 2: Update `app/(app)/app-shell.tsx`**

Add `language: Language` and `userId: string` to the `Props` interface, destructure them, import `LanguageProvider` and the `Language` type, and wrap the existing returned JSX (everything currently inside `<BranchContext.Provider>`) in `<LanguageProvider>`.

Change the imports at the top from:

```tsx
import type { Branch, UserRole } from '@/lib/types'
```

to:

```tsx
import { LanguageProvider } from '@/lib/language-context'
import type { Branch, Language, UserRole } from '@/lib/types'
```

Change the `Props` interface from:

```tsx
interface Props {
  role: UserRole
  defaultBranchId: string
  fullName: string | null
  children: React.ReactNode
}
```

to:

```tsx
interface Props {
  role: UserRole
  defaultBranchId: string
  fullName: string | null
  language: Language
  userId: string
  children: React.ReactNode
}
```

Change the function signature from:

```tsx
export function AppShell({ role, defaultBranchId, fullName, children }: Props) {
```

to:

```tsx
export function AppShell({ role, defaultBranchId, fullName, language, userId, children }: Props) {
```

Wrap the return value: the current `return (<BranchContext.Provider value={...}> ... </BranchContext.Provider>)` becomes `return (<LanguageProvider initialLanguage={language} userId={userId}><BranchContext.Provider value={...}> ... </BranchContext.Provider></LanguageProvider>)` — i.e. add `<LanguageProvider initialLanguage={language} userId={userId}>` immediately after the opening `return (` and its matching closing tag immediately before the final `)`.

- [ ] **Step 3: Update `app/kitchen/layout.tsx`**

Current full file:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import { IdleLogoutGuard } from '@/components/idle-logout-guard'

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'kitchen' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <IdleLogoutGuard timeoutMinutes={profile.role === 'manager' ? 5 : 20} />
      <header className="flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            kitchen
          </span>
          <span className="font-bold text-on-surface">Bếp</span>
        </div>

        <div className="flex items-center gap-3">
          <ChatTrigger role={profile.role} branchId={profile.branch_id} />
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
```

Replace it with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import { IdleLogoutGuard } from '@/components/idle-logout-guard'
import { LanguageProvider } from '@/lib/language-context'

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, branch_id, language')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'kitchen' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <LanguageProvider initialLanguage={profile.language} userId={user.id}>
      <div className="h-full flex flex-col bg-background">
        <IdleLogoutGuard timeoutMinutes={profile.role === 'manager' ? 5 : 20} />
        <header className="flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
              kitchen
            </span>
            <span className="font-bold text-on-surface">Bếp</span>
          </div>

          <div className="flex items-center gap-3">
            <ChatTrigger role={profile.role} branchId={profile.branch_id} />
            <AccountMenu fullName={profile.full_name} role={profile.role} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-tablet">{children}</main>
      </div>
    </LanguageProvider>
  )
}
```

(The "Bếp" header label and `kitchen` icon are left as-is here — Task 7, which fully converts `app/kitchen/page.tsx`, also fixes this layout's own header label since it's the same screen's chrome. If Task 7 hasn't run yet, this is still correct intermediate state.)

- [ ] **Step 4: Update `app/register/layout.tsx`**

Current full file:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import { IdleLogoutGuard } from '@/components/idle-logout-guard'

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'register' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <IdleLogoutGuard timeoutMinutes={profile.role === 'manager' ? 5 : 10} />
      <header className="flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            point_of_sale
          </span>
          <span className="font-bold text-on-surface">Thu ngân</span>
        </div>

        <div className="flex items-center gap-3">
          <ChatTrigger role={profile.role} branchId={profile.branch_id} />
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-tablet">{children}</main>
    </div>
  )
}
```

Replace it with the same pattern as Task 5 Step 3, swapped to register's own branding:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import { IdleLogoutGuard } from '@/components/idle-logout-guard'
import { LanguageProvider } from '@/lib/language-context'

export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, branch_id, language')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'register' && profile.role !== 'manager')) {
    redirect('/kho')
  }

  return (
    <LanguageProvider initialLanguage={profile.language} userId={user.id}>
      <div className="h-full flex flex-col bg-background">
        <IdleLogoutGuard timeoutMinutes={profile.role === 'manager' ? 5 : 10} />
        <header className="flex items-center justify-between gap-3 px-gutter min-h-touch-target-min bg-surface border-b border-outline-variant">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
              point_of_sale
            </span>
            <span className="font-bold text-on-surface">Thu ngân</span>
          </div>

          <div className="flex items-center gap-3">
            <ChatTrigger role={profile.role} branchId={profile.branch_id} />
            <AccountMenu fullName={profile.full_name} role={profile.role} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-tablet">{children}</main>
      </div>
    </LanguageProvider>
  )
}
```

(Same note as Step 3: "Thu ngân" label is fixed by Task 23, which fully converts `app/register/page.tsx` and its layout's header.)

- [ ] **Step 5: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: build succeeds, all existing tests still pass, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/layout.tsx" "app/(app)/app-shell.tsx" app/kitchen/layout.tsx app/register/layout.tsx
git commit -m "feat: wire LanguageProvider into all three route-group layouts"
```

---

## Task 6: Toggle UI in `components/account-menu.tsx`

This also converts every existing bilingual string already inside this file, since you're touching it anyway.

**Files:**
- Modify: `components/account-menu.tsx`

- [ ] **Step 1: Read the current file**

Run: `cat components/account-menu.tsx` (or open it) to confirm it still matches the shape described below — this file has not changed since it was last read in this session, but confirm before editing.

- [ ] **Step 2: Add the language import and hook call**

Add to the imports:

```tsx
import { useLanguage } from '@/lib/language-context'
```

Inside the `AccountMenu` function body, alongside the existing `useState`/`useRef`/`useRouter`/`createClient` calls, add:

```tsx
const { language, setLanguage, t } = useLanguage()
```

- [ ] **Step 3: Convert `ROLE_LABELS` to bilingual**

Change:

```tsx
const ROLE_LABELS: Record<UserRole, string> = {
  foh: 'Nhân viên',
  kitchen: 'Bếp',
  manager: 'Quản lý',
  register: 'Thu ngân',
  owner: 'Chủ quán',
}
```

to a VI/EN pair map, then use `t(...)` at each call site instead of indexing directly:

```tsx
const ROLE_LABELS: Record<UserRole, { vi: string; en: string }> = {
  foh: { vi: 'Nhân viên', en: 'Staff' },
  kitchen: { vi: 'Bếp', en: 'Kitchen' },
  manager: { vi: 'Quản lý', en: 'Manager' },
  register: { vi: 'Thu ngân', en: 'Cashier' },
  owner: { vi: 'Chủ quán', en: 'Owner' },
}
```

Then change both existing usages of `{ROLE_LABELS[role]}` (one in the trigger button's hidden-on-mobile label, one in the open dropdown's header) to `{t(ROLE_LABELS[role].vi, ROLE_LABELS[role].en)}`.

- [ ] **Step 4: Convert the remaining hardcoded strings**

Change `{fullName ?? 'Tài khoản'}` (both occurrences — the trigger button and the dropdown header) to `{fullName ?? t('Tài khoản', 'Account')}`.

Change the `aria-label="Tài khoản"` on the trigger button to `aria-label={t('Tài khoản', 'Account')}`.

Change the "Chi nhánh" label (`<p className="text-label-en text-on-surface-variant mb-1">Chi nhánh</p>`) to `<p className="text-label-en text-on-surface-variant mb-1">{t('Chi nhánh', 'Branch')}</p>`.

Change the logout button's text (`Đăng xuất`) to `{t('Đăng xuất', 'Log out')}`.

- [ ] **Step 5: Add the language toggle section**

Immediately after the existing branch-selector block (the `{(role === 'manager' || role === 'owner') && branchId && onBranchChange && (...)}` block) and before the logout `<button>`, add:

```tsx
<div className="p-stack-md border-b border-outline-variant">
  <p className="text-label-en text-on-surface-variant mb-1">{t('Ngôn ngữ', 'Language')}</p>
  <div className="flex rounded-lg border border-outline-variant overflow-hidden">
    <button
      onClick={() => setLanguage('vi')}
      className={`flex-1 py-1.5 text-label-vi font-bold transition-colors ${
        language === 'vi' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      VI
    </button>
    <button
      onClick={() => setLanguage('en')}
      className={`flex-1 py-1.5 text-label-vi font-bold transition-colors ${
        language === 'en' ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      EN
    </button>
  </div>
</div>
```

- [ ] **Step 6: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 7: Commit**

```bash
git add components/account-menu.tsx
git commit -m "feat: add VI/EN language toggle to AccountMenu dropdown"
```

---

## Task 7: Convert `app/kitchen/page.tsx` (representative screen — proves labels, DB names, confirm dialog, and toast all work end-to-end)

**Files:**
- Modify: `app/kitchen/page.tsx`
- Modify: `app/kitchen/layout.tsx` (the "Bếp" header label deferred from Task 5)

- [ ] **Step 1: Add the language hook and BilingualText import**

Add to `app/kitchen/page.tsx`'s imports:

```tsx
import { BilingualText } from '@/components/bilingual-text'
import { useLanguage } from '@/lib/language-context'
import { pickName } from '@/lib/language'
```

Inside `KitchenPage`, alongside the existing `useState`/`createClient` calls, add:

```tsx
const { t } = useLanguage()
```

- [ ] **Step 2: Convert the realtime new-order toast message**

Change:

```tsx
setNewOrderAlert(`Đơn mới — ${newOrder?.table?.label ?? ''}`)
```

to:

```tsx
setNewOrderAlert(`${t('Đơn mới', 'New order')} — ${newOrder?.table?.label ?? ''}`)
```

- [ ] **Step 3: Convert the out-of-stock confirm dialog**

Change:

```tsx
if (!window.confirm('Báo hết hàng và hủy đơn này? FOH sẽ được thông báo.')) return
```

to:

```tsx
if (!window.confirm(t('Báo hết hàng và hủy đơn này? FOH sẽ được thông báo.', 'Report out of stock and cancel this order? Front of house will be notified.'))) return
```

- [ ] **Step 4: Convert the empty-state message**

Change:

```tsx
<p className="text-on-surface-variant text-center mt-16 text-label-vi">
  Không có đơn nào — Bếp rảnh 🎉
</p>
```

to:

```tsx
<p className="text-on-surface-variant text-center mt-16 text-label-vi">
  {t('Không có đơn nào — Bếp rảnh 🎉', 'No orders — kitchen is clear 🎉')}
</p>
```

- [ ] **Step 5: Convert the "Đánh dấu xong" aria-label**

Change:

```tsx
'aria-label': `Đánh dấu xong — ${order.table?.label ?? 'bàn đã xóa'}${isAddOn ? ', đơn mới' : ''}`,
```

to:

```tsx
'aria-label': `${t('Đánh dấu xong', 'Mark done')} — ${order.table?.label ?? t('bàn đã xóa', 'table deleted')}${isAddOn ? `, ${t('đơn mới', 'new order')}` : ''}`,
```

- [ ] **Step 6: Convert the "+ Đơn mới" and "Thiếu tồn kho" badges**

Change:

```tsx
{isAddOn && (
  <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
    + Đơn mới
  </span>
)}
{needsConfirmation && (
  <span className="inline-block bg-error-container text-on-error-container text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
    Thiếu tồn kho
  </span>
)}
```

to:

```tsx
{isAddOn && (
  <span className="inline-block bg-tertiary-fixed text-on-tertiary-fixed text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
    + {t('Đơn mới', 'New order')}
  </span>
)}
{needsConfirmation && (
  <span className="inline-block bg-error-container text-on-error-container text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
    {t('Thiếu tồn kho', 'Stock shortage')}
  </span>
)}
```

- [ ] **Step 7: Convert the "Báo hết hàng" top-row button**

Change:

```tsx
{!needsConfirmation && (
  <button
    onClick={e => { e.stopPropagation(); handleOutOfStock(order.id) }}
    className="text-label-en font-bold text-error hover:underline shrink-0"
  >
    Báo hết hàng
  </button>
)}
```

to:

```tsx
{!needsConfirmation && (
  <button
    onClick={e => { e.stopPropagation(); handleOutOfStock(order.id) }}
    className="text-label-en font-bold text-error hover:underline shrink-0"
  >
    {t('Báo hết hàng', 'Report out of stock')}
  </button>
)}
```

- [ ] **Step 8: Convert the table label fallback and elapsed-time row**

Change:

```tsx
<p className="text-headline-md font-bold text-on-surface">{order.table?.label ?? 'Bàn đã xóa'}</p>
```

to:

```tsx
<p className="text-headline-md font-bold text-on-surface">{order.table?.label ?? t('Bàn đã xóa', 'Table deleted')}</p>
```

(The elapsed-time row below it calls `elapsedLabel(order.created_at)`, a separate pure function in `lib/order-urgency.ts` — leave it as-is; converting its internal Vietnamese-only output is out of scope for this task and isn't part of any file's bilingual label pair.)

- [ ] **Step 9: Convert dish names to use `pickName`**

Change:

```tsx
const dishNames = new Map(order.order_items.map(oi => [oi.dish_id, oi.dish.name_vi]))
```

to:

```tsx
const dishNames = new Map(order.order_items.map(oi => [oi.dish_id, pickName(oi.dish, language)]))
```

This requires `language` (not just `t`) from the hook — change Step 1's hook call from `const { t } = useLanguage()` to `const { t, language } = useLanguage()`.

- [ ] **Step 10: Convert the "Lưu ý:" note prefix**

Change:

```tsx
{line.note && <span className="block text-label-en font-bold text-tertiary">Lưu ý: {line.note}</span>}
```

to:

```tsx
{line.note && <span className="block text-label-en font-bold text-tertiary">{t('Lưu ý', 'Note')}: {line.note}</span>}
```

- [ ] **Step 11: Convert the two stock-confirmation buttons and the "Xong" bar**

Change:

```tsx
{needsConfirmation ? (
  <div className="flex">
    <button
      onClick={() => handleConfirmStock(order.id)}
      className="flex-1 min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-secondary text-on-secondary active:scale-[0.98] transition-transform"
    >
      <span className="material-symbols-outlined text-[22px]" aria-hidden>inventory_2</span>
      Xác nhận còn hàng
    </button>
    <button
      onClick={() => handleOutOfStock(order.id)}
      className="flex-1 min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-error text-on-error active:scale-[0.98] transition-transform"
    >
      <span className="material-symbols-outlined text-[22px]" aria-hidden>cancel</span>
      Báo hết hàng
    </button>
  </div>
) : (
  <div className="w-full min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-secondary text-on-secondary">
    <span className="material-symbols-outlined text-[24px]" aria-hidden>check_circle</span>
    Xong ✓ — chạm bất kỳ đâu trên thẻ
  </div>
)}
```

to:

```tsx
{needsConfirmation ? (
  <div className="flex">
    <button
      onClick={() => handleConfirmStock(order.id)}
      className="flex-1 min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-secondary text-on-secondary active:scale-[0.98] transition-transform"
    >
      <span className="material-symbols-outlined text-[22px]" aria-hidden>inventory_2</span>
      {t('Xác nhận còn hàng', 'Confirm in stock')}
    </button>
    <button
      onClick={() => handleOutOfStock(order.id)}
      className="flex-1 min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-error text-on-error active:scale-[0.98] transition-transform"
    >
      <span className="material-symbols-outlined text-[22px]" aria-hidden>cancel</span>
      {t('Báo hết hàng', 'Report out of stock')}
    </button>
  </div>
) : (
  <div className="w-full min-h-touch-target-min text-label-vi font-bold flex items-center justify-center gap-2 bg-secondary text-on-secondary">
    <span className="material-symbols-outlined text-[24px]" aria-hidden>check_circle</span>
    {t('Xong ✓ — chạm bất kỳ đâu trên thẻ', 'Done ✓ — tap anywhere on the card')}
  </div>
)}
```

- [ ] **Step 12: Finish `app/kitchen/layout.tsx`'s header label (deferred from Task 5)**

Add `import { useLanguage } from '@/lib/language-context'` — wait, this layout file is a server (`async`) component, so it cannot call a client hook directly. Instead, extract the header label into the already-client `<AccountMenu>`'s sibling — simplest fix: wrap just the label in a tiny inline client usage by importing `BilingualText` (which is itself a client component and can be rendered from a server component without issue, same as any other client component import):

Change:

```tsx
<span className="font-bold text-on-surface">Bếp</span>
```

to:

```tsx
<BilingualText vi="Bếp" en="Kitchen" className="font-bold text-on-surface" />
```

Add the import at the top of `app/kitchen/layout.tsx`:

```tsx
import { BilingualText } from '@/components/bilingual-text'
```

- [ ] **Step 13: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 14: Manual smoke test**

Start the dev server, log in as a kitchen-role user, toggle to English via the account menu, confirm: the "Bếp" header becomes "Kitchen", order cards show English dish names (for any dish with `name_en` set) and English badges/buttons, the out-of-stock confirm dialog is in English, and the new-order toast says "New order — Bàn N". Toggle back to Vietnamese and confirm everything reverts. Log out and back in while in English mode, confirm it stays English.

- [ ] **Step 15: Commit**

```bash
git add app/kitchen/page.tsx app/kitchen/layout.tsx
git commit -m "feat: convert Kitchen screen to the language toggle (labels, names, confirm dialog, toast)"
```

---

## Task 8: Convert `components/loading-screen.tsx`

**Files:**
- Modify: `components/loading-screen.tsx`

- [ ] **Step 1: Find every bilingual site in this file**

Run: `grep -n "text-label-vi\|text-label-en\|alert(\|window.confirm(" components/loading-screen.tsx`

- [ ] **Step 2: For each `text-label-vi`/`text-label-en` pair found, convert it**

This file is only 10 lines — read it in full, then for the one or two-line stack you find (a primary Vietnamese string with a smaller English subtitle directly below it in the JSX), replace both lines with a single `<BilingualText vi="<the exact text from the vi line>" en="<the exact text from the en line>" className="<the primary line's existing className>" />`, importing `BilingualText` from `@/components/bilingual-text` at the top of the file. If the file is a client component already (`'use client'` at the top), no further changes needed; if it has no `'use client'` directive and doesn't need one otherwise, `BilingualText` can still be imported and rendered without issue (it's a client component itself).

If the English subtitle text in this file is empty, a placeholder, or doesn't read as a genuine translation, write an accurate one instead of reusing it verbatim.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/loading-screen.tsx
git commit -m "feat: convert loading-screen.tsx to the language toggle"
```

---

## Task 9: Convert `components/idle-logout-guard.tsx`

**Files:**
- Modify: `components/idle-logout-guard.tsx`

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|alert(\|window.confirm(" components/idle-logout-guard.tsx`

This component shows an idle-timeout warning (per its name and the feature built earlier this session) — check for any hardcoded Vietnamese warning text (e.g. a "you will be logged out" message) in addition to any label pairs.

- [ ] **Step 2: Convert what's found**

For JSX label pairs: replace with `<BilingualText vi="..." en="..." className="..."/>` (import from `@/components/bilingual-text`), using the file's exact existing strings. For any plain hardcoded Vietnamese string with no JSX pair (e.g. inside a countdown message), this component must already be (or become) a client component calling `useLanguage()` from `@/lib/language-context`, then wrap the string in `t(viText, enText)`, writing an accurate English translation if none exists.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/idle-logout-guard.tsx
git commit -m "feat: convert idle-logout-guard.tsx to the language toggle"
```

---

## Task 10: Convert `components/branch-selector.tsx`

**Files:**
- Modify: `components/branch-selector.tsx`

- [ ] **Step 1: Find every bilingual site**

Run: `grep -n "text-label-vi\|text-label-en" components/branch-selector.tsx`

- [ ] **Step 2: Convert what's found**

Branch names themselves (`branch.name`, from the `branches` table) have no `name_en` column and are NOT part of this conversion — only this component's own static UI labels (if any) are. Replace any found label pair with `<BilingualText>`, importing it from `@/components/bilingual-text`.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/branch-selector.tsx
git commit -m "feat: convert branch-selector.tsx to the language toggle"
```

---

## Task 11: Convert `components/toast.tsx`

**Files:**
- Modify: `components/toast.tsx`

- [ ] **Step 1: Find every bilingual site**

Run: `grep -n "text-label-vi\|text-label-en" components/toast.tsx`

The `message` prop this component receives is plain text supplied by each caller (already converted by that caller's own task, e.g. Task 7 already passes a `t(...)`-wrapped string into `<Toast message={newOrderAlert}>`) — do not touch how `message` itself is rendered. Only convert any OTHER static label inside this component's own markup (e.g. a screen-reader-only label, a dismiss button's text) that isn't the passed-in `message`.

- [ ] **Step 2: Convert what's found**

Replace any found label pair with `<BilingualText>` (import from `@/components/bilingual-text`), or wrap a plain string with `t(vi, en)` via `useLanguage()` from `@/lib/language-context` if it's not a JSX pair.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/toast.tsx
git commit -m "feat: convert toast.tsx's own static labels to the language toggle"
```

---

## Task 12: Convert `components/quantity-input.tsx`

**Files:**
- Modify: `components/quantity-input.tsx`

- [ ] **Step 1: Find every bilingual site**

Run: `grep -n "text-label-vi\|text-label-en" components/quantity-input.tsx`

- [ ] **Step 2: Convert what's found**

Replace each found label pair with `<BilingualText>` (import from `@/components/bilingual-text`), using this file's exact existing strings.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/quantity-input.tsx
git commit -m "feat: convert quantity-input.tsx to the language toggle"
```

---

## Task 13: Convert `components/dish-card.tsx`

**Files:**
- Modify: `components/dish-card.tsx`

- [ ] **Step 1: Find every bilingual site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en" components/dish-card.tsx`

This component very likely renders a dish's `name_vi`/`name_en` directly (it's the primary dish-display card) in addition to any static label pairs (e.g. an "unavailable"/"out of stock" badge).

- [ ] **Step 2: Convert what's found**

For the dish name itself, this component must receive the language value (either via a `language` prop passed by its caller, or by calling `useLanguage()` directly if it's already a client component) and use `pickName(dish, language)` (import from `@/lib/language`) instead of reading `dish.name_vi` directly. For any other static label pair, replace with `<BilingualText>` (import from `@/components/bilingual-text`).

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/dish-card.tsx
git commit -m "feat: convert dish-card.tsx to the language toggle"
```

---

## Task 14: Convert `components/sidebar-nav.tsx`

**Files:**
- Modify: `components/sidebar-nav.tsx`

- [ ] **Step 1: Find every bilingual site**

Run: `grep -n "text-label-vi\|text-label-en" components/sidebar-nav.tsx`

This is the tablet/desktop sidebar navigation (Kho, Đặt món, Đang chạy, Bếp, Thu ngân, Cài đặt, Thống kê tabs) — expect one label pair per nav item.

- [ ] **Step 2: Convert what's found**

Replace each nav item's label pair with `<BilingualText>` (import from `@/components/bilingual-text`), using this file's exact existing strings for each tab.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/sidebar-nav.tsx
git commit -m "feat: convert sidebar-nav.tsx to the language toggle"
```

---

## Task 15: Convert `components/ingredient-card.tsx`

**Files:**
- Modify: `components/ingredient-card.tsx`

- [ ] **Step 1: Find every bilingual site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en" components/ingredient-card.tsx`

This is the Kho dashboard's per-ingredient card — expect the ingredient's own `name_vi`/`name_en` plus status-badge label pairs (sufficient/low/out of stock) and the unit label.

- [ ] **Step 2: Convert what's found**

For the ingredient name, use `pickName(item, language)` (import from `@/lib/language`) instead of reading `item.name_vi`/`item.name_en` separately — this component will need `language` from `useLanguage()` (`@/lib/language-context`) if it's already a client component, or as a new prop from its caller otherwise. For status badges and any other static label pair, replace with `<BilingualText>` (import from `@/components/bilingual-text`).

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/ingredient-card.tsx
git commit -m "feat: convert ingredient-card.tsx to the language toggle"
```

---

## Task 16: Convert `app/(app)/app-shell.tsx`'s own remaining labels

**Files:**
- Modify: `app/(app)/app-shell.tsx`

- [ ] **Step 1: Find every remaining bilingual site**

Run: `grep -n "text-label-vi\|text-label-en" "app/(app)/app-shell.tsx"`

The current branch-name span (`<span className="text-label-vi font-bold text-on-surface px-1 truncate min-w-0">{currentBranchName}</span>`) is NOT a bilingual pair — `currentBranchName` is a single DB value with no English counterpart, so leave it as-is. Only convert any OTHER static label pair this grep finds.

- [ ] **Step 2: Convert what's found**

This file is already a client component with `useLanguage()` available (wired in Task 5) since `LanguageProvider` wraps its own returned tree — call `useLanguage()` at the top and use `t(vi, en)` or `<BilingualText>` for whatever's found.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/app-shell.tsx"
git commit -m "feat: convert app-shell.tsx's remaining labels to the language toggle"
```

---

## Task 17: Convert `components/order-card.tsx`

**Files:**
- Modify: `components/order-card.tsx`

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en\|alert(\|window.confirm(" components/order-card.tsx`

This is the Đang chạy (active orders) card — expect a status badge (Đang nấu/Sẵn sàng), dish names via `order.order_items`, and possibly a cancel confirm dialog.

- [ ] **Step 2: Convert what's found**

For dish names, use `pickName(oi.dish, language)` (import from `@/lib/language`), requiring `language` from `useLanguage()` (`@/lib/language-context`) — this is already a `'use client'` component (confirm via the grep'd file's top). For label pairs, use `<BilingualText>` (import from `@/components/bilingual-text`). For any `window.confirm()` call, wrap its string in `t(vi, en)`, writing an accurate English translation if none exists for that specific dialog text.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/order-card.tsx
git commit -m "feat: convert order-card.tsx to the language toggle"
```

---

## Task 18: Convert `app/(app)/dang-chay/page.tsx`

**Files:**
- Modify: `app/(app)/dang-chay/page.tsx`

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|showAlert(\|alert(\|window.confirm(" "app/(app)/dang-chay/page.tsx"`

This page has its own hand-rolled `showAlert(message, tone)` function (intentionally separate from `hooks/use-order-alerts.ts`, per this codebase's established pattern) with hardcoded Vietnamese alert strings (e.g. "Đơn mới — ...", "Sẵn sàng giao — ...", "Hủy do hết hàng — ...").

- [ ] **Step 2: Convert what's found**

Add `const { t } = useLanguage()` (import `useLanguage` from `@/lib/language-context`) inside the component. Wrap each `showAlert(...)` call's message-construction in `t(viPrefix, enPrefix)` for the translatable portion (the table label interpolated into the string is not translated, same pattern as Task 7 Step 2). For any other label pair found in the JSX, use `<BilingualText>` (import from `@/components/bilingual-text`).

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/dang-chay/page.tsx"
git commit -m "feat: convert dang-chay/page.tsx to the language toggle"
```

---

## Task 19: Convert `components/chat-panel.tsx`

**Files:**
- Modify: `components/chat-panel.tsx`

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|alert(\|window.confirm(\|placeholder=" components/chat-panel.tsx`

Check for an input `placeholder` attribute (e.g. "Nhập tin nhắn...") in addition to label pairs — placeholders are plain string props, not JSX children, so they need `t(vi, en)` directly rather than `<BilingualText>`.

- [ ] **Step 2: Convert what's found**

Add `const { t } = useLanguage()` (import from `@/lib/language-context`) if not already present. For JSX label pairs, use `<BilingualText>` (import from `@/components/bilingual-text`). For the `placeholder` attribute and any other plain string prop, use `t(vi, en)` directly (e.g. `placeholder={t('Nhập tin nhắn...', 'Type a message...')}`), writing an accurate translation if none exists.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/chat-panel.tsx
git commit -m "feat: convert chat-panel.tsx to the language toggle"
```

---

## Task 20: Convert `components/topping-panel.tsx`

**Files:**
- Modify: `components/topping-panel.tsx`

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en\|alert(\|window.confirm(" components/topping-panel.tsx`

This is the dish-customization side panel — expect the dish's own name, each topping's name, a "Số lượng" (quantity) label, and possibly a stock-cap warning message.

- [ ] **Step 2: Convert what's found**

For dish/topping names, use `pickName(row, language)` (import from `@/lib/language`), requiring `language` from `useLanguage()` (`@/lib/language-context`). For label pairs, use `<BilingualText>` (import from `@/components/bilingual-text`). For any plain hardcoded string (e.g. a stock-cap warning), wrap in `t(vi, en)`.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/topping-panel.tsx
git commit -m "feat: convert topping-panel.tsx to the language toggle"
```

---

## Task 21: Convert `app/(app)/kho/page.tsx`

**Files:**
- Modify: `app/(app)/kho/page.tsx`

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en\|alert(\|window.confirm(" "app/(app)/kho/page.tsx"`

This is the Inventory dashboard (the first screen in the original CLAUDE.md spec) — expect the top bar, category-pill filter, search input placeholder, and the low-stock warning strip in addition to whatever `<IngredientCard>` (already converted in Task 15) needs from this page as props.

- [ ] **Step 2: Convert what's found**

Add `const { t, language } = useLanguage()` (import from `@/lib/language-context`) if not already present, and pass `language` down to `<IngredientCard>` if Task 15 added it as a prop rather than having that component call the hook itself. For JSX label pairs, use `<BilingualText>` (import from `@/components/bilingual-text`). For the search input's `placeholder` and any other plain string, use `t(vi, en)` directly.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/kho/page.tsx"
git commit -m "feat: convert kho/page.tsx to the language toggle"
```

---

## Task 22: Convert `app/(app)/analytics/page.tsx`

**Files:**
- Modify: `app/(app)/analytics/page.tsx`

- [ ] **Step 1: Find every bilingual site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en" "app/(app)/analytics/page.tsx"`

Expect stat-card labels (Doanh thu, Giá trị đơn trung bình, etc.), the restock-warning list (which renders item names), and the top-sellers lists (which render dish names).

- [ ] **Step 2: Convert what's found**

Add `const { t, language } = useLanguage()` (import from `@/lib/language-context`) if not already present. For item/dish names in the restock and top-sellers lists, use `pickName(row, language)` (import from `@/lib/language`). For stat-card labels and other JSX label pairs, use `<BilingualText>` (import from `@/components/bilingual-text`).

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/analytics/page.tsx"
git commit -m "feat: convert analytics/page.tsx to the language toggle"
```

---

## Task 23: Extend `lib/billing.ts` with `name_en`, then convert `app/register/page.tsx` and `app/register/layout.tsx`

**Files:**
- Modify: `lib/billing.ts`
- Modify: `lib/__tests__/billing.test.ts`
- Modify: `app/register/page.tsx`
- Modify: `app/register/layout.tsx`

`TableBillItem`/`TableBillTopping` currently only carry `name_vi` (confirmed by reading the current file) — `groupOrdersByTable`'s source data (`OrderWithDetails.order_items[].dish`) already has `name_en` available, it's just dropped when building the bill. This needs a small data-model extension before the page can show English dish names.

- [ ] **Step 1: Extend the two interfaces**

In `lib/billing.ts`, change:

```ts
export interface TableBillTopping {
  id: string
  name_vi: string
  qty: number
  lineTotal: number
  comped: boolean
}

export interface TableBillItem {
  id: string
  name_vi: string
  qty: number
  lineTotal: number
  note: string | null
  comped: boolean
  toppings: TableBillTopping[]
}
```

to:

```ts
export interface TableBillTopping {
  id: string
  name_vi: string
  name_en: string | null
  qty: number
  lineTotal: number
  comped: boolean
}

export interface TableBillItem {
  id: string
  name_vi: string
  name_en: string | null
  qty: number
  lineTotal: number
  note: string | null
  comped: boolean
  toppings: TableBillTopping[]
}
```

- [ ] **Step 2: Thread `name_en` through `groupOrdersByTable`**

Change:

```ts
    const items: TableBillItem[] = roots.map(root => ({
      id: root.id,
      name_vi: root.dish.name_vi,
      qty: root.qty,
      lineTotal: root.qty * num(root.price_at_order),
      note: root.note,
      comped: root.comped,
      toppings: allOrderItems
        .filter(oi => oi.parent_item_id === root.id)
        .map(topping => ({
          id: topping.id,
          name_vi: topping.dish.name_vi,
          qty: topping.qty,
          lineTotal: topping.qty * num(topping.price_at_order),
          comped: topping.comped,
        })),
    }))
```

to:

```ts
    const items: TableBillItem[] = roots.map(root => ({
      id: root.id,
      name_vi: root.dish.name_vi,
      name_en: root.dish.name_en,
      qty: root.qty,
      lineTotal: root.qty * num(root.price_at_order),
      note: root.note,
      comped: root.comped,
      toppings: allOrderItems
        .filter(oi => oi.parent_item_id === root.id)
        .map(topping => ({
          id: topping.id,
          name_vi: topping.dish.name_vi,
          name_en: topping.dish.name_en,
          qty: topping.qty,
          lineTotal: topping.qty * num(topping.price_at_order),
          comped: topping.comped,
        })),
    }))
```

- [ ] **Step 3: Convert the table-deleted fallback to the toggle**

Change:

```ts
      tableLabel: tableOrders[0].table?.label ?? 'Bàn đã xóa',
```

to use `pickLabel` (import `pickLabel` from `./language` at the top of `lib/billing.ts`, and add a `language: Language` parameter to `groupOrdersByTable`, importing `Language` from `./types`):

```ts
      tableLabel: tableOrders[0].table?.label ?? pickLabel(language, 'Bàn đã xóa', 'Table deleted'),
```

Update `groupOrdersByTable`'s signature from `export function groupOrdersByTable(orders: OrderWithDetails[]): TableBill[] {` to `export function groupOrdersByTable(orders: OrderWithDetails[], language: Language): TableBill[] {`.

- [ ] **Step 4: Run the existing billing tests, fix what breaks**

Run: `npm run test:run -- lib/__tests__/billing.test.ts`

This will fail to compile until the test file's fixtures and call sites are updated: every test fixture that constructs a `dish: { name_vi: ... }` object needs `name_en: null` added (or a real English value, your choice, doesn't affect what's being tested), every direct construction of a `TableBillItem`/`TableBillTopping` expectation (e.g. `{ id: 'oi-topping', name_vi: 'Tóp mỡ', ... }`) needs `name_en: null` added to match the new field, and every call to `groupOrdersByTable(orders)` needs a second argument added (use `'vi'` for every existing test, since none of them are testing the language toggle itself — that's covered by `lib/__tests__/language.test.ts` from Task 2). Fix each one, re-run, repeat until green.

- [ ] **Step 5: Find every remaining bilingual and plain-string site in the page**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en\|alert(\|window.confirm(" app/register/page.tsx`

This is the cashier/checkout screen — expect per-table bill cards, payment-method labels, and a checkout confirm dialog, in addition to the dish/topping names now available via `pickName`.

- [ ] **Step 6: Convert what's found in the page**

Add `const { t, language } = useLanguage()` (import from `@/lib/language-context`) if not already present. Pass `language` as the new second argument to every `groupOrdersByTable(orders)` call site in this page. For dish/topping names, use `pickName(item, language)` (import `pickName` from `@/lib/language`) instead of reading `item.name_vi` directly. For JSX label pairs, use `<BilingualText>` (import from `@/components/bilingual-text`). For the checkout confirm dialog and any other plain string, wrap in `t(vi, en)`.

- [ ] **Step 7: Finish the layout's header label**

Same pattern as Task 7 Step 12 — `app/register/layout.tsx` is a server component, so change:

```tsx
<span className="font-bold text-on-surface">Thu ngân</span>
```

to:

```tsx
<BilingualText vi="Thu ngân" en="Cashier" className="font-bold text-on-surface" />
```

Add `import { BilingualText } from '@/components/bilingual-text'` to `app/register/layout.tsx`.

- [ ] **Step 8: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 9: Commit**

```bash
git add lib/billing.ts "lib/__tests__/billing.test.ts" app/register/page.tsx app/register/layout.tsx
git commit -m "feat: convert register/page.tsx to the language toggle, thread name_en through billing"
```

---

## Task 24: Convert `app/(app)/settings/page.tsx`

**Files:**
- Modify: `app/(app)/settings/page.tsx`

This is the largest remaining file (502 lines, 4 tabs: Nguyên liệu, Món ăn, Công thức, Bàn) — expect many label pairs and several `alert()`/`window.confirm()` calls (delete confirmations especially).

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en\|alert(\|window.confirm(" "app/(app)/settings/page.tsx"`

- [ ] **Step 2: Convert tab by tab**

Add `const { t, language } = useLanguage()` (import from `@/lib/language-context`) if not already present. Work through the grep output tab by tab (Nguyên liệu, Món ăn, Công thức, Bàn) rather than top-to-bottom blindly, since each tab is a self-contained JSX block: item/dish names use `pickName(row, language)` (import from `@/lib/language`); form field labels, tab labels, and table-column headers use `<BilingualText>` (import from `@/components/bilingual-text`); every `alert()`/`window.confirm()` call (e.g. the delete-blocked alerts already written this session for tables and items) gets wrapped in `t(vi, en)`, reusing this session's existing Vietnamese text as the `vi` argument and writing an accurate English translation as the `en` argument.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Manual smoke test**

Toggle to English, click through all 4 tabs, confirm every label and the delete-confirmation alerts are in English; toggle back, confirm Vietnamese is restored.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/settings/page.tsx"
git commit -m "feat: convert settings/page.tsx to the language toggle"
```

---

## Task 25: Convert `app/(app)/dat-mon/page.tsx`

**Files:**
- Modify: `app/(app)/dat-mon/page.tsx`

This is the largest file in the app (525 lines, the order-placement flow: table select → dish select → review → submit) — expect label pairs, dish names, multiple `alert()`/`window.confirm()` calls, and a toast.

- [ ] **Step 1: Find every bilingual and plain-string site**

Run: `grep -n "text-label-vi\|text-label-en\|name_vi\|name_en\|alert(\|window.confirm(\|setToast(" "app/(app)/dat-mon/page.tsx"`

- [ ] **Step 2: Convert step by step**

Add `const { t, language } = useLanguage()` (import from `@/lib/language-context`) if not already present. This page has a `step` state machine (table → dishes → review) — work through the grep output by step rather than top-to-bottom: dish/table names use `pickName`/the table's own `label` (tables have no `name_en`, leave table labels as-is); step headers, search placeholder, and category pills use `<BilingualText>` or `t(vi, en)` for plain props; every `alert()`/`window.confirm()` and the `setToast(...)` calls get wrapped in `t(vi, en)`, reusing existing Vietnamese text and writing accurate English translations.

- [ ] **Step 3: Run build, test, lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: all pass, 0 lint errors.

- [ ] **Step 4: Manual smoke test**

Toggle to English, place a full test order (table → dishes → review → confirm), confirm every screen and the stock-floored toast (if triggered) read in English; toggle back, repeat in Vietnamese.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dat-mon/page.tsx"
git commit -m "feat: convert dat-mon/page.tsx to the language toggle"
```

---

## Task 26: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full build/test/lint**

Run: `npm run build && npm run test:run && npm run lint`
Expected: build succeeds, all tests pass (the 4 new `lib/language.ts` tests plus every pre-existing test), 0 lint errors.

- [ ] **Step 2: Confirm no remaining dual-label pairs**

Run: `grep -rln "text-label-en" components app | xargs grep -l "text-label-vi"` — for each file this lists, manually confirm any remaining `text-label-vi`/`text-label-en` usage is either (a) a single standalone label with no paired counterpart needing conversion (e.g. a font-size choice with no bilingual content), or (b) already wrapped in `<BilingualText>`/`t(...)` from an earlier task. Any genuine leftover dual-stack pair found here means an earlier task's grep missed it — fix it directly as part of this task.

- [ ] **Step 3: Tell the user the migration still needs to be applied**

If Task 1's migration hasn't been confirmed as applied yet, remind the user it must be run in the Supabase SQL Editor before the toggle can persist (it'll otherwise fail silently per the Error Handling section of the spec, since `setLanguage`'s Supabase update is fire-and-forget).

- [ ] **Step 4: Full manual pass (deferred to the user)**

Note in your final summary that a full manual pass across all roles (FOH, kitchen, manager, register, owner) toggling between languages and clicking through every screen is recommended before the exam, but is deferred to the user to actually perform — this plan's per-task smoke tests cover representative spots, not exhaustive coverage of every screen state.
