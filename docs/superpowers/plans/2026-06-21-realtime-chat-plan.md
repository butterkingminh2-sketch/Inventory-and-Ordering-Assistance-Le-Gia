# Real-Time Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing (currently decorative) chat icon in the header into a real-time, branch-scoped public chat plus a private manager↔owner chat, both delivered as a side-drawer panel.

**Architecture:** One `messages` table backs both channels, distinguished by a `channel` column and two RLS policies. A new `owner` role is added to `user_profiles`. A `ChatTrigger` client component (icon button + open/close state) wraps a `ChatPanel` component (the actual drawer); both are reused identically across the three places the decorative chat icon already exists today — `app-shell.tsx` (foh/manager/owner), `app/kitchen/layout.tsx` (kitchen), and `app/register/layout.tsx` (register).

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + Realtime + RLS), Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-21-realtime-chat-design.md` — read this for full rationale; this plan only implements it.

**Important scope note found while planning:** kitchen and register roles never render `app-shell.tsx` — `app/(app)/layout.tsx` redirects them to their own separate `/kitchen` and `/register` route groups, each with their own header. Both of those headers *already* have the same decorative, non-functional `chat` icon placeholder as `app-shell.tsx` does — all three need wiring, not just one.

**Known, accepted limitation (not part of this plan):** the new `owner` role will see the full operational sidebar/bottom-nav (Kho, Đặt món, Đang chạy) since `components/sidebar-nav.tsx` and `components/bottom-nav.tsx` only special-case `'foh'` and `'manager'`, with `'owner'` falling into the generic "show everything" branch. This is harmless (nothing breaks) but not ideal long-term — redesigning the owner's nav experience is out of scope for the chat feature itself and was not requested. Do not expand scope to fix this.

---

### Task 1: Migration + types

**Files:**
- Create: `supabase/migrations/010_chat.sql`
- Modify: `lib/types.ts`
- Modify: `components/account-menu.tsx`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/010_chat.sql
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('foh', 'kitchen', 'manager', 'register', 'owner'));

CREATE TABLE IF NOT EXISTS messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id  uuid REFERENCES branches(id) NOT NULL,
  channel    text NOT NULL CHECK (channel IN ('public', 'owner')),
  sender_id  uuid REFERENCES auth.users(id) NOT NULL,
  body       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_channel_rw ON messages FOR ALL USING (
  channel = 'public' AND branch_id = (SELECT branch_id FROM user_profiles WHERE id = auth.uid())
);

CREATE POLICY owner_channel_rw ON messages FOR ALL USING (
  channel = 'owner' AND (
    (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'owner'
    OR (
      (SELECT role FROM user_profiles WHERE id = auth.uid()) = 'manager'
      AND branch_id = (SELECT branch_id FROM user_profiles WHERE id = auth.uid())
    )
  )
);
```

- [ ] **Step 2: Run it in Supabase**

This step requires the human user to paste the SQL into the Supabase Dashboard SQL Editor — skip it if you're a subagent, note it's pending.

- [ ] **Step 3: Update `lib/types.ts`**

Find:
```ts
export type UserRole = 'foh' | 'kitchen' | 'manager' | 'register'
```
Replace with:
```ts
export type UserRole = 'foh' | 'kitchen' | 'manager' | 'register' | 'owner'
```

Add these new interfaces near `OrderWithDetails` (the existing joined-type convention):
```ts
export interface Message {
  id: string
  branch_id: string
  channel: 'public' | 'owner'
  sender_id: string
  body: string
  created_at: string
}

export interface MessageWithSender extends Message {
  sender: Pick<UserProfile, 'full_name' | 'role'>
}
```

- [ ] **Step 4: Fix `components/account-menu.tsx`'s `ROLE_LABELS` — this is a required fix, not optional**

`ROLE_LABELS` is typed `Record<UserRole, string>`, so adding `'owner'` to `UserRole` will fail the build until every key is covered. Find:
```ts
const ROLE_LABELS: Record<UserRole, string> = {
  foh: 'Nhân viên',
  kitchen: 'Bếp',
  manager: 'Quản lý',
  register: 'Thu ngân',
}
```
Replace with:
```ts
const ROLE_LABELS: Record<UserRole, string> = {
  foh: 'Nhân viên',
  kitchen: 'Bếp',
  manager: 'Quản lý',
  register: 'Thu ngân',
  owner: 'Chủ quán',
}
```

Also extend the branch-selector visibility to include the owner role (per the design — the owner uses the same branch selector pattern managers already have, since they oversee both branches). Find:
```tsx
          {role === 'manager' && branchId && onBranchChange && (
```
Replace with:
```tsx
          {(role === 'manager' || role === 'owner') && branchId && onBranchChange && (
```

- [ ] **Step 5: Verify the build and test suite**

Run: `npm run build` then `npm run test:run`
Expected: build succeeds, all existing tests pass. If any other file constructs a `Record<UserRole, ...>` or exhaustively switches over `UserRole` without a default case, the build will also flag it there — fix the same way (add an `owner` entry), only adding what's needed to compile, not redesigning anything.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/010_chat.sql lib/types.ts components/account-menu.tsx
git commit -m "feat: add owner role and messages table with RLS"
```

---

### Task 2: Public-channel cutoff helper (TDD)

**Files:**
- Create: `lib/chat.ts`
- Create: `lib/__tests__/chat.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/chat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getPublicChannelCutoff } from '../chat'

describe('getPublicChannelCutoff', () => {
  it('rolls back to yesterday 6 AM when now is before 6 AM today', () => {
    const now = new Date(2026, 5, 21, 3, 0, 0) // June 21, 3:00 AM
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 20, 6, 0, 0)) // June 20, 6:00 AM
  })

  it('uses today 6 AM when now is after 6 AM today', () => {
    const now = new Date(2026, 5, 21, 14, 0, 0) // June 21, 2:00 PM
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 21, 6, 0, 0)) // June 21, 6:00 AM
  })

  it('treats exactly 6:00:00 AM as already "today"', () => {
    const now = new Date(2026, 5, 21, 6, 0, 0) // June 21, 6:00:00 AM exactly
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 21, 6, 0, 0))
  })

  it('treats one second before 6 AM as still yesterday', () => {
    const now = new Date(2026, 5, 21, 5, 59, 59)
    const cutoff = getPublicChannelCutoff(now)
    expect(cutoff).toEqual(new Date(2026, 5, 20, 6, 0, 0))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:run`
Expected: FAIL — "Cannot find module '../chat'"

- [ ] **Step 3: Write `lib/chat.ts`**

```ts
const PUBLIC_CHANNEL_RESET_HOUR = 6

/**
 * Pure function — no DB calls. Returns the most recent 6:00:00 AM local time
 * at or before `now`. The public chat channel only shows messages at or
 * after this cutoff — a read-side filter, not a delete job.
 */
export function getPublicChannelCutoff(now: Date): Date {
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), PUBLIC_CHANNEL_RESET_HOUR, 0, 0)
  if (now < cutoff) {
    cutoff.setDate(cutoff.getDate() - 1)
  }
  return cutoff
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:run`
Expected: All 4 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/chat.ts lib/__tests__/chat.test.ts
git commit -m "feat: add public chat channel daily-cutoff helper"
```

---

### Task 3: ChatPanel + ChatTrigger components

**Files:**
- Create: `components/chat-panel.tsx`
- Create: `components/chat-trigger.tsx`

Note: both are new, standalone, unreferenced components — nothing imports them yet, so the build stays green regardless. Tasks 4, 5, and 6 wire them into the three existing header locations.

- [ ] **Step 1: Write `components/chat-panel.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPublicChannelCutoff } from '@/lib/chat'
import type { UserRole, MessageWithSender } from '@/lib/types'

type Channel = 'public' | 'owner'

interface Props {
  role: UserRole
  branchId: string
  onClose: () => void
}

export function ChatPanel({ role, branchId, onClose }: Props) {
  const [channel, setChannel] = useState<Channel>(role === 'owner' ? 'owner' : 'public')
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [text, setText] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const supabase = createClient()
  const listEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
  }, [])

  async function loadMessages() {
    let query = supabase
      .from('messages')
      .select('*, sender:user_profiles(full_name, role)')
      .eq('branch_id', branchId)
      .eq('channel', channel)
      .order('created_at', { ascending: true })

    if (channel === 'public') {
      query = query.gte('created_at', getPublicChannelCutoff(new Date()).toISOString())
    }

    const { data } = await query
    if (data) setMessages(data as MessageWithSender[])
  }

  useEffect(() => {
    loadMessages()

    const realtimeChannel = supabase
      .channel(`messages-${branchId}-${channel}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `branch_id=eq.${branchId}` },
        () => loadMessages(),
      )
      .subscribe()

    return () => { supabase.removeChannel(realtimeChannel) }
  }, [branchId, channel])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('messages').insert({ branch_id: branchId, channel, sender_id: user.id, body: trimmed })
    setText('')
  }

  const showTabs = role === 'manager'

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface h-full flex flex-col shadow-lg">
        <div className="p-stack-lg border-b border-outline-variant">
          <h3 className="text-headline-md font-bold text-on-surface mb-1">Trò chuyện</h3>

          {showTabs && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setChannel('public')}
                className={`px-4 py-1 rounded-full text-label-vi font-bold ${
                  channel === 'public' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                Chung
              </button>
              <button
                onClick={() => setChannel('owner')}
                className={`px-4 py-1 rounded-full text-label-vi font-bold ${
                  channel === 'owner' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                Chủ quán
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-stack-lg space-y-2">
          {messages.length === 0 && (
            <p className="text-label-en text-on-surface-variant text-center mt-stack-lg">Chưa có tin nhắn nào</p>
          )}
          {messages.map(msg => {
            const isMine = msg.sender_id === currentUserId
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <span className="text-label-en text-on-surface-variant mb-0.5">
                  {msg.sender.full_name ?? 'Người dùng'}
                </span>
                <span
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-label-vi ${
                    isMine ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {msg.body}
                </span>
              </div>
            )
          })}
          <div ref={listEndRef} />
        </div>

        <div className="p-stack-lg border-t border-outline-variant flex gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            placeholder="Nhập tin nhắn..."
            className="flex-1 border border-outline-variant rounded-lg px-3 py-2 text-label-vi bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary min-h-touch-target-min"
          />
          <button
            onClick={handleSend}
            className="bg-primary text-on-primary rounded-lg px-4 font-bold text-label-vi min-h-touch-target-min"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `components/chat-trigger.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { ChatPanel } from './chat-panel'
import type { UserRole } from '@/lib/types'

interface Props {
  role: UserRole
  branchId: string
}

export function ChatTrigger({ role, branchId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Trò chuyện" className="flex items-center justify-center">
        <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
          chat
        </span>
      </button>
      {open && <ChatPanel role={role} branchId={branchId} onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds — neither component is imported anywhere yet, so nothing else can break.

- [ ] **Step 4: Commit**

```bash
git add components/chat-panel.tsx components/chat-trigger.tsx
git commit -m "feat: add ChatPanel and ChatTrigger components"
```

---

### Task 4: Wire chat into app-shell.tsx (foh/manager/owner)

**Files:**
- Modify: `app/(app)/app-shell.tsx`

- [ ] **Step 1: Replace the decorative chat icon with `ChatTrigger`, and extend the branch-selector props to include owner**

Find:
```tsx
import { AccountMenu } from '@/components/account-menu'
import type { Branch, UserRole } from '@/lib/types'
```
Replace with:
```tsx
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
import type { Branch, UserRole } from '@/lib/types'
```

Find:
```tsx
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
```
Replace with:
```tsx
        <div className="flex items-center gap-3 ml-auto">
          <ChatTrigger role={role} branchId={branchId} />
          <AccountMenu
            fullName={fullName}
            role={role}
            branchId={role === 'manager' || role === 'owner' ? branchId : undefined}
            onBranchChange={role === 'manager' || role === 'owner' ? setBranchId : undefined}
          />
        </div>
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/app-shell.tsx
git commit -m "feat: wire chat trigger into the main app header"
```

---

### Task 5: Wire chat into kitchen/layout.tsx

**Files:**
- Modify: `app/kitchen/layout.tsx`

- [ ] **Step 1: Fetch `branch_id` alongside the existing profile fields**

Find:
```tsx
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
```
Replace with:
```tsx
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, branch_id')
    .eq('id', user.id)
    .single()
```

- [ ] **Step 2: Replace the decorative chat icon with `ChatTrigger`**

Find:
```tsx
import { AccountMenu } from '@/components/account-menu'
```
Replace with:
```tsx
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
```

Find:
```tsx
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            chat
          </span>
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
```
Replace with:
```tsx
        <div className="flex items-center gap-3">
          <ChatTrigger role={profile.role} branchId={profile.branch_id} />
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/kitchen/layout.tsx
git commit -m "feat: wire chat trigger into the kitchen header"
```

---

### Task 6: Wire chat into register/layout.tsx

**Files:**
- Modify: `app/register/layout.tsx`

- [ ] **Step 1: Fetch `branch_id` alongside the existing profile fields**

Find:
```tsx
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
```
Replace with:
```tsx
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name, branch_id')
    .eq('id', user.id)
    .single()
```

- [ ] **Step 2: Replace the decorative chat icon with `ChatTrigger`**

Find:
```tsx
import { AccountMenu } from '@/components/account-menu'
```
Replace with:
```tsx
import { AccountMenu } from '@/components/account-menu'
import { ChatTrigger } from '@/components/chat-trigger'
```

Find:
```tsx
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant" aria-hidden>
            chat
          </span>
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
```
Replace with:
```tsx
        <div className="flex items-center gap-3">
          <ChatTrigger role={profile.role} branchId={profile.branch_id} />
          <AccountMenu fullName={profile.full_name} role={profile.role} />
        </div>
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app/register/layout.tsx
git commit -m "feat: wire chat trigger into the register header"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated suite**

```bash
npm run test:run
npm run lint
npm run build
```
Expected: all tests pass (4 new from Task 2), lint shows no new errors, build succeeds.

- [ ] **Step 2: Full manual pass**

This requires the migration to already be applied and at least one `owner`-role test account created (manually, via Supabase Dashboard → Authentication, then inserting a matching `user_profiles` row with `role = 'owner'`) — skip this step if you're a subagent, note it's pending for the human user.

As FOH: open the chat icon, confirm it shows only the public channel (no tabs), send a message.
As kitchen (separate browser session): confirm the FOH's message appears in real time without refreshing.
As manager: confirm both "Chung" and "Chủ quán" tabs appear; confirm the public tab shows the same messages FOH/kitchen see; send a message in "Chủ quán" and confirm it does NOT appear in the public tab.
As owner (separate session, different branch selected via the branch selector): confirm the manager's "Chủ quán" message for that branch appears; confirm switching the branch selector shows a different branch's owner-conversation.
As register: confirm the chat icon works the same way as kitchen's (public channel only, real-time).
Directly query the `messages` table via a non-manager, non-owner session's anon key (e.g. via browser dev tools using the FOH session's auth) for `channel = 'owner'` rows and confirm RLS actually blocks it — not just that the UI hides the tab.
