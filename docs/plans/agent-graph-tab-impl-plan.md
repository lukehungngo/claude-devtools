# Agent Graph Tab — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (fresh subagent per task, two-stage review). Steps use `- [ ]`. Spec: `docs/adr/2026-05-29-agent-graph-tab.md`.

**Goal:** Add a top-level **Graph** tab that visualizes the agents of a chosen session's most recent turn as a live, GSAP-animated graph; clicking a node shows that agent's last 5 emitted lines.

**Architecture:** New full-bleed route `/graph` (like `/insights`) with an in-tab session picker. Reuse the DATA layer (`useSessionMetrics`→`metrics.dag`, `groupEventsIntoTurns`→last turn, `filterDagForTurn`, `useAgentLogs`); build a NEW presentation (`AgentGraph` + GSAP). Live updates via the existing WS `registerSessionHandlers` + debounced `refresh()`.

**Tech Stack:** React 18, TanStack Router, Tailwind `dt-*` tokens, lucide-react, GSAP (new dep), Vitest + Testing Library.

**Verified contracts (do not re-derive):**
- `useSessionMetrics(projectHash: string|null, sessionId: string|null)` → `{ metrics: SessionMetrics|null, events: SessionEvent[], subagentMeta, loading, refresh }`. `metrics.dag: AgentDAG`. Fetches `/api/sessions/:hash/:id`.
- `groupEventsIntoTurns(allEvents: SessionEvent[], subagentMeta): TurnSnapshot[]` (`lib/turnSnapshot.ts`). Last turn = `turns.at(-1)`.
- `filterDagForTurn(dag: AgentDAG|null, activeTurn: TurnSnapshot|undefined, prev?): AgentDAG|null` (`lib/filterDagForTurn.ts`).
- `AgentNode` = `{ id, type, description?, parentId?, tokenUsage, toolCalls, mcpToolCalls, status: "active"|"completed"|"error", startTime?, endTime?, model? }`. `AgentDAG = { nodes: AgentNode[], edges: { source, target }[] }`.
- `useAgentLogs(projectHash, sessionId, agentId, liveEventCount?)` → `{ logs: AgentLogEntry[], loading }`. `AgentLogEntry = { timestamp, eventType, agentId, contentPreview, uuid }`. Fetches `/api/sessions/:hash/:id/events/:agentId`.
- `SessionInfo = { id, projectHash, startTime: string, isActive?: boolean, ... }`; `RepoInfo = { repoName, sessions: SessionInfo[], ... }`; `useRepos()` → `{ repos, loading, refresh }`.
- WS: `LayoutContext.registerSessionHandlers({ onNewEvents: (sessionId, filePath, events) => void } | null)`.
- Nav pill: `dashboard/src/components/Titlebar.tsx` ~line 89; routes: `dashboard/src/router.ts`; full-bleed pattern: `AppLayout.tsx` `isInsights`.
- Status: running ⇔ `AgentNode.status === "active"`; not-running ⇔ `"completed"|"error"`. Do NOT re-derive client-side.

**Global rules:** TDD (test fails first). dt-* tokens, no static `style={{}}` except dynamic node x/y. Named exports. lucide-react icons. No `any`. Run `cd dashboard && npx tsc --noEmit` + `pnpm -C dashboard test` green per task; no new `lint:styles` violations.

---

### Task 0: Scaffold — gsap dep, `/graph` route, nav pill, full-bleed layout

**Files:**
- Modify: `dashboard/package.json` (add `"gsap": "^3.13.0"` to dependencies — verify latest 3.x with `npm view gsap version`; pin that)
- Modify: `dashboard/src/router.ts` (add graphRoute)
- Modify: `dashboard/src/components/Titlebar.tsx` (add nav-graph button + `isGraph`)
- Modify: `dashboard/src/routes/AppLayout.tsx` (full-bleed for `/graph`)
- Create: `dashboard/src/routes/GraphPage.tsx` (placeholder export for now: `export function GraphPage() { return <div data-testid="graph-page" />; }`)
- Test: `dashboard/src/components/Titlebar.test.tsx` (or existing), `dashboard/src/__tests__/graph-route.test.tsx`

- [ ] **Step 1 (RED):** In a Titlebar test, render Titlebar at `/graph` and assert a `data-testid="nav-graph"` button exists with text "Graph" and `aria-current="page"`; assert clicking `nav-graph` navigates to `/graph`. Run → fails.
- [ ] **Step 2 (GREEN):** Install gsap (`pnpm -C dashboard add gsap@^3.13.0`). Add `graphRoute` in `router.ts` mirroring `insightsRoute`:
  ```ts
  const graphRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: "/graph",
    component: lazyRouteComponent(() => import("./routes/GraphPage"), "GraphPage"),
  });
  // add graphRoute to layoutRoute.addChildren([... , graphRoute])
  ```
  In `Titlebar.tsx`: add `const isGraph = location.pathname === "/graph";`, set Session active = `!isInsights && !isGraph`, and add a third pill button (copy the Session button styling exactly, dt-* tokens): `data-testid="nav-graph"`, label "Graph", `onClick={() => navigate({ to: "/graph" })}`, active class when `isGraph`.
  In `AppLayout.tsx`: add `const isGraph = pathname === "/graph";`, define `const isFullBleed = isInsights || isGraph;`, and replace each `isInsights ?` layout branch (sidebar/topBar/turnHistory/bottomPanel/sidebarCollapsed) with `isFullBleed ?`. Create placeholder `GraphPage`.
- [ ] **Step 3:** Run the Titlebar + route tests → PASS. `npx tsc --noEmit` → 0.
- [ ] **Step 4 (commit):** `feat(graph): scaffold /graph route, nav pill, full-bleed layout + gsap dep`

---

### Task 1: `lastEmittedLines` pure helper

**Files:** Create `dashboard/src/lib/lastEmittedLines.ts`; Test `dashboard/src/lib/lastEmittedLines.test.ts`

`AgentLogEntry = { timestamp, eventType, agentId, contentPreview, uuid }`. "Emitted line" = an entry with a non-empty trimmed `contentPreview`. Return the last `n` such entries (newest last, preserving order).

- [ ] **Step 1 (RED):**
  ```ts
  import { describe, it, expect } from "vitest";
  import { lastEmittedLines } from "./lastEmittedLines";
  import type { AgentLogEntry } from "./types";
  const e = (i: number, preview: string, eventType = "assistant"): AgentLogEntry =>
    ({ timestamp: `2026-05-29T00:00:0${i}Z`, eventType, agentId: "main", contentPreview: preview, uuid: `u${i}` });
  describe("lastEmittedLines", () => {
    it("returns the last n entries with non-empty contentPreview, newest last", () => {
      const logs = [e(1,"a"), e(2,"b"), e(3,"c"), e(4,"d"), e(5,"e"), e(6,"f")];
      expect(lastEmittedLines(logs, 5).map(l => l.contentPreview)).toEqual(["b","c","d","e","f"]);
    });
    it("skips entries whose contentPreview is empty/whitespace", () => {
      const logs = [e(1,"a"), e(2,"  "), e(3,""), e(4,"b")];
      expect(lastEmittedLines(logs, 5).map(l => l.contentPreview)).toEqual(["a","b"]);
    });
    it("returns fewer than n when not enough entries; empty array on []", () => {
      expect(lastEmittedLines([e(1,"a")], 5).length).toBe(1);
      expect(lastEmittedLines([], 5)).toEqual([]);
    });
  });
  ```
  Run → fails (module missing).
- [ ] **Step 2 (GREEN):**
  ```ts
  import type { AgentLogEntry } from "./types";
  export function lastEmittedLines(logs: AgentLogEntry[], n: number): AgentLogEntry[] {
    const meaningful = logs.filter((l) => l.contentPreview.trim().length > 0);
    return n >= meaningful.length ? meaningful : meaningful.slice(meaningful.length - n);
  }
  ```
- [ ] **Step 3:** Run → PASS. **Step 4 (commit):** `feat(graph): lastEmittedLines helper`

---

### Task 2: `agentGraphLayout` pure helper

**Files:** Create `dashboard/src/lib/agentGraphLayout.ts`; Test `dashboard/src/lib/agentGraphLayout.test.ts`

Layered tree from an `AgentDAG`: depth 0 = nodes with no `parentId` (or `id==="main"`); each child is one layer below its parent. Output: `{ nodes: { id, x, y, depth }[], edges: { source, target }[] }`. Deterministic ordering (input order within a layer). `x` = column index within layer, `y` = depth. Consumers scale to pixels. Acceptance: every child's `y` > its parent's `y`; no two nodes share the same `(x,y)`; `main` at depth 0.

- [ ] **Step 1 (RED):** test with a 3-node DAG (`main` → `agent_a`, `agent_b`): assert `main.depth===0`, `agent_a.depth===1`, `agent_b.depth===1`, distinct `x` for the two children, and `nodes.length===3`, `edges` preserved. Include a test that an orphan node (parentId not present) is placed at depth 0. Run → fails.
- [ ] **Step 2 (GREEN):** implement BFS from roots assigning `depth`; within each depth assign `x` by encounter order; return nodes+edges. Pure, no DOM.
- [ ] **Step 3:** PASS. **Step 4 (commit):** `feat(graph): agentGraphLayout (layered tree)`

---

### Task 3: `SessionPicker` component

**Files:** Create `dashboard/src/components/graph/SessionPicker.tsx`; Test `...SessionPicker.test.tsx`

Props: `interface SessionPickerProps { repos: RepoInfo[]; value: { projectHash: string; sessionId: string } | null; onChange: (sel: { projectHash: string; sessionId: string }) => void; }`. A `<select>` (or dt-styled dropdown) grouping sessions by `repo.repoName` (`<optgroup>`), option label = short session id + relative start time, `isActive` sessions marked (e.g. "● live"). Named export, dt-* tokens, lucide `ChevronDown`. No inline styles.

- [ ] **Step 1 (RED):** render with 1 repo + 2 sessions; assert both session options render under the repo optgroup; selecting an option calls `onChange` with `{projectHash, sessionId}`; an `isActive` session shows a live marker. Run → fails.
- [ ] **Step 2 (GREEN):** implement.
- [ ] **Step 3:** PASS + tsc 0. **Step 4 (commit):** `feat(graph): SessionPicker`

---

### Task 4: `AgentGraphNode` component

**Files:** Create `dashboard/src/components/graph/AgentGraphNode.tsx`; Test `...AgentGraphNode.test.tsx`

Props: `interface AgentGraphNodeProps { node: AgentNode; x: number; y: number; selected: boolean; running: boolean; onSelect: (id: string) => void; }`. Renders an absolutely-positioned card (dynamic `style={{ left: x, top: y }}` — the ONLY allowed inline style) showing `node.type`/`description`, token summary, and a status dot. `running` → `dt-*` accent/green class + `animate-pulse` (or a `data-running="true"` + pulse class); `status==="error"` → red; else muted. `selected` → ring. Click → `onSelect(node.id)`. Memoized. Reuse color semantics from `AgentNodeCard.tsx` (read it for token classes).

- [ ] **Step 1 (RED):** render running node → assert pulse/running class + status dot; render error node → red class; click → `onSelect(id)`; selected → ring class. Run → fails.
- [ ] **Step 2 (GREEN):** implement (dynamic left/top inline allowed; all colors via dt-* classes).
- [ ] **Step 3:** PASS. **Step 4 (commit):** `feat(graph): AgentGraphNode`

---

### Task 5: `AgentGraph` canvas (layout + edges + GSAP)

**Files:** Create `dashboard/src/components/graph/AgentGraph.tsx`; Test `...AgentGraph.test.tsx`

Props: `interface AgentGraphProps { dag: AgentDAG; runningAgentIds: Set<string>; selectedAgentId: string | null; onSelectAgent: (id: string) => void; }`. Compute `agentGraphLayout(dag)`, scale `(x,y)` to pixels (column gap / row gap constants), render an `<svg>` (or absolutely-positioned divs) container with edge lines (parent→child) and an `AgentGraphNode` per node. GSAP: on mount/structure-change, animate node entrance (fade+scale) and edge draw; keep GSAP in a `useLayoutEffect` keyed by node-id set; respect `window.matchMedia("(prefers-reduced-motion: reduce)")` (skip animation). Memoize layout; only re-run GSAP when the node-id set changes (Invariant #10). Empty dag → friendly "No agents in this turn" message (dt tokens).

- [ ] **Step 1 (RED):** render with a 3-node dag → assert 3 `AgentGraphNode`s and 2 edge elements present; a node in `runningAgentIds` gets the running treatment; clicking a node calls `onSelectAgent`; empty dag → empty-state text. (Mock gsap: `vi.mock("gsap", () => ({ default: { set: vi.fn(), to: vi.fn(), from: vi.fn(), timeline: () => ({ from: vi.fn().mockReturnThis(), to: vi.fn().mockReturnThis() }) } }))` so jsdom doesn't choke.) Run → fails.
- [ ] **Step 2 (GREEN):** implement; assert structure independent of GSAP.
- [ ] **Step 3:** PASS + tsc 0. **Step 4 (commit):** `feat(graph): AgentGraph canvas with GSAP`

---

### Task 6: `AgentDetailPanel` (last 5 lines)

**Files:** Create `dashboard/src/components/graph/AgentDetailPanel.tsx`; Test `...AgentDetailPanel.test.tsx`

Props: `interface AgentDetailPanelProps { projectHash: string; sessionId: string; agentId: string | null; liveEventCount?: number; }`. Uses `useAgentLogs(projectHash, sessionId, agentId ?? "", liveEventCount)`; renders `lastEmittedLines(logs, 5)` newest-last, each line = `eventType` chip + `contentPreview` (truncate), via dt-* tokens + `react-markdown` only if already used elsewhere for previews (else plain text). `agentId === null` → "Select an agent" empty state. Header = agent id/type.

- [ ] **Step 1 (RED):** mock `useAgentLogs` to return 7 entries; assert exactly the last 5 render, newest last; `agentId===null` → empty state; live: bumping `liveEventCount` refetches (assert hook called with new count). Run → fails.
- [ ] **Step 2 (GREEN):** implement.
- [ ] **Step 3:** PASS. **Step 4 (commit):** `feat(graph): AgentDetailPanel last-5 emitted lines`

---

### Task 7: `useGraphSession` hook (data + last turn + live)

**Files:** Create `dashboard/src/hooks/useGraphSession.ts`; Test `...useGraphSession.test.ts`

Signature: `useGraphSession(projectHash: string|null, sessionId: string|null) → { dagForTurn: AgentDAG|null; runningAgentIds: Set<string>; lastTurn: TurnSnapshot|null; events: SessionEvent[]; liveEventCount: number; loading: boolean; }`. Internals: call `useSessionMetrics`; derive `turns = groupEventsIntoTurns(events, subagentMeta)`, `lastTurn = turns.at(-1) ?? null`; `dagForTurn = filterDagForTurn(metrics?.dag ?? null, lastTurn ?? undefined)`; `runningAgentIds = new Set(dagForTurn?.nodes.filter(n => n.status === "active").map(n => n.id))`; `liveEventCount = events.length`. Live: register `registerSessionHandlers({ onNewEvents })` (from LayoutContext) for the selected session; on new events, debounce ~1500ms then `refresh()` (skip when none). Cleanup: deregister on unmount/session change. Memoize derived values (Invariant #8 — no O(n) per render beyond turn grouping which is already incremental-capable).

- [ ] **Step 1 (RED):** with a mocked `useSessionMetrics` returning a dag with one "active" + one "completed" node and 2 turns, assert `lastTurn` is the last, `dagForTurn` is filtered, `runningAgentIds` = {active id}. Assert a simulated `onNewEvents` triggers a debounced `refresh`. Run → fails.
- [ ] **Step 2 (GREEN):** implement (use `useContext(LayoutContext)` for `registerSessionHandlers`).
- [ ] **Step 3:** PASS + tsc 0. **Step 4 (commit):** `feat(graph): useGraphSession (last-turn dag + live)`

---

### Task 8: `GraphPage` composition

**Files:** Modify `dashboard/src/routes/GraphPage.tsx` (replace placeholder); Test `...GraphPage.test.tsx`

Compose: `useRepos()` → SessionPicker; selection state defaults to the most-recently-active session (max `startTime` among `isActive`, else max `startTime` overall); `useGraphSession(sel.projectHash, sel.sessionId)`; render `AgentGraph` (dagForTurn, runningAgentIds, selectedAgentId, onSelectAgent) + `AgentDetailPanel` (projectHash, sessionId, selectedAgentId, liveEventCount). Local `selectedAgentId` state. Layout: picker top bar, graph fills, detail panel as a right rail or bottom sheet (dt tokens, matches Insights spacing). Loading + no-session empty states.

- [ ] **Step 1 (RED):** mock `useRepos` (2 sessions, one active) + `useGraphSession`; render GraphPage → assert it auto-selects the active session, renders the graph nodes, clicking a node shows that agent's detail panel (last lines). Run → fails.
- [ ] **Step 2 (GREEN):** implement.
- [ ] **Step 3:** PASS + tsc 0. **Step 4 (commit):** `feat(graph): GraphPage composition`

---

### Task 9: Integration, visual, full gate

- [ ] **Step 1:** `cd dashboard && npx tsc --noEmit` → 0.
- [ ] **Step 2:** `pnpm -C dashboard test` → all green.
- [ ] **Step 3:** `pnpm -C dashboard lint:styles` → no NEW violations vs HEAD baseline; confirm only dynamic node `left/top` inline styles exist in new files (grep new graph files for `style={{`).
- [ ] **Step 4:** Manual/dogfood check (if app runnable): `/graph` shows the picker, last-turn graph, running pulse, click → last 5 lines; live session updates status. Record evidence.
- [ ] **Step 5 (commit):** `test(graph): integration + visual pass`

---

## Self-review (coverage vs ADR)
- D1 picker → Task 3, Task 8 (default = most-recent-active). D2 new viz + GSAP → Task 5 (data reuse: Tasks 2,7). D3 last-5 → Tasks 1,6. D4 live → Task 7. D5 full-bleed → Task 0. D6 no new endpoint → reuse only (Tasks 6,7). D7 gsap dep → Task 0.
- Status mapping uses server `status` (Task 7) — no client re-derivation. Visual gate in Task 9.
- No placeholders: pure-helper tasks include full test+impl; component/hook tasks give exact prop interfaces + reuse contracts (executor reads cited files for surrounding patterns).
