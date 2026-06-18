# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Lê Gia Inventory App
Vietnamese restaurant inventory system — 2 branches of Bún riêu Lê Gia in Hanoi.

---

## What this is
A responsive web app built with Next.js, deployed on Vercel, accessed via browser.
NOT a native mobile app — no React Native, no Expo, no app store.
Primary device is a tablet browser used by restaurant floor staff.
Desktop works too for managers reviewing from a laptop.
Mobile phone is a fallback only — do not over-optimize for it.

---

## Core problem being solved
When the kitchen runs out of giò, mọc, or đậu hũ mid-service, FOH staff don't
know until the dish is already being made. The customer waits, the kitchen sends
back "hết rồi", the customer has to re-order, and waits again — double the delay.

This app shows real-time stock levels so FOH staff can tell customers an item
is unavailable BEFORE taking the order. A second feature notifies FOH staff
when an order is ready so dishes are not forgotten during busy service.

---

## Stack
- Next.js 14 App Router + TypeScript
- Tailwind CSS (tablet-first responsive — see breakpoint rules below)
- Supabase (PostgreSQL + Realtime subscriptions for live stock updates)
- Google Stitch via MCP (UI design source of truth — see Design Workflow below)
- Deployed on Vercel

---

## Database (already exists in Supabase)
Tables: branches, items, orders, stock_logs
Realtime enabled on: items, orders
Full schema lives at: /docs/schema.sql

Do NOT invent new tables without asking first.
Do NOT use any storage other than Supabase — no localStorage, no cookies,
no in-memory state that needs to persist across sessions.

---

## Design Workflow — READ BEFORE WRITING ANY UI CODE

All UI components must follow this order. Do not freestyle Tailwind
components from scratch without checking here first.

1. Designs live in Google Stitch (stitch.withgoogle.com)
2. Stitch is connected via MCP (configured in .mcp.json at project root)
3. After fetching designs, a DESIGN.md will exist at /docs/DESIGN.md
   - DESIGN.md is the single source of truth for colors, spacing, typography
   - Always read /docs/DESIGN.md before building or modifying any component
   - If DESIGN.md does not exist yet, stop and tell the user to run Stitch first

### Stitch MCP usage
The "stitch" MCP server is available. Use it as follows:
- Fetch a specific screen: get_screen_code with the screen ID
- Fetch all screens at once: build_site with the project ID
- Browse available screens: stitch view command

### When building any UI component:
- Pull the relevant Stitch screen via MCP first
- Extract exact hex colors, px values, and font sizes from the fetched HTML/CSS
- Convert those values to Tailwind classes — do not hardcode arbitrary values
- If no Stitch screen exists for the component yet, tell the user so they
  can generate one in Stitch before any code is written

### Tailwind breakpoint convention
- Base styles = phone fallback only (rarely needed, not the focus)
- md: (768px) = PRIMARY target — tablet portrait or landscape
- lg: (1024px) = desktop and tablet landscape extended view
- Always write md: as the base experience, not sm:

Correct:   className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
Incorrect: className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3"

Touch targets must be minimum 44px height — staff use fingers on tablets.

---

## Screens (to be generated in Stitch first)

### 1. Inventory dashboard
- Top bar: branch selector (2 branches), last-updated timestamp
- Main grid: ingredient cards — 2 columns on tablet, 3 on desktop
  Each card: Vietnamese name (primary) + English label (smaller),
  current quantity, unit (phần / viên / miếng), status badge
  (green = sufficient, amber = low, red = out of stock),
  and +/- buttons for staff to update count inline
- Sticky bottom strip: count of low/out-of-stock items in warm red,
  disappears when all items are sufficient

### 2. Order-ready notification view
- One full-width card per ready order
- Each card shows: table number, time elapsed since ordered, item list,
  and a "Đã mang ra" / "Delivered" confirm button
- Cards sorted oldest first (most urgent at top)
- Cards older than 5 minutes show a pulse/highlight alert
- Confirming removes the card from the view

---

## Key constraints
- NO QR code ordering system
- NO reservation system
- Tablet-first responsive web (not native mobile)
- Vietnamese as primary label on all UI, English subtitle below
- Branch selector must be visible and switchable on every main screen
- All visual values (colors, spacing, typography) must come from
  /docs/DESIGN.md — never invented by Claude

---

## What NOT to do
- Don't invent new Supabase tables without asking first
- Don't use localStorage, sessionStorage, or any non-Supabase storage
- Don't run npm install for any new package without confirming with user first
- Don't commit .env.local under any circumstances
- Don't build UI components without first fetching the Stitch design via MCP
- Don't hardcode color hex values — use only values extracted from DESIGN.md
- Don't optimize primarily for phone viewports
- Don't add features not listed in this file without asking first