# Phase 6 — Running-row animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GPU-only animation to Agent Graph rows when `status === "active"` — a 2px pulsing stripe on the row's left edge + a sweeping highlight across the timeline bar.

**Architecture:** Two CSS-only modifier classes (`trace-row-active`, `trace-bar-active`) driven by the existing `isActive` boolean in `TraceTab.tsx`. No new React state, no new tokens, no JS animation. Reduced-motion handled by the global override at `globals.css:1392`.

**Tech Stack:** React 18, plain CSS (custom keyframes via `globals.css`), Vitest + Testing Library.

**Spec:** `docs/specs/phase-6-running-row-animation.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `dashboard/src/styles/globals.css` | Modify | Add 2 keyframes + 2 selector blocks at the trace-* section |
| `dashboard/src/components/bottom-panel/TraceTab.tsx` | Modify (2 lines) | Append `trace-row-active` / `trace-bar-active` modifier classes when `isActive` |
| `dashboard/src/components/bottom-panel/TraceTab.activeRow.test.tsx` | Create | Assert classes applied/removed by status; assert reduced-motion safe (class presence only) |

---

## Task 1: Add keyframes + CSS classes to globals.css

**Files:**
- Modify: `dashboard/src/styles/globals.css` (insert after line ~1230 in the `.trace-bar-running` block)

- [ ] **Step 1.1: Locate the insertion point**

Run: `grep -n "trace-bar-running" /Users/soh/working/ai/claude-devtools/dashboard/src/styles/globals.css | head -3`

Expected: 1 result around line 1230. We will insert immediately AFTER its closing brace.

- [ ] **Step 1.2: Insert the keyframes + selectors**

Append these blocks to `dashboard/src/styles/globals.css` right after the `.trace-bar-running` rule block ends:

```css
/* ── Running-row animation (Phase 6) ──────────────────────────────
   - 2px accent stripe on row's left edge, breathes opacity 1.0 ↔ 0.45
   - Sweep highlight across the timeline bar
   Both kick in when row's status is "active". GPU-only (transform/opacity).
   prefers-reduced-motion: reduce already neutralizes via globals.css:1392.
   ────────────────────────────────────────────────────────────────── */

.trace-row-active {
  position: relative;
}
.trace-row-active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--acc);
  pointer-events: none;
  animation: trace-row-active-pulse 2s ease-in-out infinite;
}
@keyframes trace-row-active-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}

.trace-bar-active {
  position: relative;
  overflow: hidden;
}
.trace-bar-active::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 30%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.18) 50%,
    transparent 100%
  );
  pointer-events: none;
  animation: trace-bar-sweep 1.8s ease-in-out infinite;
  z-index: 0;
}
@keyframes trace-bar-sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

- [ ] **Step 1.3: Verify build still parses CSS**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && npx tsc --noEmit 2>&1 | head -5`

Expected: no output (tsc doesn't lint CSS, but if a JSX import broke the build it would show here).

Run: `grep -c "trace-row-active-pulse\|trace-bar-sweep" /Users/soh/working/ai/claude-devtools/dashboard/src/styles/globals.css`

Expected: `4` (each keyframe appears once as definition + once as `animation:` consumer).

- [ ] **Step 1.4: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/styles/globals.css
git commit -m "feat(trace): add running-row animation keyframes + classes (Phase 6)"
```

---

## Task 2: Wire modifier classes in TraceTab.tsx

**Files:**
- Modify: `dashboard/src/components/bottom-panel/TraceTab.tsx` (around line 388 for row class, line 421 for bar class)

- [ ] **Step 2.1: Find current row className build site**

Run: `grep -n 'rowClass = ' /Users/soh/working/ai/claude-devtools/dashboard/src/components/bottom-panel/TraceTab.tsx`

Expected output: one match around line 388 reading:
```
const rowClass = `trace-row${isToolCall ? " trace-row-tool" : ""}${selected ? " trace-row-selected" : ""}`;
```

- [ ] **Step 2.2: Append `trace-row-active` modifier**

Replace the line found in 2.1 with:

```ts
const rowClass = `trace-row${isToolCall ? " trace-row-tool" : ""}${selected ? " trace-row-selected" : ""}${isActive ? " trace-row-active" : ""}`;
```

- [ ] **Step 2.3: Find the trace-bar element**

Run: `grep -n 'className="trace-bar"' /Users/soh/working/ai/claude-devtools/dashboard/src/components/bottom-panel/TraceTab.tsx`

Expected: one match around line 421.

- [ ] **Step 2.4: Append `trace-bar-active` modifier**

Replace:

```tsx
className="trace-bar"
```

with:

```tsx
className={`trace-bar${isActive ? " trace-bar-active" : ""}`}
```

- [ ] **Step 2.5: Typecheck**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && npx tsc --noEmit 2>&1 | head -10`

Expected: no output, no errors mentioning `TraceTab.tsx`.

- [ ] **Step 2.6: Commit (don't run tests yet — tests next)**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/components/bottom-panel/TraceTab.tsx
git commit -m "feat(trace): toggle trace-row-active / trace-bar-active on isActive"
```

---

## Task 3: Add unit test for class toggling

**Files:**
- Create: `dashboard/src/components/bottom-panel/TraceTab.activeRow.test.tsx`

- [ ] **Step 3.1: Write the failing test**

Create `/Users/soh/working/ai/claude-devtools/dashboard/src/components/bottom-panel/TraceTab.activeRow.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TraceTab } from "./TraceTab";
import type { AgentDAG, AgentNode } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

afterEach(() => cleanup());

function node(overrides: Partial<AgentNode>): AgentNode {
  return {
    id: "n1",
    type: "engineer",
    description: "subagent",
    parentId: "main",
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
    },
    toolCalls: 0,
    mcpToolCalls: 0,
    status: "completed",
    startTime: "2026-05-16T10:00:00Z",
    endTime: "2026-05-16T10:05:00Z",
    ...overrides,
  };
}

function dag(...nodes: AgentNode[]): AgentDAG {
  return {
    nodes: [
      node({ id: "main", type: "main", parentId: undefined, status: "completed" }),
      ...nodes,
    ],
    edges: nodes.map((n) => ({ source: "main", target: n.id })),
  };
}

const turns: TurnSnapshot[] = [];

describe("TraceTab — running-row animation classes (Phase 6)", () => {
  it("active node adds trace-row-active + trace-bar-active classes", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "a1", status: "active", endTime: undefined }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={true}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    // Main is always first; a1 is second
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const a1Row = rows[1];
    expect(a1Row.className).toContain("trace-row-active");
    const a1Bar = a1Row.querySelector(".trace-bar");
    expect(a1Bar).not.toBeNull();
    expect(a1Bar!.className).toContain("trace-bar-active");
  });

  it("completed node has neither active class", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "c1", status: "completed" }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={false}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    const c1Row = rows[1];
    expect(c1Row.className).not.toContain("trace-row-active");
    const c1Bar = c1Row.querySelector(".trace-bar");
    expect(c1Bar!.className).not.toContain("trace-bar-active");
  });

  it("error node has neither active class", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "e1", status: "error" }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={false}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    const e1Row = rows[1];
    expect(e1Row.className).not.toContain("trace-row-active");
    const e1Bar = e1Row.querySelector(".trace-bar");
    expect(e1Bar!.className).not.toContain("trace-bar-active");
  });

  it("active + selected coexist on the same row", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "s1", status: "active", endTime: undefined }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent="s1"
        isLive={true}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    const s1Row = rows[1];
    expect(s1Row.className).toContain("trace-row-active");
    expect(s1Row.className).toContain("trace-row-selected");
  });
});
```

- [ ] **Step 3.2: Run test, expect PASS**

The test expects classes that Task 2 already wired. Running it should succeed.

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && npx vitest run src/components/bottom-panel/TraceTab.activeRow.test.tsx 2>&1 | tail -10`

Expected: `Test Files  1 passed (1)` · `Tests  4 passed (4)`.

If any test fails: re-read Task 2 to verify the class strings match exactly (`trace-row-active`, `trace-bar-active`).

- [ ] **Step 3.3: Run the full TraceTab suite to catch regressions**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && npx vitest run src/components/bottom-panel/TraceTab 2>&1 | tail -8`

Expected: every existing TraceTab test still passes; new file's 4 tests pass.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools
git add dashboard/src/components/bottom-panel/TraceTab.activeRow.test.tsx
git commit -m "test(trace): assert running-row animation classes by status (Phase 6)"
```

---

## Task 4: Visual smoke + full test sweep

- [ ] **Step 4.1: Run full dashboard test suite**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && npx vitest run 2>&1 | tail -6`

Expected: 0 failed tests across the dashboard suite. Compare the total count to the count before this phase (1605 baseline + 4 new = 1609; allow for other agents' adds).

- [ ] **Step 4.2: Run dashboard typecheck**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && npx tsc --noEmit 2>&1 | grep -E "TraceTab|globals" | head`

Expected: no output.

- [ ] **Step 4.3: Browser visual check (manual — narrate observations)**

Start dev server: `cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm dev` (already running is fine).

Open the dashboard at `http://localhost:3142/` and pick a session with at least one active Agent dispatch. Verify the following with the eye (and report findings, but do not block the plan on subjective taste):

| Check | Pass criterion |
|---|---|
| Active row shows 2px terracotta stripe on left edge | ✅ stripe visible |
| Stripe breathes (opacity oscillates) | ✅ ~2s cycle, smooth |
| Active row's timeline bar shows a sweeping highlight | ✅ ~1.8s cycle, left → right |
| Completed/error rows have neither | ✅ static |
| Row height/width does not change when active class toggles | ✅ no layout shift |
| In macOS System Settings → Accessibility → Display → "Reduce Motion" ON, the animation freezes | ✅ static after toggle |

- [ ] **Step 4.4: Performance check (DevTools)**

Open Chrome DevTools → Performance → Record 5s with an active row in view → Stop.

Verify:
- No long tasks > 50ms attributable to the trace area
- Animation entries marked "Composite Layers" (not "Layout" or "Paint" on the row geometry)

Expected: only compositor-thread work — `transform` and `opacity` animations are GPU-accelerated.

- [ ] **Step 4.5: Commit (only if any docs updated; otherwise skip)**

No code changes expected here. If any spec/plan docs are updated, commit them:

```bash
cd /Users/soh/working/ai/claude-devtools
git add docs/specs/phase-6-running-row-animation.md docs/plans/phase-6-impl-plan.md
git commit -m "docs(phase-6): mark loop steps complete"
```

---

## Task 5: Final push

- [ ] **Step 5.1: Push to remote**

Run: `cd /Users/soh/working/ai/claude-devtools && git push 2>&1 | tail -5`

Expected: 3 new commits pushed to master (`feat(trace): add running-row animation keyframes`, `feat(trace): toggle trace-row-active / trace-bar-active on isActive`, `test(trace): assert running-row animation classes by status`).

- [ ] **Step 5.2: Update SHIPPED summary (optional)**

If `docs/plans/SESSION-SHIPPED.md` exists, append a "Phase 6 — Running-row animation" entry with the test count delta and a one-line description.

---

## Self-Review Checklist

**Spec coverage (vs `docs/specs/phase-6-running-row-animation.md`):**

| Spec section | Task |
|---|---|
| 6.1 row left-edge stripe pulse | Task 1.2 |
| 6.2 bar sweep highlight | Task 1.2 |
| 6.3 wire classes in TraceTab | Task 2 |
| AC: visual stripe + breathing | Task 4.3 |
| AC: visual bar sweep | Task 4.3 |
| AC: inactive has neither | Task 3 (Step 3.1 second & third tests) |
| AC: no layout shift | Task 4.3 (row 5), Task 4.4 |
| AC: reduced-motion respected | Task 4.3 (row 6) — relies on global override |
| AC: compositor-only paints | Task 4.4 |
| AC: unit test for class toggling | Task 3 |

**Type consistency:** `isActive`, `trace-row-active`, `trace-bar-active`, `trace-row-active-pulse`, `trace-bar-sweep` are spelled identically across spec, CSS, TSX, and tests.

**Placeholder scan:** none.

---

## Loop status

- [x] Step 1: Spec drafted → `docs/specs/phase-6-running-row-animation.md`
- [x] Step 2: ui-ux-pro-max §7 review applied
- [x] Step 3: Implementation plan (this file)
- [ ] Step 4: Execute (Task 1 → 5)
- [ ] Step 5: Gap review
