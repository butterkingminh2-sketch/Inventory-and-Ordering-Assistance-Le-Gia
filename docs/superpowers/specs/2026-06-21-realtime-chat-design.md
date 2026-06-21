# Real-Time Chat — Design Spec

## Problem

Last of the originally-requested manager-page sub-projects (units/stock-count and the menu import are already shipped; the analytics dashboard is scoped but not yet built). Staff currently have no in-app way to communicate — a kitchen running low on an ingredient, FOH needing help, or a manager needing to reach the owner all happen outside the app today. The app's header already has a decorative, non-functional `chat` icon (`app-shell.tsx`) sitting next to the account menu — clearly placed there in anticipation of this feature, never wired up.

## Scope

In scope:
- A public, branch-scoped chat that every logged-in role (foh, kitchen, manager, register) can read and post to, opened via the existing header chat icon as a slide-in side-drawer (reusing the `ToppingPanel` pattern).
- A separate, private manager↔owner chat, accessible only to the manager role and a new `owner` role — not visible to FOH, kitchen, or register, enforced at the database level via Row Level Security (a first for this app — every other table currently relies on UI-level filtering only).
- The public chat "resets" daily at 6:00 AM local time — implemented as a read-side time filter (messages before the most recent 6 AM cutoff are simply not queried), not a delete job. The owner chat has no such cutoff; it's a persistent, ongoing conversation.
- Real-time delivery via Supabase Realtime, consistent with how `orders`/`items` already work elsewhere in this app.
- Plain text messages only.

Out of scope / explicitly deferred:
- Kitchen/FOH/register access to the owner chat — manager is the only non-owner role that can reach it. Anything urgent from kitchen/FOH goes through the public chat, which the manager is already in.
- Unread badges, read receipts, message editing, message deletion — none of these exist in v1. Staff check the panel when they think to, the same way they already periodically check Kho/kitchen screens.
- Structured/interactive message content (e.g. a chat message with an inline "accept this stock correction" button) — messages are plain text; any actual stock correction still happens through the existing Kho tap-to-edit count feature, not through chat.
- A real "shift" concept (shift_start/shift_end records) — the 6 AM cutoff is a fixed-time approximation, not a tracked shift boundary. If the restaurant ever runs genuinely irregular hours or multiple shifts a day, this approximation may need revisiting later.

## Architecture

**One `messages` table, two channels.** `channel = 'public'` is the shared, branch-wide, daily-resetting conversation. `channel = 'owner'` is the private, persistent manager↔owner conversation. Both live in the same table, distinguished by the `channel` column and read through different queries — there's no need for two separate tables since the row shape is identical and the only real difference is who can see which rows and whether a time cutoff applies.

**The owner is a real logged-in user, not an external contact.** A new `'owner'` value is added to the existing `user_profiles.role` CHECK constraint (the exact same migration pattern already used when `'register'` was added). The owner logs in like any other role and uses the same branch selector pattern managers already have, since one owner oversees both branches while each branch has its own separate manager account.

**The daily reset is a query filter, not a cleanup job.** `getPublicChannelCutoff(now)` (a new pure function in `lib/chat.ts`) computes the most recent 6:00 AM at or before `now` — 3 AM rolls back to yesterday's 6 AM, 8 AM uses today's. The public-channel query filters `created_at >= cutoff`, so yesterday's messages simply stop being included once the cutoff rolls forward — no scheduled deletion, no cron job, and the raw history technically still exists in the table if ever needed.

**RLS enforces the owner-chat boundary at the database level — a first for this app.** Every other table today relies entirely on the UI hiding what a role shouldn't see; a savvy client with the anon key could otherwise query any table directly. Given the owner's chat is meaningfully more sensitive than e.g. stock levels, this one table gets two RLS policies: the public channel is readable/writable by anyone whose own branch matches the row's branch; the owner channel is readable/writable only by the `owner` role (any branch) or that specific branch's `manager` role. This doesn't change anything about how every other existing table works — it's scoped to this one table only.

## Data Model

New migration:
```sql
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('foh', 'kitchen', 'manager', 'register', 'owner'));

CREATE TABLE messages (
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

`lib/types.ts`: `UserRole` gains `'owner'`. New `Message` interface: `{ id: string; branch_id: string; channel: 'public' | 'owner'; sender_id: string; body: string; created_at: string }`, plus a joined `MessageWithSender` shape (`Message & { sender: Pick<UserProfile, 'full_name' | 'role'> }`) for display, matching the existing `OrderWithDetails`-style joined-type convention.

## Components & Files

New files:
- `lib/chat.ts` — `getPublicChannelCutoff(now: Date): Date`, a pure function, no DB calls.
- `components/chat-panel.tsx` — the side-drawer. Same fixed-overlay/backdrop-click-to-close shape as `components/topping-panel.tsx`. For foh/kitchen/register: renders only the public channel, no tabs. For manager: two tabs ("Chung" / "Chủ quán") switching between the two channel queries. For owner: only the owner channel (no public-channel access — they're not on anyone's shift). A message list (sender name + timestamp, own messages right-aligned/`bg-primary`, others' left-aligned/neutral) plus a text input + send button at the bottom, styled consistently with `ToppingPanel`'s note-input/confirm-button treatment.

Modified files:
- `app/(app)/app-shell.tsx` — the existing decorative `chat` `<span>` icon becomes a real button with an `onClick` opening `<ChatPanel>`, passed the current role, branchId, and user id (threaded down from the server-side layout the same way `role`/`fullName` already are).
- `lib/types.ts` — `UserRole` and the new `Message`/`MessageWithSender` types described above.

## Data Flow

1. FOH taps the chat icon → panel opens on the public channel, querying `messages WHERE branch_id = <theirs> AND channel = 'public' AND created_at >= getPublicChannelCutoff(now())`, ordered oldest-first.
2. They send "Hết giò tai rồi, đang gọi thêm" → insert, RLS allows it (their branch matches the row), Realtime pushes it to every other open panel on that branch instantly.
3. Manager has the panel open too, sees it land in "Chung" in real time. They switch to "Chủ quán" → a separate query (`channel = 'owner'`, no time cutoff) shows the full persistent owner-chat history.
4. Manager messages the owner about it. The owner, logged in separately and using their own branch selector to pick the right branch, reads it in their own owner-channel view — RLS allows it for them regardless of branch_id, since the owner isn't tied to one branch.
5. At 6:00 AM the next day, the public tab's query naturally excludes yesterday's messages — nothing was deleted, the cutoff just moved forward.

## Error Handling

- A foh/kitchen/register account never sees an owner-channel tab at all — the UI doesn't render it for those roles, and RLS would reject the query anyway if somehow attempted directly.
- No editing or deleting a sent message — once sent, it stays exactly as written until it naturally ages out of the public channel's time window (or forever, for the owner channel).

## Testing

- `lib/chat.ts` — Vitest unit tests for `getPublicChannelCutoff`: a time before 6 AM rolls back to yesterday's cutoff; a time at or after 6 AM uses today's; the exact 6:00:00 AM boundary itself counts as "today."
- `ChatPanel` and the Realtime wiring are UI/integration glue — verified via `npm run build`, `npm run lint`, and a manual multi-session smoke test (two browser sessions under different roles, confirming messages appear in real time on both, and that the owner channel is genuinely inaccessible — not just hidden — to non-manager, non-owner roles).

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| New `owner` role, real login, not an external contact | Architecture, Data Model |
| New `messages` table, two channels in one table | Architecture, Data Model |
| Public channel: daily 6 AM cutoff, read-side filter not a delete job | Architecture, Data Model, Data Flow |
| Owner channel: persistent, no cutoff | Architecture, Data Flow |
| Manager-only owner-chat access (not kitchen) | Scope |
| Plain text only, no structured/interactive messages | Scope |
| RLS added for this table specifically, despite no other table having it | Architecture, Data Model |
| Each branch has its own manager account; owner oversees both via existing branch-selector pattern | Architecture, Data Model |
| Manager switches via two tabs inside one panel (not two separate icons) | Components & Files |
| Side-drawer reuses the `ToppingPanel` pattern | Architecture, Components & Files |
