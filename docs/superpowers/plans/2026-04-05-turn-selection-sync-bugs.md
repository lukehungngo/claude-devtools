# Turn Selection Sync Bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix turn selection so clicking a turn in Turn History consistently updates Agent Graph, Agent Log, Raw Log, and Conversation across all panels.

**Architecture:** Turn selection flows from TurnHistoryPanel → AppLayout ref → SessionPage local state → LayoutContext global state → all consumers. Four bugs break this chain: (1) filterDagForTurn returns stale data when agent IDs match across turns, (2) AgentLogTab ignores turn selection entirely, (3) RawLogView in main panel receives raw `selectedTurnIndex` (null initially) instead of `effectiveIndex`, (4) ConversationView never filters by turn — it only highlights.

**Tech Stack:** React, TypeScript, Vitest

---

## Bug Analysis

### State flow diagram
```
TurnHistoryPanel.onSelectTurn(index)
  → AppLayout.handleTurnSelect → onTurnClickRef.current(index)
    → SessionPage.handleTurnClick → setSelectedTurnIndex(index)
      → useEffect → effectiveIndex = selectedTurnIndex ?? turns.length-1
        → setCurrentActiveTurnIndex(effectiveIndex)        [global]
          ├── BottomPanel.TraceTab     ← activeTurnIndex   ✓ but stale DAG (BUG 1)
          ├── BottomPanel.DetailTab    ← activeTurnIndex   ✓ works
          ├── BottomPanel.AgentLogTab  ← (nothing!)        ✗ BUG 2
          └── BottomPanel.CostTab     ← (nothing)          (session-scoped, OK)

      → RawLogView (main)  ← selectedTurnIndex (null!)     ✗ BUG 3
      → ConversationView   ← highlightedTurnIndex          ~ only scrolls, no filter
```

### Bug 1: filterDagForTurn returns stale reference when switching turns with same agents
**File:** `dashboard/src/lib/filterDagForTurn.ts:31-35`

When two turns have the same agent ID set (e.g., both use [main, agent-1]), the optimization check `prevIds === newIds` returns `prev` — the old DAG object with the **previous turn's** token counts, costs, and timing. The per-turn token override (lines 46-59) never runs.

### Bug 2: AgentLogTab ignores turn selection
**File:** `dashboard/src/components/bottom-panel/BottomPanel.tsx:262-269`

`AgentLogTab` receives `allEvents`, `dag`, `subagentMeta`, `selectedAgent`, `onSelectAgent` — but no `activeTurnIndex` or `turns`. It always shows the full session log.

### Bug 3: RawLogView gets `selectedTurnIndex` (null) instead of `effectiveIndex`
**File:** `dashboard/src/routes/SessionPage.tsx:308`

```tsx
<RawLogView ... activeTurnIndex={selectedTurnIndex} />
```

On initial load, `selectedTurnIndex` is null → RawLogView shows "Select a turn". Meanwhile BottomPanel tabs receive `currentActiveTurnIndex` (defaults to last turn via the effect). Inconsistent.

### Bug 4: No turn-scoped filtering in ConversationView (design issue, not crash bug)
ConversationView always renders all turns and only scrolls/highlights the selected one. This is a design question — not a code bug — but contributes to the "inconsistent behavior" feeling. **Defer to Task 4 discussion.**

---

### Task 1: Fix filterDagForTurn stale reference

**Files:**
- Modify: `dashboard/src/lib/filterDagForTurn.ts:31-35`
- Test: `dashboard/src/lib/filterDagForTurn.test.ts`

The `prev` optimization checks only agent IDs but not the turn identity. When two turns share the same agents, the old DAG (with stale token/cost/timing data) is returned.

- [ ] **Step 1: Write the failing test**

Add a test to `filterDagForTurn.test.ts` that calls `filterDagForTurn` for two different turns with the same agent set and verifies that the second call returns updated token data, not the first turn's data.

```typescript
it("returns fresh DAG when turns have same agents but different token data", () => {
  const dag: AgentDAG = {
    nodes: [
      { id: "main", label: "main", description: "", depth: 0, status: "completed", tokenUsage: { inputTokens: 0, outputTokens: 0, totalCost: 0 }, toolCalls: 0, mcpToolCalls: 0, startTime: "2026-01-01T00:00:00Z" },
      { id: "agent-1", label: "agent-1", description: "task", depth: 1, status: "completed", tokenUsage: { inputTokens: 0, outputTokens: 0, totalCost: 0 }, toolCalls: 0, mcpToolCalls: 0, startTime: "2026-01-01T00:00:00Z" },
    ],
    edges: [{ source: "main", target: "agent-1" }],
  };

  const turnA: TurnSnapshot = {
    turnNumber: 1,
    startTime: "2026-01-01T00:00:00Z",
    endTime: "2026-01-01T00:01:00Z",
    role: "user",
    summary: "turn A",
    startIndex: 0,
    endIndex: 2,
    agents: [
      { agentId: "main", tokensIn: 100, tokensOut: 50, cost: 0.01, tools: [] },
      { agentId: "agent-1", tokensIn: 200, tokensOut: 100, cost: 0.02, tools: [] },
    ],
  };

  const turnB: TurnSnapshot = {
    turnNumber: 2,
    startTime: "2026-01-01T00:01:00Z",
    endTime: "2026-01-01T00:02:00Z",
    role: "user",
    summary: "turn B",
    startIndex: 3,
    endIndex: 5,
    agents: [
      { agentId: "main", tokensIn: 300, tokensOut: 150, cost: 0.03, tools: [] },
      { agentId: "agent-1", tokensIn: 400, tokensOut: 200, cost: 0.04, tools: [] },
    ],
  };

  const resultA = filterDagForTurn(dag, turnA);
  const resultB = filterDagForTurn(dag, turnB, resultA);

  // Must NOT return resultA — token data differs
  expect(resultB).not.toBe(resultA);
  const agent1B = resultB!.nodes.find((n) => n.id === "agent-1")!;
  expect(agent1B.tokenUsage.inputTokens).toBe(400);
  expect(agent1B.tokenUsage.totalCost).toBe(0.04);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npx vitest run src/lib/filterDagForTurn.test.ts --reporter verbose`
Expected: FAIL — `resultB` is the same reference as `resultA`, with turn A's token data.

- [ ] **Step 3: Fix the optimization check**

In `dashboard/src/lib/filterDagForTurn.ts`, the prev-return optimization must also compare turn identity (turn number or start time), not just agent IDs:

```typescript
// Replace lines 30-35 with:
  // Check if agent set AND turn are unchanged from previous result
  if (prev && prev !== dag && prev._turnKey !== undefined) {
    const prevIds = prev.nodes.map((n) => n.id).sort().join(",");
    const newIds = Array.from(turnAgentIds).sort().join(",");
    const turnKey = `${activeTurn.turnNumber}:${activeTurn.startTime}`;
    if (prevIds === newIds && prev._turnKey === turnKey) return prev;
  }
```

Wait — adding `_turnKey` to `AgentDAG` type is invasive. Simpler approach: just compare the turn's token data hash, or better yet, include the turn number in the comparison:

Actually, the simplest fix: just remove the `prev` optimization entirely and let React.memo / useMemo handle dedup. Or compare turn identity:

Replace the `prev` check block (lines 30-35) with:

```typescript
  // Stable reference: return prev only if SAME agents AND SAME turn
  if (prev && prev !== dag) {
    const prevIds = prev.nodes.map((n) => n.id).sort().join(",");
    const newIds = Array.from(turnAgentIds).sort().join(",");
    // Also check if turn-scoped data changed (different turn = different costs/timing)
    const prevMain = prev.nodes.find((n) => n.id === "main");
    const currMain = agentSummaryMap.get("main");
    const sameData = prevMain && currMain
      && prevMain.tokenUsage.inputTokens === currMain.tokensIn
      && prevMain.tokenUsage.outputTokens === currMain.tokensOut;
    if (prevIds === newIds && sameData) return prev;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npx vitest run src/lib/filterDagForTurn.test.ts --reporter verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/filterDagForTurn.ts dashboard/src/lib/filterDagForTurn.test.ts
git commit -m "fix: filterDagForTurn returns stale data when switching turns with same agents"
```

---

### Task 2: Wire activeTurnIndex into AgentLogTab

**Files:**
- Modify: `dashboard/src/components/bottom-panel/BottomPanel.tsx:262-269`
- Modify: `dashboard/src/components/AgentLogs.tsx` (or `AgentLogTab` — wherever the component is)
- Test: `dashboard/src/components/bottom-panel/AgentLogTab.test.tsx`

AgentLogTab must receive `activeTurnIndex` and `turns` to filter its event display to the selected turn's events.

- [ ] **Step 1: Find AgentLogTab component and understand its current event filtering**

Read `AgentLogTab` component source to understand how it currently renders events. We need to add turn-scoped filtering.

- [ ] **Step 2: Write the failing test**

Add a test to `AgentLogTab.test.tsx` that verifies when `activeTurnIndex` is provided, only events within that turn's range are displayed.

```typescript
it("filters events to active turn when activeTurnIndex is provided", () => {
  // Setup: two turns with different events
  // Assert: only events from the selected turn are rendered
});
```

- [ ] **Step 3: Add activeTurnIndex and turns props to AgentLogTab**

Update the AgentLogTab component interface to accept `activeTurnIndex` and `turns`, then filter `allEvents` using `getEventsForTurn()`:

```typescript
interface AgentLogTabProps {
  allEvents: SessionEvent[];
  dag: AgentDAG | null;
  subagentMeta: SubagentMeta | null;
  selectedAgent: string | null;
  onSelectAgent: (agentId: string) => void;
  // NEW:
  activeTurnIndex?: number | null;
  turns?: TurnSnapshot[];
}
```

Inside the component, filter events when a turn is active:

```typescript
const displayEvents = useMemo(() => {
  if (activeTurnIndex == null || !turns?.length) return allEvents;
  const turn = turns[activeTurnIndex];
  if (!turn) return allEvents;
  return getEventsForTurn(turn, allEvents);
}, [allEvents, activeTurnIndex, turns]);
```

Use `displayEvents` instead of `allEvents` for rendering.

- [ ] **Step 4: Pass props from BottomPanel**

In `BottomPanel.tsx`, update the AgentLogTab usage (line 262-269):

```tsx
<AgentLogTab
  allEvents={events}
  dag={dag}
  subagentMeta={subagentMeta}
  selectedAgent={selectedAgent}
  onSelectAgent={onSelectAgent}
  activeTurnIndex={activeTurnIndex}
  turns={turns}
/>
```

- [ ] **Step 5: Run tests**

Run: `cd dashboard && npx vitest run src/components/bottom-panel/AgentLogTab.test.tsx --reporter verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/components/bottom-panel/BottomPanel.tsx dashboard/src/components/AgentLogs.tsx dashboard/src/components/bottom-panel/AgentLogTab.test.tsx
git commit -m "fix: AgentLogTab now filters events by selected turn"
```

---

### Task 3: Fix RawLogView receiving null instead of effectiveIndex

**Files:**
- Modify: `dashboard/src/routes/SessionPage.tsx:305-308`
- Test: manual verification (existing RawLogView tests cover rendering logic)

The main panel's RawLogView receives `selectedTurnIndex` (null on load), while BottomPanel tabs receive `currentActiveTurnIndex` (defaults to last turn). This means Raw Log shows "Select a turn" while Agent Graph shows last turn data.

- [ ] **Step 1: Compute effectiveIndex as a derived value**

In `SessionPage.tsx`, extract `effectiveIndex` as a `useMemo` so both the effect and the RawLogView can use it:

```typescript
// Replace the useEffect at lines 161-164 with:
const effectiveTurnIndex = useMemo(
  () => selectedTurnIndex ?? (turns.length > 0 ? turns.length - 1 : null),
  [selectedTurnIndex, turns.length],
);

useEffect(() => {
  setCurrentActiveTurnIndex(effectiveTurnIndex);
}, [effectiveTurnIndex, setCurrentActiveTurnIndex]);
```

- [ ] **Step 2: Pass effectiveTurnIndex to RawLogView**

Change line 308 from:
```tsx
activeTurnIndex={selectedTurnIndex}
```
to:
```tsx
activeTurnIndex={effectiveTurnIndex}
```

- [ ] **Step 3: Also pass to ConversationView for consistent highlighting**

The `highlightedTurnIndex` prop on ConversationView should also use `effectiveTurnIndex` as its default, so the last turn is highlighted on load. Currently `highlightedTurnIndex` is only set when user clicks — on initial load nothing is highlighted while the bottom panel shows last turn data.

Update SessionPage line 293:
```tsx
highlightedTurnIndex={highlightedTurnIndex ?? effectiveTurnIndex ?? undefined}
```

- [ ] **Step 4: Verify manually + run type check**

Run: `cd dashboard && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/routes/SessionPage.tsx
git commit -m "fix: RawLogView and ConversationView use effectiveTurnIndex for consistent default"
```

---

### Task 4: Verify cross-panel consistency

**Files:**
- No code changes — verification only

After Tasks 1-3, verify the following behaviors are consistent:

| Action | Turn History | Conversation | Raw Log (main) | Agent Graph | Agent Log | Tool Call |
|--------|-------------|-------------|----------------|-------------|-----------|-----------|
| Initial load | Last turn highlighted | Last turn highlighted | Last turn events | Last turn DAG | Last turn events | Last turn tools |
| Click turn 3 | Turn 3 highlighted | Scrolls to turn 3, highlights | Turn 3 events | Turn 3 DAG | Turn 3 events | Turn 3 tools |
| Click turn 5 | Turn 5 highlighted | Scrolls to turn 5, highlights | Turn 5 events | Turn 5 DAG | Turn 5 events | Turn 5 tools |
| Dismiss (clear) | Last turn highlighted | Removes highlight | Last turn events | Last turn DAG | Last turn events | Last turn tools |

- [ ] **Step 1: Run full test suite**

Run: `cd dashboard && pnpm test`
Expected: All tests pass

- [ ] **Step 2: Manual E2E verification**

Open the dashboard, load a session with multiple turns and sub-agents:
1. Verify initial load shows last turn data in all panels
2. Click through 3 different turns — verify all 6 panels update
3. Click dismiss — verify all panels return to last turn
4. Switch between main tabs (Conversation ↔ Raw Log) — verify selected turn persists

- [ ] **Step 3: Commit any fixups**

```bash
git add -A
git commit -m "fix: turn selection sync across all panels"
```
