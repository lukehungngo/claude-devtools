# Brainstorm: UI gap analysis against change.md

**Date:** 2026-04-18
**Input type:** Criteria
**Input:** "this is the change that i expected — i want all behavior and functionality to be preserved, only ui change, so can help me review what's functionality is broken so far and what is the gap with the new ui"

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| All behavior in change.md should already be wired up | QUESTIONED | Profile drawer was never built — it's missing, not regressed |
| "Broken" = regression from working state | QUESTIONED | Distinction matters: broken (was working) vs missing (never built) |
| UI gap = visual difference from spec | CONFIRMED | Confirmed by code audit |
| Data exists for all display requirements | PARTIAL | Tokens/cost tracked; gitOrigin may not be in RepoGroup type |

## Fundamentals

Three categories:

**A — Broken (regression):** Feature was wired up, now silently no-ops.
- Titlebar pills converted to `<button>` elements in T3/T4 but no onClick handlers added. Clicking connection pill, usage pill, or avatar does nothing.

**B — Missing (never built):**
- Profile drawer: entire component absent
- Turn token row (in/out teal/purple per turn card)
- Turn counter in ribbon header
- Git origin + GitHub glyph in sidebar repo rows
- Session cost display in sidebar session meta

**C — Visual gap (correct behavior, wrong look):**
- Pencil icon instead of git-branch glyph in HUD crumb
- Context "of 250K" label disappears when ControlsZone active

## Output

### Broken (wires exist, behavior missing)

| # | Issue | Evidence | Severity |
|---|-------|----------|----------|
| B1 | Connection pill click → no-op | `Titlebar.tsx:82` — button has no onClick | P1 |
| B2 | Usage pill click → no-op | `Titlebar.tsx:143` — button has no onClick | P1 |
| B3 | Avatar click → no-op | `Titlebar.tsx:194` — no onClick handler | P1 |
| B4 | Profile drawer | Does not exist anywhere in codebase | P0 |

### Missing features (never built)

| # | Feature | Spec location | Data available? |
|---|---------|--------------|-----------------|
| M1 | Turn token row: in X (teal) · out X (purple) per turn | Ribbon, per-turn card | Yes — inputTokens/outputTokens in metrics |
| M2 | Turn count + duration in ribbon header ("26 · 3h 12m") | Ribbon header | Yes — turns.length + session duration |
| M3 | Git origin sub-label + GitHub glyph in sidebar repo rows | Sidebar repo row | Partial — gitOrigin may not be in RepoGroup |
| M4 | Session cost in sidebar meta ("T26 · $2.59") | Sidebar session row | Yes — totalCost in session |
| M5 | Agent pills always visible (not gated on hasMultipleAgents) | Ribbon turn card | Cosmetic logic change |

### Visual gaps (present but wrong look)

| # | Gap | Spec says | Code has |
|---|-----|-----------|---------|
| V1 | HUD crumb icon | ⎇ git-branch glyph | Pencil icon |
| V2 | Context tile denominator | "of 250K" always visible | Hidden when ControlsZone active |
| V3 | Ribbon header label | "TURNS" | "TURN HISTORY" |

### What's correct (no action needed)

- Titlebar layout: brand · sep · conn pill · usage pill · spacer · theme · avatar ✓
- Connection pill: transparent bg, border, animated dot, mono text, latency ✓
- Usage pill: grouped button, 4px bar, dual meters, countdown ✓
- HUD: crumb, LIVE status, permission mode, all tiles, In/Out cluster ✓
- Sidebar: collapse/expand, repo rows, session rows, active highlight ✓
- Ribbon: collapse, turn cards (core layout) ✓

## Next Steps

Prioritized by impact:
1. **P0 — Profile drawer** (B4 + B1 + B2 + B3): Build the drawer, wire up onClick handlers
2. **M1 + M2** — Turn token row + ribbon header counter: data exists, just needs rendering
3. **M3 + M4** — Sidebar git origin + session cost: investigate data type, then render
4. **V1 + V2** — Icon + context tile: small visual fixes
