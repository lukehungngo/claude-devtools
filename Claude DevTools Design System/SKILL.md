# Claude DevTools — Design System

Observation-first UI for Claude Code session inspection. Warm terracotta on cream, dense monospace metrics, trace-primary layout. Extracted from `lukehungngo/claude-devtools`.

## Stack

- **Fonts** — DM Sans (UI), JetBrains Mono (all numerals, code, HUD)
- **Core file** — `colors_and_type.css` (single import, both themes)
- **Theme switch** — toggle `[data-theme="light"|"dark"]` on `<html>`

## Use

```html
<link rel="stylesheet" href="colors_and_type.css">
```

Then compose with tokens (never hardcode):

```html
<div style="background:var(--bg-e);border:1px solid var(--bd);border-radius:var(--r-md);">
  <span class="t-eyebrow">Context</span>
  <span class="t-display" style="color:var(--amb)">67%</span>
</div>
```

## Tokens

### Surfaces (ramp)
`--bg` → `--bg-s` (sunk) → `--bg-h` (hover) → `--bg-e` (elevated card) → `--bg-sel` (accent-tinted selection). Border: `--bd` default, `--bd-s` strong.

### Text
`--t1` primary · `--t2` secondary · `--t3` tertiary/labels · `--t4` quietest.

### Accent — terracotta
`--acc` (fill) · `--acc-h` (hover) · `--acc-bg` / `--acc-bg-strong` (tints) · `--acc-glow` (shadow).

### Semantic
`--grn` pass · `--amb` wait/cost · `--red` fail/yolo · `--teal` info/tokens-in · `--pur` tokens-out · `--sky` neutral-info. Each has a `-bg` tint.

### CI states
`--ci-pass` · `--ci-fail` · `--ci-wait` · `--ci-run` · `--ci-skip` · `--ci-deny` (magenta, for policy blocks).

### Agent spans (DAG / Gantt fills)
`--span-pm` · `--span-swe` · `--span-swe2` · `--span-qa` · `--span-doc` · `--span-bug` · `--span-rev`. Each has a matching `-t` text color — ALWAYS pair them.

### Radii
`--r-xs 3` · `--r-sm 5` · `--r 8` · `--r-md 10` · `--r-lg 12` · `--r-xl 16` · `--r-pill`.

### Shadows
`--shadow-xs/sm/md/lg` + `--shadow-glow` (accent emphasis).

### Layout
`--titlebar-h 38` · `--hud-h 56` · `--trace-h 88` · `--sidebar-w 220` · `--ribbon-w 260`.

## Type roles (semantic classes)

| Class | Use |
|---|---|
| `.t-display` | Cockpit big numbers — `67%`, `$76.62` (mono, tnum) |
| `.t-h1` / `.t-h2` | Page / card headings |
| `.t-title` | Card title (13/18 med) |
| `.t-body` | Prose (13/1.65) |
| `.t-label` | Form labels, HUD rows |
| `.t-caption` | 10/14 secondary meta |
| `.t-eyebrow` | 8px UPPERCASE tile labels |
| `.t-section` | 10px UPPERCASE sidebar headings |
| `.t-metric` | HUD metric value (14 mono) |
| `.t-mono` / `.t-mono-sm` / `.t-mono-xs` | Dense mono scale |
| `.t-code` | Inline code chip |

## Patterns & rules

- **Metrics are loud, prose is humble.** Numerals use `font-feature-settings: "tnum","zero"` — never mix sans and mono in a metric row.
- **Tint numerals by role**: teal=in, purple=out, amber=cost, grey=neutral. Cost is ALWAYS amber.
- **Status dot** — `.dot` + `.dot.live/.run/.pass/.fail/.wait/.idle/.deny`. Running dots pulse; idle dots don't.
- **Permission modes** — pill with the mode's semantic tint: Default→grey, Accept-Edits→amber, Plan→teal, Auto→green, YOLO→red.
- **Turn cards** — left 2px accent border when active; grey when idle. Sparkline + cost (amber) + duration (mono-xs).
- **Trace strip** — sits DIRECTLY below the HUD, above conversation. Agent fills use `--span-*` pairs with matching text color.
- **Focus ring** — `box-shadow: var(--ring)` (2px bg + 2px accent offset).
- **Motion** — `var(--ease)`, `--dur-fast 120` / `--dur 200` / `--dur-slow 350`. Respect `prefers-reduced-motion`.

## Don't

- Don't add gradients or decorative blurs — this is instrumentation, not marketing.
- Don't use emoji.
- Don't invent colors outside tokens. If a chart needs extras, extend `--span-*`.
- Don't use sans-serif for numerals ever.
- Don't pad HUD tiles past `--hud-h 56` — dev-density matters.

## File map

- `colors_and_type.css` — tokens + type roles + base resets
- `preview/colors-*.html` — palette cards
- `preview/type-*.html` — typography specimens
- `preview/spacing-radii.html`, `preview/shadows.html` — geometry
- `preview/hud-cockpit.html`, `preview/trace-strip.html`, `preview/turn-ribbon-card.html`, `preview/ci-badges.html`, `preview/permission-modes.html`, `preview/buttons.html`, `preview/composer.html` — component specimens
- `ui_kits/dashboard.html` — full composed screen (titlebar · sidebar · ribbon · HUD · trace · conversation · composer)
