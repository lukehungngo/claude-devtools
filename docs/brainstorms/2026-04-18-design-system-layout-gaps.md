# Brainstorm: Design System UI Gap Analysis

**Date:** 2026-04-18
**Input type:** Criteria
**Input:** Compare current dashboard against dashboard.html spec + preview component files; identify gaps

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Token/typography pass was starting point, not finish line | CONFIRMED | User explicitly says "not enough" |
| dashboard.html is authoritative layout reference | CONFIRMED | User references it directly |
| preview/ files are component specs | CONFIRMED | 15 component previews verified |
| Functionality must stay identical (no behavior changes) | CONFIRMED | Prior constraint |

## Fundamentals

dashboard.html defines 8 distinct structural zones. preview/ defines 15 component specs.
Scanned both against current React codebase.

## Output: Gap Matrix

### GAP 1 — Missing tokens in globals.css (26 tokens)
- resp-code/dispatch/final + their -bg variants (6)
- span-pm/swe/swe2/qa/doc/bug/rev × bg+text (14)
- spark-base/fill/grid (3)
- titlebar-h/ribbon-w/trace-h layout tokens (3)

### GAP 2 — Missing CSS component classes
- .rblock system (working/code/tool/dispatch/think/reply/final)
- .btn base + variants (primary/ghost/sm/danger)
- .pill agent span pill
- .badge CI badge

### GAP 3 — Titlebar (MAJOR)
Spec: Brand + connection pill (dot + label + latency) + usage meters (5h/7d bars + pct + reset timer) + avatar (gradient circle + status dot)
Current: Brand + center text + theme toggle
Missing: connection pill, usage meters, avatar button

### GAP 4 — HUD/TopBar (PARTIAL)
Spec: crumb (repo@branch) + metric tiles + context bar fill
Current: metric tiles only
Missing: crumb breadcrumb, context bar fill visualization

### GAP 5 — Conversation layout (MAJOR)
Spec: chat bubble pattern — user right-aligned bubble (acc-bg), Claude full-width transparent
Current: avatar-side layout (U/C 28px circles + content right)
Fundamentally different visual structure

### GAP 6 — Response block pattern (MAJOR STRUCTURAL)
Spec: unified .rblock system — 3px left border + ic badge + lbl + peek text + collapsible
Current: bespoke React components (ThinkingBlock, NarrationGroup, ToolCallBlock, etc.)
Missing: peek text, icon badge, unified border coloring system

### GAP 7 — Turn Ribbon visual (PARTIAL)
Spec: span type pills (pm/swe/qa/doc), sparkline bars (6 mini bars), cost+duration+token in/out
Current: TurnHistoryPanel exists but missing pills and sparklines

### GAP 8 — Bottom trace Gantt (MISSING)
Spec: Gantt column grid (AGENT | NAME | MODEL | DURATION | COST | TIMELINE with bars)
Current: DAG only, Gantt absent entirely

## Priority Stack

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| P0 | GAP 1: 26 missing tokens | XS | Unlocks all gaps |
| P0 | GAP 2: .rblock/.btn/.pill/.badge CSS | S | Foundation |
| P1 | GAP 3: Titlebar connection+usage+avatar | M | Most visible |
| P1 | GAP 5: Conversation bubble layout | L | Core identity |
| P1 | GAP 6: Response block unification | L | Structural |
| P2 | GAP 4: HUD crumb + context bar | S | Low risk |
| P2 | GAP 7: Turn Ribbon pills + sparklines | M | Panel exists |
| P3 | GAP 8: Bottom trace Gantt | L | New feature |

## Next Steps

/mas:dev-loop implement design system layout gaps — see docs/brainstorms/2026-04-18-design-system-layout-gaps.md
