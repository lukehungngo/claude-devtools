# Brainstorm: Apply Claude DevTools Design System to rebuild UI

**Date:** 2026-04-17
**Input type:** Idea + Constraints
**Input:** Use `Claude DevTools Design System/` to rebuild all UI — no functionality changes, only typography, color, spacing, and layout upgrade.

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| The design system is a superset of the current token set | CONFIRMED | 76 tokens in DS missing from globals.css; all existing tokens present in DS |
| Zero logic changes needed | CONFIRMED | DS has no new hooks, server routes, or data shapes |
| Current codebase already uses correct palette/aesthetic | CONFIRMED | Same warm cream, terracotta, fonts — DS was extracted from this repo |
| All 134 TSX files need to be touched | QUESTIONED | Only ~15-20 have meaningful visual surface area |
| "Rebuild" means full rewrite | QUESTIONED | Delta is smaller than it sounds — 90% of aesthetic already matches |

## Fundamentals

**What the design system adds:**

1. **76 missing CSS tokens** — `--ci-*` (CI state colors), `--resp-*` (response-type colors), `--hud-h: 56px`, `--bg-sel`, `--acc-bg-strong`, `--fs-*`, `--r-*`, `--dur`/`--ease` motion vars
2. **Semantic type class system** — `.t-display`, `.t-metric`, `.t-eyebrow`, `.t-section`, `.t-mono-*`, `.t-code` etc. Currently 71 `text-[Xpx]` literals + 174 `font-mono` ad-hoc calls.
3. **HUD/cockpit layout** — `--hud-h: 56px` (was 40px), flight-deck tile pattern
4. **Response block color language** — `--resp-working/code/tool/dispatch/think/reply` with `-bg` tints
5. **Status dot component** — `.dot.live/.pass/.fail/.wait` with pulse animation
6. **Complete dark theme** — all new semantic tokens covered in dark

**What does NOT change:**
- Backward-compat layer in globals.css keeps all `dt-bg0/text0` Tailwind classes working
- Zero React logic, hooks, props, server calls
- Tailwind config — additions only

## Output

**Worth doing: YES.** Smaller than "rebuild" implies, high ROI.

### Layer 1 — Token foundation (globals.css only)
Replace token block with DS `colors_and_type.css` as foundation. Add 76 missing tokens. Keep backward-compat aliases. Add `.t-*` type classes, `.dot` component, CI badge CSS. Zero TSX changes. Improves dark theme, adds missing colors, enables later layers.

### Layer 2 — HUD/TopBar + Sidebar (~3-5 files)
Apply cockpit pattern: `--hud-h: 56px`, `.t-eyebrow` labels, `.t-metric` for numbers, `.t-display` for big values. Highest visual impact per line changed.

### Layer 3 — Conversation surface: TurnCard + response blocks (~5-8 files)
Apply `--resp-*` tints to tool/think/working blocks. Use `.t-body`, `.t-mono-sm`, `.t-eyebrow` semantically. Replace arbitrary `text-[Xpx]` with design system classes.

### Layer 4 — Sidebar + BottomPanel + remaining surfaces (~5-8 files)
`.t-section` for headings, `.t-label` for form labels, `.t-caption` for metadata, `.dot` status components.

**Risk:** HUD height change (40→56px) shifts fixed-height containers — needs care.

## Next Steps

`/mas:dev-loop implement design system UI upgrade — see docs/brainstorms/2026-04-17-design-system-ui-rebuild.md`
