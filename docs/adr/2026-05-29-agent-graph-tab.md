# ADR 0001 — Agent Graph Tab

**Date:** 2026-05-29 · **Status:** Accepted · **Deciders:** user (design forks) + autonomous
**Process:** brainstorm → **ADR (this)** → plan → execute → review

## Context
The dashboard needs a new top-level **Graph** tab that visualizes the agents of a session's most recent turn as a graph: each node is an agent with a running / not-running status, and clicking a node reveals the last 5 lines that agent emitted. Today agent topology exists only inside the Session view's `AgentFlowDAG` (a bottom-panel/inline component). This tab is a standalone, more visual, live experience.

The codebase already provides reusable, source-of-truth building blocks:
- `AgentDAG`/`AgentNode` (`dashboard/src/lib/types.ts:412-434`) — `status: "active" | "completed" | "error"`, `parentId`, `type`, `tokenUsage`, timings. Built server-side by `buildAgentDAG` and delivered in `SessionMetrics.dag`.
- `filterDagForTurn` (`dashboard/src/lib/filterDagForTurn.ts`) — filters a DAG to the agents active in a given turn.
- `useSessionMetrics` (`dashboard/src/hooks/useSessionData.ts`) — loads `{ metrics, events, subagentMeta }` for a session.
- `useAgentLogs` (`dashboard/src/hooks/useAgentLogs.ts`) — per-agent log lines (supports a live event count).
- `useRepos` — all repos→sessions (for the picker); `useUnifiedWebSocket` — live event stream.
- Nav pill in `Titlebar.tsx` (Session · Insights); routes in `router.ts`.

## Decisions (forks resolved with the user)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Session picker in the tab** — a dropdown (grouped by repo) selects any session; the graph shows that session's **last turn**. Defaults to the most-recently-active session on first load. | User choice. Self-contained tab; doesn't depend on sidebar selection. |
| D2 | **New dedicated graph visualization** (not reuse `AgentFlowDAG`), with **GSAP** entrance/edge-draw/status-pulse animations. **Reuse the DATA layer** (`AgentDAG`, `filterDagForTurn`, status) — new presentation only. | User choice + original goal ("fancy stuff", gsap). Reusing data keeps numbers/status correct (Invariant #9) while the presentation is bespoke. |
| D3 | **Node click → last 5 emitted lines** = the agent's 5 most-recent emitted *text + tool-result/output* chunks, newest last, via a pure `lastEmittedLines(events, agentId, 5)` helper (reusing `useAgentLogs` data where convenient). | User choice. Most informative "what is this agent doing". |
| D4 | **Live** — running agents update status + lines in real time via `useUnifiedWebSocket` layered onto the loaded session (same pattern as `SessionPage`). | User choice + dashboard live ethos. |
| D5 | **Full-bleed layout** — Graph page hides the session sidebar / turn-history / bottom-panel (like `/insights`), since it has its own picker. `AppLayout` adds an `isGraph` branch mirroring `isInsights`. | Consistency with Insights; the picker replaces the sidebar. |
| D6 | **No new server endpoint** — reuse `useSessionMetrics` (dag + turns) + the session events the dashboard already fetches; compute "last 5 lines" client-side. Add an endpoint only if a perf/data gap appears. | Architecture Invariant: metrics server-side, reuse; avoid new surface. |
| D7 | **Add `gsap` dependency** to the dashboard. | Not currently installed; user explicitly requested GSAP. Animation lib, not a UI framework — consistent with fe-guide intent. |

## Architecture

```
router.ts:  + /graph  → lazy GraphPage
Titlebar:    Session · Insights · + Graph (nav-graph)
AppLayout:   isGraph → full-bleed (null sidebar/topbar/turnHistory/bottomPanel)

GraphPage (routes/GraphPage.tsx)
 ├─ SessionPicker (components/graph/SessionPicker.tsx)      ← useRepos(), grouped by repo
 ├─ useGraphSession(selected)                               ← useSessionMetrics + live WS layering
 │     → { dag, lastTurn, events(+live), runningAgentIds }
 ├─ AgentGraph (components/graph/AgentGraph.tsx)            ← GSAP canvas
 │     ├─ agentGraphLayout(dagForTurn)  (lib/agentGraphLayout.ts, pure)
 │     ├─ AgentGraphNode (status pulse, type, tokens) → onSelect(agentId)
 │     └─ edges (parent→child), GSAP draw-in
 └─ AgentDetailPanel (components/graph/AgentDetailPanel.tsx)
        ← lastEmittedLines(events, selectedAgentId, 5) (lib/lastEmittedLines.ts, pure), live
```

### Data flow
1. `useRepos()` → SessionPicker options; default selection = most-recently-active session.
2. `useGraphSession(projectHash, sessionId)` wraps `useSessionMetrics` → `metrics.dag`, `metrics.tokensByTurn`/turns → derive **last turn**; `filterDagForTurn(dag, lastTurn)` → `dagForTurn`. Layer `useUnifiedWebSocket` new-events to refresh status + events live (ref-based, O(1) per event, per Invariant #8).
3. `agentGraphLayout(dagForTurn)` → pure `{ nodes: {id,x,y}, edges }` (layered tree: main/root at top, subagents fanned by depth). No overlap; deterministic.
4. `AgentGraph` renders nodes/edges absolutely-positioned; GSAP animates entrance + a status pulse on `status==="active"` (running). Click sets `selectedAgentId`.
5. `AgentDetailPanel` shows `lastEmittedLines(events, selectedAgentId, 5)` — newest last; updates live.

### Status mapping
- running = `AgentNode.status === "active"` (+ session live). not-running = `"completed" | "error"` (error styled distinctly). Reuses the authoritative server status — no client re-derivation (Common Gotcha: status flash).

## Components & boundaries (each small, testable)
- `lib/agentGraphLayout.ts` — pure layout (input DAG → positions). Unit-tested: parent above child, no overlap, stable order.
- `lib/lastEmittedLines.ts` — pure extractor (events + agentId + n → string[]). Unit-tested: text + tool outputs, cap n, newest order, fail-safe on odd content.
- `components/graph/SessionPicker.tsx` — presentational dropdown; named export; dt-* tokens; lucide chevron.
- `components/graph/AgentGraphNode.tsx` — one node; status styling; memoized.
- `components/graph/AgentGraph.tsx` — canvas + GSAP; `prefers-reduced-motion` respected.
- `components/graph/AgentDetailPanel.tsx` — last-5 lines panel.
- `hooks/useGraphSession.ts` — data + live layering.
- `routes/GraphPage.tsx` — composition + picker state + selection state.

## Visual consistency (hard gate)
All new JSX uses `dt-*` Tailwind tokens (no static `style={{}}` except dynamic node x/y); colors reuse existing agent semantics (running = accent/green pulse like existing live indicators, completed = muted, error = `--red`); typography/spacing match `AgentNodeCard`/Insights cards; icons `lucide-react`. GSAP for motion only.

## Testing
- Unit: `agentGraphLayout`, `lastEmittedLines`, `AgentGraphNode` (status classes + click), `SessionPicker`, `AgentDetailPanel` (≤5, newest, live), `AgentGraph` (renders nodes/edges, running pulse, onSelect).
- Integration: `GraphPage` (pick session → last-turn graph → click node → detail), Titlebar nav-graph navigates, live WS event flips a node to/from running.
- 80%+ coverage on new modules. tsc clean, dashboard tests green, no new lint:styles violations.

## Risks / mitigations
- **GSAP + jsdom tests:** GSAP DOM animations are hard to assert under vitest/jsdom → keep animation in `AgentGraph` thin; assert structure/classes, mock/skip raw GSAP timelines; guard with `prefers-reduced-motion`. Layout + extraction logic is pure and fully tested.
- **Large turns (many subagents):** layout + render must stay smooth; memoize nodes, only animate on structural change (Invariant #10). Cap/scroll if node count is very high.
- **Live correctness:** reuse the authoritative `status` + ref-based live layering to avoid the status-flash gotcha and O(n)-per-event regressions.
- **No new server endpoint:** if client-side last-5 from events proves heavy for huge sessions, revisit D6 with a tail endpoint.

## Out of scope
Editing the graph, cross-turn timeline, exporting the graph image, multi-session compare. (Future.)
