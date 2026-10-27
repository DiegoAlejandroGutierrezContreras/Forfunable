---
name: Factura
colors:
  surface: '#fdf8ff'
  surface-dim: '#ddd8e5'
  surface-bright: '#fdf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f1fe'
  surface-container: '#f1ebf9'
  surface-container-high: '#ece6f3'
  surface-container-highest: '#e6e0ed'
  on-surface: '#1c1a23'
  on-surface-variant: '#49454f'
  inverse-surface: '#312f39'
  inverse-on-surface: '#f4eefb'
  outline: '#7a7580'
  outline-variant: '#cac4d1'
  surface-tint: '#645494'
  primary: '#433371'
  on-primary: '#ffffff'
  primary-container: '#5b4b8a'
  on-primary-container: '#d2c1ff'
  inverse-primary: '#cebdff'
  secondary: '#605c6d'
  on-secondary: '#ffffff'
  secondary-container: '#e3ddf1'
  on-secondary-container: '#646071'
  tertiary: '#1c471c'
  on-tertiary: '#ffffff'
  tertiary-container: '#335f31'
  on-tertiary-container: '#a6d79e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e8ddff'
  primary-fixed-dim: '#cebdff'
  on-primary-fixed: '#200d4c'
  on-primary-fixed-variant: '#4c3c7a'
  secondary-fixed: '#e6dff3'
  secondary-fixed-dim: '#c9c4d7'
  on-secondary-fixed: '#1c1a28'
  on-secondary-fixed-variant: '#484554'
  tertiary-fixed: '#bdf0b4'
  tertiary-fixed-dim: '#a2d39a'
  on-tertiary-fixed: '#002203'
  on-tertiary-fixed-variant: '#255024'
  background: '#fdf8ff'
  on-background: '#1c1a23'
  surface-variant: '#e6e0ed'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  tabular-amount-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  tabular-amount-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system establishes an ultra-refined, restrained, and utilitarian aesthetic tailored for modern electronic billing and financial invoicing. Drawing direct inspiration from Cupertino-style high-end minimalism, the interface treats financial transactions as structured, calm, and distraction-free artifacts.

### Key Tenets
- **Quiet Authority:** Premium experience achieved through immaculate whitespace, meticulous micro-alignments, and delicate low-contrast dividing structures rather than heavy ornamentation.
- **Pure Functional Precision:** All monetary amounts, line items, and invoice states prioritize immediate clarity and balance. Numeric data is treated with institutional rigor.
- **Understated Sophistication:** The aesthetic rejects aggressive vibrant fills and neon feedback cues in favor of muted, desaturated tones that reduce cognitive fatigue during prolonged bookkeeping operations.
- **Wordmark Identity:** No illustrative emblems or decorative graphics; the identity relies exclusively on the pristine typographical setting of the text wordmark "Factura".

## Colors

The palette is strictly desaturated, muted, and architectural, using calibrated warm-lavender grays to maintain an organic, tactile paper quality.

### Color Tokens & Assignments
- **Background Canvas (`#F6F5F8`):** Off-white canvas tinted with subtle bone-lavender, grounding the entire viewport without harsh glare.
- **Surface (`#FFFFFF`):** Reserved for elevated interactive structural units: invoicing sheets, summary cards, data tables, sheets, and dialogs.
- **Borders & Dividers (`#E4E1EA`):** Continuous 1px hairline perimeter and interior separators that partition high-density data without visual noise.
- **Primary Text (`#1D1B24`):** Deep charcoal-eggplant providing high readability and contrast across all white and muted tinted surfaces.
- **Secondary Text (`#6B6778`):** Mid-tone neutral for secondary labels, metadata, metadata headers, and helper descriptions.
- **Brand Primary (`#5B4B8A`):** Deep muted thistle-purple for focus triggers, selected states, and primary actions. Hover variant is `#4A3C73`; subtle tint container fill is `#ECE8F5`.
- **Success / Paid (`#3F6B3C`):** Desaturated sage green for confirmed receipts, paid badges, and positive balances. Applied atop background tint `#E6F0E4`.
- **Warning / Pending (`#A8612A`):** Muted ochre-amber for overdue alerts, partial settlements, and exhausted line-item stock. Applied atop background tint `#F8EBDD`.
- **Error / Critical (`#A8433F`):** Restrained terracotta red for voided records, cancellation triggers, and critical validation alerts. Applied atop background tint `#F6E3E2`.

## Typography

The typography scale utilizes **Inter** configured strictly across two weights: **Regular (400)** for all body text, structural descriptions, and field values; and **Semi-Bold (600)** for headings, buttons, tabular figures, and labels.

### Tabular Number Formatting
- Every monetary amount, quantity, unit rate, and tax calculation must enforce `font-feature-settings: "tnum" 1, "cv05" 1` to guarantee monospace alignment down vertical columns.
- Standard currency localization for Colombian Peso must be rendered consistently: `$3.500.000` (period as thousands separator, comma as decimal delimiter if cents are displayed).

## Layout & Spacing

A strictly modular layout rooted in an 8pt architectural rhythm, expanding to a 12-column grid on desktop displays and collapsing to a unified single-column flow on mobile viewport widths.

### Layout Rules
- **Desktop (min-width: 1024px):** 12-column layout with 24px (`1.5rem`) gutters and 40px (`2.5rem`) outer canvas margins. Detail sheets (e.g., active invoice generation) utilize a 7:5 split (editor pane to instant invoice preview).
- **Tablet (min-width: 640px and max-width: 1023px):** 8-column layout with 16px (`1rem`) gutters and 24px margins. Two-column metric aggregates stack logically.
- **Mobile (< 640px):** Single-column stacked layout with 16px (`1rem`) safe margins. Secondary table columns (SKU, discount) convert into expandable list details under line-item rows.
- **Canvas Container:** Maximum container width is capped at 1280px to preserve scan lines across wide monitors.

## Elevation & Depth

In keeping with minimalist aesthetic conventions, depth is conveyed through layered planes and 1px crisp separation rather than ambient drop shadows. Surfaces sit flat on `#F6F5F8` like sheets of premium stationery.

### Hierarchy & Layers
- **Base Canvas:** `#F6F5F8` (Zero elevation, flat background).
- **Cards, Panels, and Invoicing Sheets:** Surface color `#FFFFFF` bounded by a 1px solid border of `#E4E1EA`. No shadow is cast.
- **Modals & Overlays:** `#FFFFFF` with a 1px border of `#E4E1EA` supported by a soft, low-contrast diffuse shadow: `0 20px 40px -12px rgba(29, 27, 36, 0.08), 0 1px 3px 0 rgba(29, 27, 36, 0.04)`. The backdrop overlay uses `#1D1B24` with 20% opacity and `backdrop-filter: blur(4px)`.
- **Toasts & Transient Floating Notices:** Minimal floating container anchored to bottom-center or top-right, styled with `#FFFFFF`, `#E4E1EA` border, and shadow: `0 8px 24px -4px rgba(29, 27, 36, 0.06)`.

## Shapes

The geometry strikes a deliberate distinction between containers and micro-interactive elements to reinforce tactile ergonomics.

### Corner Radius Assignments
- **Cards, Tables, Panels & Dialog Modals:** Explicitly styled between 12px and 16px (`rounded-lg` to `rounded-xl`).
- **Interactive Controls (Buttons, Text Inputs, Selects, Dropdowns):** Exactly 10px (`border-radius: 10px`) for a crisp, ergonomic feel.
- **Pills & Status Badges:** Fully circular pill radius (`border-radius: 9999px`) to immediately set status metadata apart from form elements.

## Components

### Buttons
- **Primary Button:** Background `#5B4B8A`, text `#FFFFFF`, height 40px, padding horizontal 16px, radius 10px, typography `label-md`. Hover state `#4A3C73`, active state downscales subtly (`scale(0.99)`).
- **Secondary Button:** Background `#FFFFFF`, border 1px solid `#E4E1EA`, text `#1D1B24`. Hover state background `#F6F5F8`.
- **Ghost / Subtle Button:** Background transparent, text `#6B6778`, hover text `#1D1B24`, hover background `#ECE8F5`.
- **Destructive Button:** Background `#F6E3E2`, text `#A8433F`, hover background `#A8433F` with text `#FFFFFF`.

### Inputs & Select Fields
- Height 40px, background `#FFFFFF`, border 1px solid `#E4E1EA`, radius 10px, typography `body-md` in `#1D1B24`.
- **Placeholder:** `#6B6778` with 60% opacity.
- **Focus State:** Border color `#5B4B8A`, accompanied by a 2px outer ring in `#ECE8F5` without heavy glow.
- **Financial Number Inputs:** Tabular numerals with the currency symbol fixed in `#6B6778` inside the prefix slot.

### Status Chips & Badges
- Height 24px, radius 9999px (pill), padding horizontal 10px, typography `label-sm`.
- **Paid / Facturada:** Background `#E6F0E4`, text `#3F6B3C`.
- **Pending / Parcial:** Background `#F8EBDD`, text `#A8612A`.
- **Cancelled / Anulada:** Background `#F6E3E2`, text `#A8433F`.
- **Draft / Borrador:** Background `#ECE8F5`, text `#5B4B8A`.

### Tables (Invoice Itemization)
- Full width, background `#FFFFFF`, radius 14px, encapsulated by 1px solid `#E4E1EA`.
- **Header Row:** Height 36px, background `#F6F5F8`, border-bottom 1px solid `#E4E1EA`, typography `label-sm` in `#6B6778`, uppercase with slight tracking.
- **Data Rows:** Height 48px, border-bottom 1px solid `#E4E1EA`, hover state `#F6F5F8` (transition 150ms). Monetary columns align right with `tabular-amount-md`.

### Cards & Totals Summary Panel
- Enclosed with `#FFFFFF` fill, 1px `#E4E1EA` border, 16px corner radius, padding 20px.
- Summary rows display subtotal, IVA (19%), retention, and grand total in clear, right-aligned tabular rows. The final payable amount renders at `tabular-amount-lg` in `#1D1B24`.

### Checkboxes & Selection Controls
- Checkbox dimensions 18x18px, radius 5px. Unchecked border 1.5px solid `#E4E1EA`, background `#FFFFFF`. Checked background `#5B4B8A` with pure white check glyph.