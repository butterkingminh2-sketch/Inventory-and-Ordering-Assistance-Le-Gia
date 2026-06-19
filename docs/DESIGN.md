# DESIGN.md — Lê Gia Inventory App

> Source of truth for all visual values. Generated from Google Stitch project `9542242204487351628`.
> Screens: Inventory Dashboard · Order-Ready Notifications
> Do NOT hardcode any hex values in component code — reference the token names below.

---

## Tailwind Config

Both screens share an identical Tailwind theme extension. Copy this block exactly into `tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      // Primary — terracotta/brick red
      "primary":                    "#9b3f25",
      "primary-container":          "#bb563b",
      "primary-fixed":              "#ffdbd1",
      "primary-fixed-dim":          "#ffb5a1",
      "inverse-primary":            "#ffb5a1",
      "surface-tint":               "#9e4127",
      "on-primary":                 "#ffffff",
      "on-primary-container":       "#fffbff",
      "on-primary-fixed":           "#3b0800",
      "on-primary-fixed-variant":   "#7f2a12",

      // Secondary — muted sage green
      "secondary":                  "#506354",
      "secondary-container":        "#d0e5d2",
      "secondary-fixed":            "#d3e8d5",
      "secondary-fixed-dim":        "#b7ccb9",
      "on-secondary":               "#ffffff",
      "on-secondary-container":     "#546758",
      "on-secondary-fixed":         "#0e1f13",
      "on-secondary-fixed-variant": "#394b3d",

      // Tertiary — warm brown/tan
      "tertiary":                   "#6e5749",
      "tertiary-container":         "#887061",
      "tertiary-fixed":             "#fbddca",
      "tertiary-fixed-dim":         "#dec1af",
      "on-tertiary":                "#ffffff",
      "on-tertiary-container":      "#fffbff",
      "on-tertiary-fixed":          "#28180d",
      "on-tertiary-fixed-variant":  "#574335",

      // Error — used for out-of-stock and overdue states
      "error":                      "#ba1a1a",
      "error-container":            "#ffdad6",
      "on-error":                   "#ffffff",
      "on-error-container":         "#93000a",

      // Surface / Background — warm off-white
      "background":                 "#fbf9f4",
      "surface":                    "#fbf9f4",
      "surface-bright":             "#fbf9f4",
      "surface-dim":                "#dbdad5",
      "surface-variant":            "#e4e2dd",
      "surface-container-lowest":   "#ffffff",
      "surface-container-low":      "#f5f3ee",
      "surface-container":          "#f0eee9",
      "surface-container-high":     "#eae8e3",
      "surface-container-highest":  "#e4e2dd",
      "on-surface":                 "#1b1c19",
      "on-surface-variant":         "#56423d",
      "inverse-surface":            "#30312e",
      "inverse-on-surface":         "#f2f1ec",

      // Outline
      "outline":                    "#89726c",
      "outline-variant":            "#ddc0b9",
    },

    borderRadius: {
      // NOTE: these override Tailwind defaults — "full" is NOT a pill
      "DEFAULT": "0.125rem",  // 2px
      "lg":      "0.25rem",   // 4px
      "xl":      "0.5rem",    // 8px
      "full":    "0.75rem",   // 12px — used for badges and chips
    },

    spacing: {
      "touch-target-min": "48px",   // minimum tap target for tablet
      "stack-sm":         "4px",
      "stack-md":         "12px",
      "stack-lg":         "24px",
      "base":             "8px",
      "gutter":           "16px",
      "margin-mobile":    "16px",
      "margin-tablet":    "24px",
      "margin-desktop":   "32px",
    },

    fontFamily: {
      // All roles use Be Vietnam Pro — weight conveys role, not face
      "headline-lg":        ["Be Vietnam Pro", "sans-serif"],
      "headline-lg-mobile": ["Be Vietnam Pro", "sans-serif"],
      "headline-md":        ["Be Vietnam Pro", "sans-serif"],
      "body-lg":            ["Be Vietnam Pro", "sans-serif"],
      "body-md":            ["Be Vietnam Pro", "sans-serif"],
      "label-vi":           ["Be Vietnam Pro", "sans-serif"],
      "label-en":           ["Be Vietnam Pro", "sans-serif"],
      "status-badge":       ["Be Vietnam Pro", "sans-serif"],
    },

    fontSize: {
      "headline-lg":        ["32px", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "700" }],
      "headline-lg-mobile": ["24px", { lineHeight: "1.2", fontWeight: "700" }],
      "headline-md":        ["24px", { lineHeight: "1.3", fontWeight: "700" }],
      "body-lg":            ["18px", { lineHeight: "1.5", fontWeight: "500" }],
      "body-md":            ["16px", { lineHeight: "1.5", fontWeight: "400" }],
      "label-vi":           ["14px", { lineHeight: "1.2", fontWeight: "700" }],
      "label-en":           ["12px", { lineHeight: "1.2", fontWeight: "400" }],
      "status-badge":       ["13px", { lineHeight: "1",   letterSpacing: "0.05em", fontWeight: "800" }],
    },
  },
}
```

Google Fonts import (add to root `<head>` or `globals.css`):
```
https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;700;800;900&display=swap
```

Icons: **Material Symbols Outlined** (Google icon font, not an npm package):
```
https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap
```

---

## Color Roles — Quick Reference

| Token | Hex | Use |
|---|---|---|
| `primary` | `#9b3f25` | Brand color, active nav border, quantity numbers, button fill |
| `on-primary` | `#ffffff` | Text/icons on primary buttons |
| `secondary` | `#506354` | Deliver/confirm button background |
| `on-secondary` | `#ffffff` | Text on secondary buttons |
| `secondary-container` | `#d0e5d2` | "Đủ / SUFFICIENT" badge bg; summary chips |
| `on-secondary-container` | `#546758` | Text on secondary-container |
| `tertiary-fixed` | `#fbddca` | "LOW" badge bg; active nav item bg; TAKEAWAY badge |
| `on-tertiary-fixed` | `#28180d` | Text on tertiary-fixed |
| `tertiary-container` | `#887061` | "Sắp hết / LOW" badge bg (darker variant) |
| `on-tertiary-container` | `#fffbff` | Text on tertiary-container |
| `error` | `#ba1a1a` | Out-of-stock card border; overdue elapsed text; urgency pulse |
| `error-container` | `#ffdad6` | Out-of-stock card fill; "Quá hạn" badge bg; alert footer bg |
| `on-error` | `#ffffff` | Text on error (e.g. "Hết / OUT" badge) |
| `on-error-container` | `#93000a` | Text on error-container (alert footer text) |
| `background` / `surface` | `#fbf9f4` | Page background, top nav bg |
| `surface-container-lowest` | `#ffffff` | Card backgrounds |
| `surface-container-low` | `#f5f3ee` | Sidebar background; scrollbar track |
| `surface-container-high` | `#eae8e3` | Minus/decrement button bg; hover states |
| `on-surface` | `#1b1c19` | Primary body text |
| `on-surface-variant` | `#56423d` | Secondary/muted text, inactive nav icons |
| `outline-variant` | `#ddc0b9` | Card borders, dividers, nav borders |
| `outline` | `#89726c` | Stronger borders |

---

## Status Badge System

Badges use `rounded-full` (12px) with `font-status-badge` (13px, weight 800, letter-spacing 0.05em, uppercase).

| Status | Vietnamese | Background | Text color |
|---|---|---|---|
| Sufficient | Đủ / SUFFICIENT | `secondary-container` `#d0e5d2` | `on-secondary-container` `#546758` |
| Low stock | Sắp Hết / LOW | `tertiary-container` `#887061` | `on-tertiary-container` `#fffbff` |
| Out of stock | Hết / OUT | `error` `#ba1a1a` | `on-error` `#ffffff` |
| New order | Mới | `secondary-fixed` `#d3e8d5` | `on-secondary-fixed` `#0e1f13` |
| Overdue | Quá Hạn | `error-container` `#ffdad6` | `on-error-container` `#93000a` |
| Takeaway | Takeaway | `tertiary-fixed` `#fbddca` | `on-tertiary-fixed` `#28180d` |

---

## Typography Rules

Single typeface throughout: **Be Vietnam Pro**. Weight signals the role.

| Role | Token | Size | Weight | Use |
|---|---|---|---|---|
| Page heading (desktop) | `headline-lg` | 32px / lh 1.2 | 700 | Screen title on tablet/desktop |
| Page heading (mobile) | `headline-lg-mobile` | 24px / lh 1.2 | 700 | Screen title on phone |
| Section / card heading | `headline-md` | 24px / lh 1.3 | 700 | Card name, table number |
| Body large | `body-lg` | 18px / lh 1.5 | 500 | Order item list text |
| Body medium | `body-md` | 16px / lh 1.5 | 400 | Description, note text |
| Vietnamese label | `label-vi` | 14px / lh 1.2 | 700 | Primary UI labels (VI first) |
| English subtitle | `label-en` | 12px / lh 1.2 | 400 | Secondary label below VI |
| Status badge | `status-badge` | 13px / lh 1 | 800 | All status badges, uppercase |

**Bilingual rule:** Vietnamese is always the primary label (`label-vi`, heavier). English subtitles sit below in `label-en`, smaller and lighter, sometimes with `uppercase tracking-wider`.

Quantity numbers use `text-[32px] font-black` (weight 900) colored with the status primary color.

---

## Spacing System

| Token | Value | Use |
|---|---|---|
| `stack-sm` | 4px | Tight internal gaps |
| `base` | 8px | Icon-text gaps, small padding |
| `stack-md` | 12px | Card internal padding sections |
| `gutter` | 16px | Column gutters |
| `margin-mobile` | 16px | Page horizontal padding on phone |
| `stack-lg` | 24px | Between cards, section gaps |
| `margin-tablet` | 24px | Page horizontal padding on tablet |
| `margin-desktop` | 32px | Page horizontal padding on desktop |
| `touch-target-min` | 48px | Min height/width for all interactive elements |

---

## Layout

### Shell (both screens)

```
┌──────────────────────────────────────────────────────┐
│ Header (fixed, h-touch-target-min = 48px)            │
│ bg-surface / border-b border-outline-variant         │
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │ Main Content                              │
│ w-64     │ md:ml-64                                  │
│ hidden   │ p-margin-mobile md:p-margin-tablet        │
│ on phone │ lg:p-margin-desktop                       │
│          │                                           │
│ bg-      │                                           │
│ surface- │                                           │
│ container│                                           │
│ -low     │                                           │
├──────────┴───────────────────────────────────────────┤
│ Alert Footer (fixed bottom-0, z-50)                  │
│ bg-error-container / text-on-error-container         │
└──────────────────────────────────────────────────────┘
│ Mobile Bottom Nav (fixed, h-16, md:hidden)           │
│ bg-surface / border-t border-outline-variant         │
└──────────────────────────────────────────────────────┘
```

- `pb-[40px]` on the main wrapper to clear the alert footer
- `pb-12` on main content to clear mobile bottom nav + footer

### Sidebar Nav Item States

Active item:
```html
class="bg-tertiary-fixed text-on-tertiary-fixed rounded-lg mx-2 my-1 px-4 py-3
       flex items-center gap-3 border-l-4 border-primary"
```

Inactive item:
```html
class="text-on-surface-variant rounded-lg mx-2 my-1 px-4 py-3
       flex items-center gap-3 hover:bg-surface-container-highest transition-all"
```

---

## Screen 1: Inventory Dashboard

### Ingredient Card

```
┌─────────────────────────────────────┐
│ Tên nguyên liệu    [STATUS BADGE]   │  headline-md + label-en
│ English name                        │  text-on-surface / text-on-surface-variant
├─────────────────────────────────────┤  border-t border-surface-variant
│ 25 kg              [−]  [+]         │  text-[32px] font-black + touch-target-min buttons
└─────────────────────────────────────┘
```

Card states:
- **Sufficient:** `bg-surface-container-lowest border border-outline-variant rounded-xl p-5`
- **Low:** same as sufficient but add `ring-1 ring-tertiary-fixed-dim`
- **Out of stock:** `bg-error-container/20 border-2 border-error ring-2 ring-error/10 ring-offset-2`

Quantity number color by status:
- Sufficient → `text-primary` (`#9b3f25`)
- Low → `text-tertiary` (`#6e5749`)
- Out of stock → `text-error` (`#ba1a1a`)

+/- Buttons:
- Minus: `w-touch-target-min h-touch-target-min bg-surface-container-high rounded-lg border border-outline-variant text-primary`
- Plus: `w-touch-target-min h-touch-target-min bg-primary text-on-primary rounded-lg shadow-md`

Grid layout: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-stack-lg` (min card width ~320px)

### Alert Footer (Inventory)

```html
class="fixed bottom-0 left-0 w-full z-[100] bg-error-container text-on-error-container
       px-margin-tablet py-3 shadow-lg flex justify-between items-center animate-pulse"
```
Disappears when all items are sufficient.

---

## Screen 2: Order-Ready Notifications

### Order Card

```
┌─────────────────────────────────────┬──────────────┐
│ Bàn 4 / Table 4                     │              │
│ ⚠ Đã chờ: 8 phút     [QUÁ HẠN]    │  [✓]         │
│ ─────────────────────────────────── │  Đã mang ra  │
│ Phở Bò (2), Gỏi Cuốn (1)           │  Delivered   │
│ Note: Không hành cho 1 tô phở.      │              │
└─────────────────────────────────────┴──────────────┘
```

Card: `rounded-xl overflow-hidden shadow-sm flex flex-col md:flex-row`

Card states:
- **Normal:** `bg-surface-container-lowest border border-outline-variant`
- **Overdue (≥5 min):** `bg-surface-container-lowest border-2 border-error animate-pulse-critical`

Urgency animation (add to globals.css):
```css
@keyframes pulse-critical {
  0%   { box-shadow: 0 0 0 0   rgba(186, 26, 26, 0.4); border-color: #ba1a1a; }
  50%  { box-shadow: 0 0 0 12px rgba(186, 26, 26, 0);   border-color: #ffdad6; }
  100% { box-shadow: 0 0 0 0   rgba(186, 26, 26, 0);   border-color: #ba1a1a; }
}
.animate-pulse-critical { animation: pulse-critical 2s infinite; }
```

Elapsed time text:
- Normal: `text-on-surface-variant` with `schedule` icon
- Overdue: `text-error font-black` with `warning` icon

Deliver button (right column):
```html
class="bg-secondary text-on-secondary px-stack-lg py-6 md:w-48
       flex flex-col items-center justify-center gap-2
       hover:bg-on-secondary-container transition-all active:scale-95"
```
Icon: `check_circle` at `text-[40px]`

Confirm exit: card slides right and fades out (`opacity → 0.5`, `translateX(20px)`, 300ms).

---

## Scrollbar (desktop webkit)

```css
::-webkit-scrollbar       { width: 8px; }
::-webkit-scrollbar-track { background: #f5f3ee; }  /* surface-container-low */
::-webkit-scrollbar-thumb { background: #dec1af; border-radius: 4px; }  /* tertiary-fixed-dim */
```

---

## Do Not

- Do not use hex values directly in component code — use the Tailwind token names above
- Do not use `rounded-full` expecting a pill shape — it is 12px in this design system
- Do not use `sm:` breakpoint as the tablet target — use `md:` (768px) as primary
- Do not add color roles not listed here without updating this file first
