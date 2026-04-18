# Brainstorm: Titlebar Visual Gaps vs. Target Design

**Date:** 2026-04-18
**Input type:** Criteria (screenshot vs. dashboard.html design spec + user-reported bugs)
**Input:** Current Titlebar doesn't match the design system spec. User also reports: usage values wrong, countdown to reset missing, model not showing.

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Target design is `.tb-conn` and `.tb-usage` CSS in `dashboard.html` | CONFIRMED | Lines 27–80, HTML body lines 985–1016 |
| `utilization` is stored as 0–100 integer | CONFIRMED | `clampUtilization()` in `usage-client.ts:157-160` does `Math.round(val)` clamped 0–100 |
| `Titlebar.tsx` multiplies utilization × 100 (double-counts) | CONFIRMED | Line 21: `Math.round(usage.fiveHour.utilization * 100)` → 34 × 100 = 3400 |
| Reset time is an ISO timestamp string | CONFIRMED | `UsageInfo.fiveHour.resetsAt: string | null` |
| Model/plan display belongs in profile drawer (opened by avatar button) | CONFIRMED | `dashboard.html` line 1059–1063 shows plan card in drawer, not in Titlebar bar |
| Avatar button currently has no onClick — drawer not implemented | CONFIRMED | `Titlebar.tsx:118` — `div` with `role="button"` but no handler |

---

## Gap List

### BUG 1 — Usage values 34× too high (P0 data correctness)

**Root cause confirmed:** `clampUtilization()` returns 0–100 (it's already a percentage). `Titlebar.tsx` multiplies by 100 again.

```ts
// server: clampUtilization → returns e.g. 34 (meaning 34%)
// Titlebar.tsx line 21:
const sessionPct = Math.round(usage.fiveHour.utilization * 100);  // 34 * 100 = 3400 ❌
```

**Fix:**
```ts
const sessionPct = usage?.fiveHour.utilization ?? null;   // 34 → shows 34% ✓
const ratePct    = usage?.sevenDay.utilization ?? null;
```

---

### BUG 2 — Countdown to reset time missing from inline render (P1)

**Target** (`dashboard.html` line 1002): `<span class="trst">4h 11m</span>` — live countdown next to percentage in the pill.

**Current:** `resetsAt` is only used as a `title` tooltip. Never rendered visibly.

**Fix:** Compute `formatTimeUntil(resetsAt)` → `"4h 11m"` / `"6d 8h"` and render inline. Update every minute.

---

### BUG 3 — Plan name + model not visible after sidebar removal (P1)

**Context:** The old `RepoList` sidebar showed plan name (e.g., "MAX") in the CONNECTION section. That was removed in the UI revamp. The target design places plan+model in the **profile drawer** (opened by avatar button, `dashboard.html` lines 1059–1063):

```html
<div class="plan-card">
  <div class="pbadge">MAX</div>
  <div class="pinfo">
    <div class="pn">Max plan <span class="tag">5× usage</span></div>
    <div class="pm">sonnet-4-6 · opus-4 · haiku-4-5</div>
  </div>
```

**Current:** Avatar button in `Titlebar.tsx` is a non-functional `div` with `role="button"` and no `onClick`. The profile drawer does not exist. `usage.planName` ("MAX"/"Pro") is received but never rendered.

**Fix (scope-bounded):** Show `planName` as a small badge next to the usage pill in the Titlebar — e.g., `MAX` mono label. Full drawer implementation is a larger feature. For now, expose `planName` so it's not silently dropped.

---

### GAP 4 — Connection pill: colored bg → transparent + border (P1 visual)

**Target:** `background: transparent; border: 1px solid var(--bd); border-radius: var(--r); height: 24px; cursor: pointer`
**Current:** `background: var(--grn-bg)`, `borderRadius: 10` hardcoded, no border, no height

---

### GAP 5 — Connection text: green → var(--t1)/var(--t3) (P1 visual)

**Target:** Label `.clbl` → `color: var(--t1); font-weight: 600`; Latency `.clat` → `color: var(--t3)`; both `font-family: var(--font-mono)`
**Current:** Both spans are `color: var(--grn)` — wrong, should be calm not green

---

### GAP 6 — Usage meters: two floating divs → one grouped pill with separator (P1 visual)

**Target:** ONE `.tb-usage` container (`border: 1px solid var(--bd); background: transparent; height: 24px`) with a `.tu-sep` vertical divider (1px × 12px) between 5h and 7d
**Current:** Two independent `UsageMeter` floating components with no container border

---

### GAP 7 — Usage bar: wrong height + missing track border (P2 visual)

**Target:** `height: 4px; background: var(--bg-e); border: 1px solid var(--bd)` on the track
**Current:** `height: 3px; background: var(--bd)` — no border, uses border color as track bg

---

### GAP 8 — Usage %: accent color → var(--t1) bold (P2 visual)

**Target:** `.tpct { color: var(--t1); font-weight: 600 }` — always neutral
**Current:** `color` inherits fill color (green/amber/red)

---

### GAP 9 — Connection dot: no ring, no pulse animation (P2 visual)

**Target:** `box-shadow: 0 0 0 2px var(--grn-bg)` + `tbcpulse` animation (2.2s ease-in-out infinite)
**Current:** Plain circle, no shadow, no animation

---

### GAP 10 — Missing `tb-sep` divider between brand and pill (P3 visual)

**Target:** `<div class="tb-sep">` — 1px × 18px `var(--bd)` line
**Current:** Only Tailwind `gap-2`, no visual separator

---

## Priority Matrix

| # | Type | Gap | Priority |
|---|------|-----|----------|
| 1 | BUG | Usage values 34× too high (3400%) | **P0** |
| 2 | BUG | Countdown to reset time not rendering | **P1** |
| 3 | BUG | planName not displayed (lost from sidebar removal) | **P1** |
| 4 | Visual | Connection pill: colored bg → transparent + border | **P1** |
| 5 | Visual | Connection text: green → var(--t1)/var(--t3) | **P1** |
| 6 | Visual | Usage meters: grouped pill with separator | **P1** |
| 7 | Visual | Bar: 4px + border on track | **P2** |
| 8 | Visual | % color → var(--t1) bold | **P2** |
| 9 | Visual | Dot: ring + pulse animation | **P2** |
| 10 | Visual | tb-sep divider | **P3** |

## Task Map (for plan)

| Task | Gaps | Files |
|------|------|-------|
| T1 | BUG 1: fix utilization × 100 | `Titlebar.tsx` |
| T2 | BUG 2: countdown rendering + BUG 3: planName badge | `Titlebar.tsx` |
| T3 | GAP 4+5+9: connection pill redesign (transparent + border + animation) | `Titlebar.tsx` |
| T4 | GAP 6+7+8: usage pill redesign (grouped + bar + % color) | `Titlebar.tsx` |
| T5 | GAP 10: tb-sep divider | `Titlebar.tsx` |

T1 is P0 — fix first, independent. T2–T5 are visual only.

## Next Steps

```
/mas:dev-loop --auto fix titlebar data bugs and visual gaps — see docs/brainstorms/2026-04-18-titlebar-visual-gaps.md
```
