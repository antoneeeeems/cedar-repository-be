---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
  - "**/*.css"
  - "**/*.scss"
  - "**/*.html"
  - "**/components/**"
  - "**/pages/**"
  - "**/views/**"
  - "**/layouts/**"
  - "**/styles/**"
---

# Frontend

## Design Tokens

CEDAR tokens live in `tailwind.config.ts` and `src/styles/globals.css`. Never hardcode raw values. Use semantic Tailwind tokens (`primary`, `secondary`, `muted`, `border`) and approved brand aliases (`coe-orange`, `coe-secondary`, `navy`, `grey`). See `CLAUDE.md` §2.2 for the full palette rules.

- `coe-orange` = primary CTAs and brand identity
- `coe-secondary` = navigational/informational accents (tabs, pagination, secondary buttons)
- Never hardcode `#D35E22` or `#039DD0` — use the token classes

## Design Direction

CEDAR is an **institutional academic repository** — trustworthy, content-dense, high contrast. Avoid decorative principles (glassmorphism, neumorphism, claymorphism, aurora gradients). Preserve the existing card/table/admin-shell rhythm; don't invent parallel patterns.

## Stack (in use)

| Category | CEDAR uses |
|---|---|
| CSS | Tailwind v4 (`@tailwindcss/postcss`) |
| Primitives | shadcn/ui on Radix (`src/components/ui/*`) |
| Charts | Recharts |
| Icons | Lucide (`lucide-react`) |
| Dates | `date-fns` + `react-day-picker` |
| Tables/export | `jspdf`, `jspdf-autotable`, `xlsx` |

Do not mix in competing libraries (no Framer Motion, no Chakra, no Heroicons). Reuse `src/components/ui/*` primitives and domain components under `src/components/public/**` and `src/components/admin/**` before writing new markup.

## Layout

- CSS Grid for 2D, Flexbox for 1D. Use `gap`, not margin hacks.
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`.
- Mobile-first. Touch targets: minimum 44x44px.

## Accessibility (non-negotiable)

- All interactive elements keyboard-accessible.
- Images: meaningful `alt` text. Decorative: `alt=""`.
- Form inputs: associated `<label>` or `aria-label`.
- Contrast: 4.5:1 normal text, 3:1 large text.
- Visible focus indicators. Never `outline: none` without replacement.
- Color never the sole indicator.
- `aria-live` for dynamic content. Respect `prefers-reduced-motion` and `prefers-color-scheme`.

## Performance

- Images: `loading="lazy"` below fold, explicit `width`/`height`.
- Fonts: `font-display: swap`.
- Animations: `transform` and `opacity` only.
- Large lists: virtualize at 100+ items.
- Bundle size: never import a whole library for one function.
