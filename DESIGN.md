# Nextbench — Design System

## Brand Overview

Nextbench is a verified student-to-student marketplace. The brand is warm, trustworthy, and premium — but never cold or corporate. The palette is inspired by Apple's clarity and precision, with a friendly edge.

## Register

brand

## Colors

### Neutral palette

| Token | Light | Dark |
|---|---|---|
| `--color-surface-base` | `#F5F5F7` | `#0D0F14` |
| `--color-surface-soft` | `#EBEBED` | `#131722` |
| `--color-surface-card` | `#FFFFFF` | `#131722` |
| `--color-surface-elevated` | `#FFFFFF` | `#171C28` |
| `--color-luxury-ink` | `#1D1D1F` | `#FFFFFF` |
| `--color-luxury-ink-muted` | `rgba(29,29,31,0.50)` | `rgba(255,255,255,0.55)` |
| `--color-luxury-ink-faint` | `rgba(29,29,31,0.08)` | `rgba(255,255,255,0.06)` |
| `--color-border` | `rgba(29,29,31,0.08)` | `rgba(255,255,255,0.06)` |
| `--color-border-strong` | `rgba(29,29,31,0.15)` | `rgba(255,255,255,0.12)` |
| `--color-glass-bg` | `rgba(255,255,255,0.72)` | `rgba(19,23,34,0.85)` |
| `--color-glass-border` | `rgba(255,255,255,0.28)` | `rgba(255,255,255,0.06)` |

### Brand palette

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--color-brand-teal` | `#0071E3` | `#0A84FF` | Primary actions, links, hover states |
| `--color-brand-pink` | `#FF375F` | `#FF375F` | CTAs, active states, badges, verification |
| `--color-brand-pink-soft` | `#FF6482` | `#FF6482` | Secondary pink, softer accents |
| `--color-brand-mint` | `#34C759` | `#30D158` | Verified badges, success states |

### Shadow & overlay

| Token | Light | Dark |
|---|---|---|
| `--color-shadow-brand` | `rgba(0,113,227,0.18)` | `transparent` |
| `--color-glow-pink` | `rgba(255,55,95,0.0)` | `transparent` |
| `--color-glow-teal` | `rgba(0,113,227,0.0)` | `transparent` |
| `--color-overlay` | `rgba(29,29,31,0.18)` | `rgba(0,0,0,0.45)` |
| `--color-overlay-heavy` | `rgba(29,29,31,0.58)` | `rgba(0,0,0,0.80)` |

### Nav

| Token | Light | Dark |
|---|---|---|
| `--nav-bg` | `rgba(245,245,247,0.88)` | `rgba(13,15,20,0.90)` |

## Typography

- **Sans-serif**: Inter (weights 300, 400, 500, 600, 700). Used for body, UI, navigation, labels.
- **Serif**: Playfair Display (weights 400, 700, italic 400). Used for hero headlines, section titles, editorial emphasis.
- **Body line length**: Capped at 65-75ch via `max-w-md`, `max-w-lg`, `max-w-xl`.
- **Scale**: Large heading steps use 1.25 ratio. Small UI text uses 11-13px with heavy tracking.

### Common font sizes

- Hero H1: `text-5xl` to `text-8xl` (responsive), font-light or font-serif
- Section H2: `text-4xl` to `text-5xl`, font-serif font-bold
- Body: `text-base` to `text-lg`, Inter 300/400
- Labels: `text-[11px]` to `text-[13px]`, `font-bold`, `uppercase`, `tracking-[0.2em]`

## Elevation

- `luxury-shadow`: `box-shadow: 0 40px 100px -20px var(--color-shadow-brand)`
- Theme cards: `border: 1px solid var(--color-border)` with `var(--color-surface-card)` background
- Glass: `backdrop-filter: blur(24px)` with `var(--color-glass-bg)` background

## Components

### Theme card (`.theme-card`)
Background: `var(--color-surface-card)`, border: `1px solid var(--color-border)`. Hover shifts to `var(--color-surface-soft)`.

### Navbar (`.nav-glass`)
Background: `var(--nav-bg)`, `backdrop-filter: blur(20px)`. Fixed top, z-50. Transitions between transparent (top of landing page) and glass (scrolled or on other pages).

### Buttons
- **Primary CTA**: bg-brand-pink, white text, rounded-sm, uppercase, tracking-widest, 13px bold. Hover shifts to brand-teal.
- **Secondary/outline**: border-2, text-brand-teal, uppercase. Hover fills with brand-teal.
- **Round CTA** (trust/graduation sections): bg-brand-pink, rounded-full, white text, 14px+ bold.

### Labels (`.label-caps`)
11px, bold, uppercase, 0.2em tracking.

### Input (`.theme-input`)
Background: `var(--color-surface-soft)`, border: `1px solid var(--color-border)`. Focus: border shifts to brand-teal.

### Verification badge
`friend-badge` class: bg-brand-mint/10, text-brand-mint, border border-brand-mint/30, px-3 py-1.5, rounded-full, 10px bold uppercase.

## Layout

- Max content width: `max-w-7xl` (1280px)
- Horizontal padding: `px-6` on mobile, `px-12` on md+
- Section vertical padding: `py-24` to `py-32`
- Landing page Navbar initial padding: `py-8` (transparent), scrolled: `py-4` (glass)

## Motion

- Standard ease: `[0.22, 1, 0.36, 1]` (ease-out-quart)
- Stagger children: `0.15s`
- Duration: `0.8s` for entry animations, `0.3s` for interaction transitions
- No layout property animations
- No bounce or elastic easings

## Dark mode

- Activated by `data-theme="dark"` attribute on `<html>`
- System preference detected first, then localStorage (`nextbench-theme`)
- Global transition: `background-color 0.35s ease, color 0.35s ease`
- All surface colors invert. Brand-pink stays the same in both themes. Brand-teal shifts from `#0071E3` (light) to `#0A84FF` (dark).
