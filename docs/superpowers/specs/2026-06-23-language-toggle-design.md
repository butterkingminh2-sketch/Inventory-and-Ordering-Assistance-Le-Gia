# Site-Wide Language Toggle (VI / EN) — Design Spec

## Problem

A final-exam requirement specifies a toggle between full Vietnamese and full English for the whole site. The app currently does the opposite of a toggle: every label shows both languages at once (Vietnamese primary, English subtitle below — the convention recorded in this repo's `CLAUDE.md`). That convention is being superseded by this feature, not extended by it.

The good news: almost none of the actual *translation* work is new. The dual-label convention means most static UI text already has both a Vietnamese and an English string written down somewhere in the JSX (as primary + subtitle), and dish/ingredient names already have separate `name_vi`/`name_en` columns. The real work is building a toggle mechanism and then, screen by screen, swapping the render pattern from "always show both, stacked" to "show only the selected one."

## Scope

In scope:
- A `language: 'vi' | 'en'` preference, persisted per user in Supabase, toggled from a control reachable on every screen for every role.
- Converting every existing `text-label-vi` / `text-label-en` pair (~19 files) to render only the selected language, at the primary label's size/weight (no more two-line stack).
- Converting dish/ingredient name display (`name_vi`/`name_en`) the same way, wherever currently rendered.
- Converting `alert()`/`window.confirm()` dialogs and toast messages app-wide to the same mechanism.

Out of scope / explicitly deferred:
- The login page (`app/login/page.tsx`) — stays Vietnamese-only. There's no authenticated user yet at that point, so there's no persisted preference to read, and a separate session-only toggle just for that one screen isn't part of this request.
- A third language, or any generalized i18n key/dictionary system. Two languages, both already written inline — no abstraction beyond what's needed for that.
- Translating content a manager free-types into the system going forward (e.g. a new dish's `name_en` field being optional/blank) — if `name_en` is empty, English mode falls back to showing `name_vi` rather than blocking or showing nothing.

## Architecture

**One primitive function, used two ways.** `pickLabel(language, vi, en)` returns `vi` or `en` based on the current language — nothing more. It's the same logic whether it's filling in a JSX label or an `alert()` string, so there's exactly one thing to get right, not a component-based system for JSX and a separate parallel system for plain strings.

**Context for components, the same function for everything else.** A `useLanguage()` hook (backed by a `LanguageProvider`/Context) exposes `{ language, setLanguage, t }`, where `t` is `pickLabel` pre-bound to the current language. Inside any client component — including one that only ever calls `alert(t(vi, en))` from an event handler and renders no bilingual JSX at all — `useLanguage()` is called once at the top of the component, and `t` is closed over by every handler that needs it. No new plumbing pattern beyond "call the hook, use what it returns."

**Persisted per user, not per session or per device.** Consistent with this project's existing rule of no localStorage/cookies — everything lives in Supabase. A new `user_profiles.language` column is the single source of truth. Each of the three route-group layouts (`app/(app)/layout.tsx`, `app/kitchen/layout.tsx`, `app/register/layout.tsx`) already fetches that user's profile server-side for role/branch checks; adding `language` to that existing query and seeding `LanguageProvider`'s initial state from it means no extra round trip.

**Toggling updates the screen instantly, persists in the background.** `setLanguage` updates the Context's local state synchronously (so the whole UI re-renders in the new language with no perceptible delay) and fires an unawaited Supabase update to `user_profiles.language` for the current user. The next login reads the persisted value back in.

**One shared component absorbs the toggle UI into every header at once.** `components/account-menu.tsx` is already rendered by all three layouts (app-shell, kitchen, register) and already has a settings-like dropdown (it shows the branch selector there for managers/owners). Adding a VI/EN segmented control to that same dropdown means the toggle is reachable from every screen, for every role, with one component edit — no need to touch three header layouts individually for the control itself (the `LanguageProvider` wrapper still needs one line in each of the three layouts, to seed it from that layout's own profile fetch).

## Data Model

New migration (`supabase/migrations/020_user_profiles_language.sql`):
```sql
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'vi';

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_language_check CHECK (language IN ('vi', 'en'));
```

`lib/types.ts`: add `export type Language = 'vi' | 'en'`, and add `language: Language` to wherever the `UserProfile`-shaped type is defined.

## Components & Files

New files:
- `lib/language.ts` — pure functions, unit-tested: `pickLabel(language: Language, vi: string, en: string): string` and `pickName(row: { name_vi: string; name_en: string | null }, language: Language): string` (falls back to `name_vi` if `name_en` is null/empty, regardless of the selected language — there's nothing to show in English otherwise).
- `lib/language-context.tsx` — `LanguageProvider({ initialLanguage, userId, children })` holding `language` state and exposing `setLanguage`; `useLanguage()` returning `{ language, setLanguage, t: (vi, en) => pickLabel(language, vi, en) }`. `setLanguage` updates state synchronously, then calls `supabase.from('user_profiles').update({ language }).eq('id', userId)` without awaiting it in the caller.
- `components/bilingual-text.tsx` — `<BilingualText vi="..." en="..." className="...">`, rendering `<span className={className}>{t(vi, en)}</span>`. A drop-in replacement for the current two-`<p>` stack; `className` is whatever the *primary* label already used (the smaller subtitle's classes are simply no longer needed once only one line renders).

Modified files (representative, not exhaustive — the implementation plan enumerates every call site):
- `components/account-menu.tsx` — new "Ngôn ngữ / Language" section in the dropdown (alongside the existing branch-selector section), a two-option segmented control calling `setLanguage`. Calls `useLanguage()` directly; no new props needed on this component.
- `app/(app)/layout.tsx`, `app/kitchen/layout.tsx`, `app/register/layout.tsx` — add `language` to each existing `user_profiles` select; wrap the returned JSX in `<LanguageProvider initialLanguage={profile.language} userId={user.id}>`.
- Every file currently pairing `text-label-vi`/`text-label-en` (dashboard cards, order cards, settings, kitchen view, analytics, etc.) — each pair becomes one `<BilingualText>` call using the same two strings already present.
- Every `alert()`/`window.confirm()` call and toast message with a hardcoded Vietnamese string — wrapped in `t(viText, enText)`, with the component calling `useLanguage()` if it doesn't already.
- Wherever `dish.name_vi`/`item.name_vi` is read alongside `name_en` (or alone, since `name_vi` was previously always shown) — replaced with `pickName(row, language)`.

## Data Flow

1. **Login:** the relevant layout fetches the user's profile including `language`, seeds `LanguageProvider`.
2. **Toggle tap:** user opens the account menu, taps "EN". `setLanguage('en')` fires — every `BilingualText`, every `t(vi, en)` call, and every `pickName(row, 'en')` call across the currently-mounted tree re-renders in English on the next paint. A background Supabase update persists the choice.
3. **Next login (same or different device):** the profile fetch returns `language: 'en'`, and the app starts already in English — no flash of Vietnamese before correcting.
4. **A dish with no English name set:** `pickName` falls back to `name_vi` — English mode shows the Vietnamese name for that one dish rather than a blank or an error.

## Error Handling

- **Persisting the toggle fails (network blip):** the UI already reflects the new language (local state updated synchronously); only the background persistence call can fail, silently, with the next successful toggle (or next session, where it'd just read the old value) being the natural recovery. Given this is a low-stakes preference (not order/stock data), no retry/error-toast is added for this specific write — consistent with how `manual_correction` stock taps elsewhere in this app are similarly fire-and-forget for non-critical paths.
- **`name_en` is null/empty for an item or dish:** `pickName` always falls back to `name_vi`, in either language mode — never renders an empty string for a real row.
- **A screen renders before `LanguageProvider` has mounted:** not reachable — the provider wraps each layout's entire returned tree above any page content, and `initialLanguage` is available synchronously from the server-fetched profile (no client-side fetch/loading state for the initial value).

## Testing

- `lib/language.ts` — unit tests (Vitest): `pickLabel` returns `vi` for `'vi'` and `en` for `'en'`; `pickName` returns `name_en` when present and `language === 'en'`, and falls back to `name_vi` when `name_en` is null or `language === 'vi'`.
- `lib/language-context.tsx`, `components/bilingual-text.tsx`, and the page-by-page conversions are UI/integration glue — verified via `npm run build`, `npm run lint`, and a manual browser smoke test per converted screen (toggle to English, confirm labels/dish names/an alert dialog all switch; toggle back; log out and back in, confirm the choice persisted).

## Self-Review Checklist (spec vs discussion)

| Decision made during brainstorming | Covered by |
|---|---|
| Source of the requirement: final exam, not the (now-superseded) CLAUDE.md dual-label convention | Problem |
| Toggle covers both static UI text and DB content (dish/item names) | Scope, Architecture |
| Persist per user via Supabase, not per session/localStorage | Architecture, Data Model |
| Toggle control lives in the header, every screen, every role | Architecture, Components & Files |
| Alerts/confirms/toasts also convert, not just visible labels | Scope, Components & Files |
| Login page explicitly excluded | Scope |
| Reuse existing inline VI/EN strings rather than building a key/dictionary i18n system | Architecture, Problem |
