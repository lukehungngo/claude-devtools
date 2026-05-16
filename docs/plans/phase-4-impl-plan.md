# Phase 4 Implementation Plan

**Spec:** `docs/specs/phase-4-visual-rebuild.md` (Step 2 approved with REVISE → fixes applied)
**Status:** ready · **Blocked on:** Phase 1, Phase 2, Phase 3, Stop-Agent API, other agent on repo

---

## Pre-flight

```bash
cd /Users/soh/working/ai/claude-devtools
git status
git log -5 --oneline
# Verify all of:
# - Phase 1 merged (search for `findToolResultForId` in agentStatus.ts)
# - Phase 2 merged (search for `--sp-*` in globals.css)
# - Phase 3 merged (search for `synthetic:agent:` in lib/agentIds.ts)
# - Stop-agent API merged OR feature flag in place
```

If any prereq missing, STOP.

---

## Tasks (component-first → wiring → tests)

### T1 — Stop-agent API decision

Run:
```bash
grep -rn "POST /api/agents" server/src
grep -rn "stopAgent\|abortAgent" server/src
```

**If endpoint exists:** proceed with full keyboard hint row.
**If not:** add `dashboard/src/lib/featureFlags.ts` entry `BOTTOM_PANEL_KEYBOARD_HINTS = false`. File a separate "Stop-Agent API" ticket in `docs/plans/ux-backlog.md`. Hint row hidden in Phase 4.

Acceptance: explicit decision recorded in the PR description.

### T2 — `BackgroundAgentGroup` component (skeleton)

**File:** `dashboard/src/components/conversation/BackgroundAgentGroup.tsx` (new)

Props:
```ts
interface BackgroundAgentGroupProps {
  turn: TurnSnapshot;
  events: SessionEvent[];
  dagNodes: AgentNode[];  // from server DAG
}
```

Internal data merge:
- Read `turn.syntheticAgentDispatch` (Phase 3 output)
- Read `dagNodes` filtered to this turn's dispatched agents
- Build union keyed by `tool_use.id` (or synthetic agentId)
- Compute per-agent status via `isAgentCompleted` (Phase 3 extended this for synthetic)

Render:
- `<details class="agroup running">` if any agent has status="running", else just `<details class="agroup">`
- Header: `Background agents ×N` + status pills + group summary
- Body: one `<BackgroundAgentRow>` per agent

Acceptance: component renders with mock data (no integration yet).

### T3 — `BackgroundAgentRow` component

**File:** `dashboard/src/components/conversation/BackgroundAgentRow.tsx` (new)

Props:
```ts
interface BackgroundAgentRowProps {
  agentId: string;         // synthetic or real
  toolUseId: string;
  description: string;     // from Agent.input.description
  subagentType?: string;
  spawnedAt: string;
  endedAt: string | null;
  status: "running" | "completed" | "error";
  isSynthetic: boolean;
  // For real agents only:
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
  toolsUsed?: { Read: number; Edit: number; Bash: number };
  // For synthetic agents:
  returnText?: string;     // from tool_result.content[0].text
}
```

Render:
- Status pill: `running` / `done` / `failed` with appropriate token classes
- Task ID + description (truncated)
- Duration: live ticker if running, static otherwise
- Token cells: render number if real, `—` if synthetic
- Expanded body: Prompt / Live activity (running only) / Return (done only) / Meta

Acceptance: row renders correctly for synthetic and real test fixtures.

### T4 — Live duration ticker hook

**File:** `dashboard/src/hooks/useLiveDuration.ts` (new)

```ts
export function useLiveDuration(
  spawnedAt: string | null,
  endedAt: string | null,
  isLive: boolean
): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isLive || endedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive, endedAt]);
  if (!spawnedAt) return "—";
  const end = endedAt ? new Date(endedAt).getTime() : now;
  const ms = end - new Date(spawnedAt).getTime();
  return formatDuration(ms);
}
```

Acceptance: ticker updates every 1s for running, freezes on completion.

### T5 — Wire BackgroundAgentGroup into TurnCard

**File:** `dashboard/src/components/conversation/TurnCard.tsx`

Locate the section where dispatch tools are rendered today. Replace with:
```tsx
{turn.syntheticAgentDispatch?.size > 0 || hasRealDispatchInTurn(turn) ? (
  <BackgroundAgentGroup turn={turn} events={turnEvents} dagNodes={dagNodes} />
) : null}
```

Audit and remove any old AgentCard rendering for `name === "Agent"` tool_use entries to avoid double-render.

Acceptance: turn with subagent dispatches shows new component; existing tests still pass (snapshot may need refresh).

### T6 — Rewrite TraceTab.tsx

**File:** `dashboard/src/components/bottom-panel/TraceTab.tsx`

Per spec section B. Key changes:
- Add grid columns: `[caret] [Agent] [Model] [Duration] [Cost] [Timeline]`
- Header row with time-axis ticks (auto-scaled)
- Per-row: badge, name (with live-dot if running), model, duration, cost, timeline bar
- Bar with token overlay
- Running bar gets `.bar.run` class
- Focused-row state via existing `selectedAgent` from LayoutContext

Synthetic agents render `—` in Cost / Token columns.

Acceptance: visually matches design `dashboard.html:2034-2121`.

### T7 — Wire tab badge + scope pill in BottomPanel

**File:** `dashboard/src/components/bottom-panel/BottomPanel.tsx`

For each tab in `TABS`, allow a `count?: number`. For Agent Graph:
```ts
{ id: "agent-graph", label: "Agent Graph", count: dagNodeCount }
```

Render badge if `count > 0`. Cap at 99+. Width budget: 28px.

Scope pill: render `Scoped to T{viewingTurnNumber}` right-aligned in tab bar when `viewingTurnNumber !== undefined`.

Acceptance: badge + scope pill render correctly across themes.

### T8 — Keyboard hint row

**File:** `dashboard/src/components/bottom-panel/TraceTab.tsx`

```tsx
{!collapsed && BOTTOM_PANEL_KEYBOARD_HINTS && (
  <div className="bghint-row">
    <span><kbd>Enter</kbd>view</span>
    {stopAgentApiAvailable && <span><kbd>x</kbd>stop</span>}
    {stopAgentApiAvailable && <span><kbd>ctrl+x</kbd><kbd>ctrl+k</kbd>stop all</span>}
    <span><kbd>↑</kbd><kbd>↓</kbd>navigate</span>
    <span className="right">Focused: <b>{focused?.label}</b> · {focused?.model} · spawned {focused?.spawnedAt}</span>
  </div>
)}
```

If T1 found no stop API: `stopAgentApiAvailable = false`, the two `x` hints are hidden — but the row itself is also hidden via the feature flag per spec ("partial-hint shipping rejected").

Acceptance: row only renders when flag enabled AND panel expanded.

### T9 — Keyboard handlers

**File:** `dashboard/src/components/bottom-panel/TraceTab.tsx`

```ts
useEffect(() => {
  function handleKey(e: KeyboardEvent) {
    if (!hasFocus) return;
    if (e.key === "ArrowDown") moveFocus(1);
    if (e.key === "ArrowUp") moveFocus(-1);
    if (e.key === "Enter") openInConversation(focused);
    if (e.key === "x" && stopAgentApiAvailable) stopAgent(focused);
    // Ctrl+X Ctrl+K is a chord — track state
  }
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, [hasFocus, focused, stopAgentApiAvailable]);
```

Acceptance: arrow keys move focus, Enter opens conversation, x stops (when enabled).

### T10 — Tests

Create:
- `BackgroundAgentGroup.test.tsx` — synthetic-only / mixed / running pill / live duration / done state / error state
- `BackgroundAgentRow.test.tsx` — `—` for synthetic tokens, ticker behavior
- `TraceTab.synthetic.test.tsx` — synthetic agents in timeline, focused-row state, scope pill, count badge cap, keyboard hint row visibility
- `useLiveDuration.test.ts` — 1s tick cadence, freeze on completion, reduced-motion respect

Acceptance: all new tests green; existing tests green.

### T11 — Pixel-diff vs design

```bash
cd dashboard
pnpm dev
# Open http://localhost:3142 in browser
# Side-by-side with docs/design/anthropic-handoff/dashboard.html
```

Manually compare Background Agents block + Agent Graph. Note any divergence beyond a11y exceptions.

Acceptance: ±2px alignment; a11y exceptions documented in PR description.

### T12 — Typecheck + test + lint

```bash
npx tsc --noEmit
pnpm -C dashboard test
pnpm -C server test
```

Clean.

### T13 — Reduced-motion + accessibility audit

- DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce"
- Verify: pulse animations stop, ticker freezes (or remains static), no jarring transitions
- Tab through the trace panel: focus ring visible on every interactive element
- Screen-reader pass: row status announced ("Running", "Completed")

Acceptance: no a11y regressions.

---

## Risk gates

| Gate | Pass | Fail |
|---|---|---|
| T1 — stop API decision | recorded | block on prereq |
| T2/T3 — components mount | renders with mock data | iterate |
| T4 — ticker | updates 1s, freezes correctly | check effect cleanup |
| T5 — TurnCard integration | dispatch renders once | check for double-render |
| T6 — TraceTab rewrite | matches design layout | iterate |
| T7 — badge + scope pill | renders + caps | width audit |
| T8 — hint row | conditional render correct | feature flag check |
| T9 — keyboard | all keys handled | check event listener cleanup |
| T10 — tests | all green | per fixture |
| T11 — visual | ±2px match | gap review |
| T12 — typecheck | clean | per error |
| T13 — a11y | passes | re-audit |

---

## Out of scope (re-confirmed)

- Pulling per-real-agent token totals if data missing
- Recursively dispatched subagents-of-subagents
- Tweaks panel
- Mobile-responsive

---

## Execution mode

- **Subagent recommended** for T6 (TraceTab rewrite — large component, design HTML ~90 lines of structure). Spawn `engineer` agent with focused task.
- **Subagent for T9** (keyboard handler with chord state) optional.
- T1-T5, T7-T8, T10-T13 fit in current context.
- **Highest-conflict file:** `BottomPanel.tsx` (touched by Phase 1 + Phase 4). Rebase carefully.
