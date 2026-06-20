# Nav Restructure (FOH-First) — Design Spec

## Problem

The current nav has two issues raised by the business owner:

1. FOH staff see a "Kho" (Inventory) sidebar link they don't need — dish availability is already shown inline in the Đặt món dish picker, so the separate inventory dashboard isn't part of their job.
2. The top bar is cluttered with a branch selector that's a genuine safety risk for non-manager roles: a FOH/kitchen/register account that could switch its active branch could accidentally place an order, deliver a dish, or adjust stock against the wrong physical location's data — invisible to whoever is actually standing at that location. There's also currently no way to log out of the app at all.

This is the first of several nav/UI sub-projects scoped out of a larger request (see "Out of scope" below). It's deliberately the smallest, most foundational piece — the other sub-projects (menu categorization, re-order shortcuts, toppings/notes) build on top of whatever shell this produces.

## Scope

In scope:
- Trim the FOH sidebar to Đặt món + Đang chạy only
- Condense the top bar to a right-aligned Chat icon (placeholder) + Account menu, for every role
- For `manager` only, keep the branch name visible on the left of the top bar (unchanged position), since they're the one role that may legitimately act on either branch
- Build the first logout mechanism in the app, inside the new Account menu
- Extend the same Account+Chat header to `kitchen` and `register`, which currently have bare headers with no account access at all
- Lock `foh`/`kitchen`/`register` accounts to their assigned branch with zero UI to switch it — not shown, not selectable

Out of scope (separate future sub-projects, not decided or designed here):
- Menu category tabs (food/drinks/hotpot) in Đặt món
- A shortcut from Đang chạy to add more items to an already-placed table's order ("re-order" workflow)
- Toppings/add-ons and ingredient-removal notes (the slide-in panel)
- The actual Chat feature behind the placeholder icon — deliberately undecided between staff-to-staff messaging and an AI-powered stock-monitoring assistant; these are unrelated systems and the choice needs its own brainstorm before any backend work starts
- Any change to the manager's sidebar (Cài đặt's position, etc.) — explicitly deferred by the business owner

## Architecture

**Sidebar** (`components/sidebar-nav.tsx`): the existing role-conditional `tabs` array construction stays the same pattern, just with `foh`'s base tab list trimmed from three entries (Kho, Đặt món, Đang chạy) to two (Đặt món, Đang chạy). `manager` keeps its full five-tab list unchanged. `kitchen`/`register` are unaffected — they don't use this component at all.

**Top bar**: today, `app/(app)/app-shell.tsx` renders a header with `<BranchSelector>` on the left and a manager-only settings icon on the right. This is replaced with:
- A new `<AccountMenu>` component (icon + name + role, opens a dropdown) and a placeholder Chat icon, both right-aligned, for every role.
- For `manager` specifically, the branch name (not the interactive `<BranchSelector>` dropdown) stays left-anchored — but the *switching* control moves inside `<AccountMenu>`'s dropdown, so the top bar itself just displays the current branch as a label, not a clickable selector.
- For `foh`, nothing renders on the left at all.

`app/kitchen/layout.tsx` and `app/register/layout.tsx` currently render a bare header (icon + "Bếp"/"Thu ngân" label, no account access). Both gain the same right-aligned `<AccountMenu>` + Chat icon. Neither shows a branch name or switcher (kitchen/register accounts never have one).

**Account menu** (new `components/account-menu.tsx`): a presentational client component, reusable across all four layouts (`app-shell.tsx`, `kitchen/layout.tsx`, `register/layout.tsx`). It does not fetch anything itself — `full_name`/`role` are passed down as props from whichever server layout already queries `user_profiles` for its own auth guard (each layout adds `full_name` to its existing `select('role', ...)` call and threads it through to the client shell component it renders, the same way `app-shell.tsx` already receives `role`/`defaultBranchId` as props today). Props: `{ fullName: string | null; role: UserRole; branches?: Branch[]; currentBranchId?: string; onBranchChange?: (id: string) => void }` — the branch-related props are only passed (and only render the branch row) when the caller is the manager's `app-shell.tsx` AND `branches.length > 1`; everyone else passes nothing for those props and the dropdown simply omits that row.

**Chat placeholder icon**: renders with no `onClick` handler at all (or a no-op) — not even a "coming soon" toast. It exists purely to reserve the layout slot so the real feature doesn't shift the header again later.

## Data Flow

- **Branch locking**: no schema change needed. `user_profiles.branch_id` already exists and is already what every page's data-fetching is scoped to (`.eq('branch_id', branchId)` everywhere). The change here is purely UI: `foh`/`kitchen`/`register` simply never get a way to call `setBranchId` to anything other than their profile's fixed value, since they no longer render any switcher control. `BranchContext`'s `setBranchId` function itself doesn't need to be removed from the codebase (manager still uses it) — it's just never exposed to non-manager UI.
- **Logout**: `AccountMenu`'s "Đăng xuất" action calls `supabase.auth.signOut()` then `router.push('/login')`. This is net-new — no existing code path does this today.
- **Account info**: `AccountMenu` needs `full_name` and `role`, both already columns on `user_profiles`. `app-shell.tsx` already fetches `role`/`branch_id` for its own routing logic in the parent `app/(app)/layout.tsx` server component — `full_name` needs to be added to that existing `select('role, branch_id')` query (one extra column, no migration). `kitchen/layout.tsx` and `register/layout.tsx` similarly already query `user_profiles` for their own guard checks and will need `full_name` added to their existing `select('role')` queries.

## Components & Files

New files:
- `components/account-menu.tsx` — the dropdown described above

Modified files:
- `components/sidebar-nav.tsx` — trim `foh`'s tab list to two entries
- `app/(app)/app-shell.tsx` — replace the header's `<BranchSelector>` + manager-only gear icon with: branch name label (manager only, left-anchored) + `<AccountMenu>` + Chat placeholder icon (right-aligned, every role)
- `app/(app)/layout.tsx` — add `full_name` to the existing `user_profiles` select so it can be passed down to `AccountMenu`
- `app/kitchen/layout.tsx` — add `full_name` to its existing `user_profiles` select; add `<AccountMenu>` + Chat placeholder icon to its header
- `app/register/layout.tsx` — same as kitchen
- `components/branch-selector.tsx` — no structural change, but it's now only ever rendered *inside* `AccountMenu`'s dropdown for `manager`, never directly in a page header

## Error Handling

- `signOut()` failing (network blip) — show nothing fancy; Supabase's client-side session simply won't clear, so the user stays logged in and can retry. No new error UI needed since this mirrors how every other Supabase call in this codebase already behaves (no retry/error-toast infrastructure exists for auth calls).
- A `foh`/`kitchen`/`register` account somehow missing `branch_id` (data integrity issue, not a normal runtime path) — already handled by each layout's existing `if (!profile) redirect(...)` guards; no new handling needed.

## Testing

This is UI/layout work with no new pure-logic functions — consistent with how prior nav-only changes in this codebase (e.g. the kitchen tap-target fix, the sidebar register link) were verified: `npm run build`, `npm run lint`, and a manual browser smoke test per role (foh, kitchen, register, manager) confirming the right elements appear/disappear and logout actually works.

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| FOH sidebar trimmed to Đặt món + Đang chạy | Architecture (Sidebar) |
| Manager sidebar unchanged, Cài đặt position deferred | Scope (Out of scope) |
| Top bar fully right-aligned for foh/kitchen/register | Architecture (Top bar) |
| Manager keeps branch name left-anchored, switcher moves into Account menu | Architecture (Top bar, Account menu) |
| Chat icon present but non-functional (placeholder) | Scope, Architecture |
| Branch switching removed entirely for foh/kitchen/register — locked, not shown | Data Flow (Branch locking) |
| Kitchen/register headers gain Account+Chat (currently bare) | Components & Files |
| First logout mechanism in the app | Data Flow (Logout) |
