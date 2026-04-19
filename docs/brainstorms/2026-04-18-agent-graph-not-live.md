# Brainstorm: Agent Graph Not Live — Requires Reload

**Date:** 2026-04-18
**Input type:** Observation
**Input:** "why agent graph is live on the turn and conversation but i have to reload to see it on graph. dig to the root cause, if we have any blockage"

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Graph and conversation share the same event subscription | QUESTIONED | Graph reads `metrics.dag` from REST; conversation reads `liveEvents` from WS |
| AgentFlowDAG is the graph component actually rendered | QUESTIONED | `AgentFlowDAG.tsx` exists but is NOT mounted in the UI; TraceTab is used instead |
| DAG updates on every new event | QUESTIONED | `useSessionMetrics` has no WS subscription at all |
| The stale behavior is intentional | QUESTIONED | No comment or doc explaining it — likely an oversight |

## Fundamentals

### Truth 1: There are two distinct data pipelines

**Pipeline A — Live (conversation/turns)**
- `AppLayout.tsx` owns the unified WebSocket (`useUnifiedWebSocket`)
- `SessionPage.tsx` registers `handleNewEvents` callback into `AppLayout`'s ref
- New events → RAF batch → `liveEvents` state → merged with REST baseline → `allEvents` → `groupEventsIntoTurns()` → turns rendered
- Updates on **every** new event

**Pipeline B — Stale (graph)**
- `useSessionMetrics(projectHash, sessionId)` does a one-shot REST fetch
- Result lands in `metrics.dag`
- `metrics` only refreshes when `refreshMetrics()` is explicitly called
- `refreshMetrics()` is called in ONE place in `SessionPage.tsx` (line ~184–194): when `isAgentCompleted("main", ...)` flips from false → true
- That is: only when the **entire last turn finishes**, not on intermediate events

### Truth 2: `metrics.dag` is the graph's sole data source

`BottomPanel.tsx` receives `dag` (from `metrics?.dag`) as a prop.
`TraceTab.tsx` consumes `dag` for its Gantt-style agent view.
Neither component has a WS subscription or derives the DAG from `liveEvents`.

### Truth 3: The UI's "Graph" tab (if it exists) renders from this stale `metrics.dag`

Any graph component (AgentFlowDAG or the DAG panel in bottom panel) only gets updated data after:
1. Session completes last turn → `refreshMetrics()` → new REST fetch → new `metrics.dag`
2. User manually reloads → fresh REST fetch on mount

### Truth 4: The conversation view derives state locally from `allEvents`

`groupEventsIntoTurns(allEvents)` is called reactively inside `SessionPage`. Every event appended to `liveEvents` causes a re-render with the latest data. No REST round-trip needed.

### Blockage Analysis

| Location | Blockage type |
|----------|--------------|
| `useSessionMetrics` | No WS subscription — pure REST hook |
| `metrics.dag` refresh trigger | Only fires on turn completion, never on intermediate events |
| `BottomPanel` / `TraceTab` | Receives `dag` prop — can't self-update, must receive new prop from parent |
| AgentFlowDAG component | Defined but not actually rendered anywhere in the live UI |

## Output

### Root Cause (confirmed)

**The graph derives from `metrics.dag` which comes from a REST endpoint. The REST endpoint is only re-fetched when the entire last turn completes. The conversation view derives from `allEvents` (= REST baseline + `liveEvents` from WebSocket) which updates on every event.**

There is no WS subscription in the graph data path. The graph is structurally disconnected from the live event stream.

### Secondary observation: AgentFlowDAG is dead code

`AgentFlowDAG.tsx` is the dedicated graph component but it is not mounted anywhere in the current UI. Whatever "graph" view the user is looking at is probably the DAG section inside `TraceTab` or `BottomPanel`, both of which read `metrics.dag`.

### Fix Direction

Two options:

**Option A — Feed `liveEvents` into the graph (preferred)**
- Pass `liveEvents` (or `allEvents`) from `SessionPage` into `BottomPanel` → `TraceTab` (or wherever the graph lives)
- Derive agent graph topology from events client-side using the same `buildAgentDAG()` logic already in `computeMetrics()`
- Result: graph updates on every event, zero REST round-trips

**Option B — Poll / subscribe metrics more aggressively**
- Call `refreshMetrics()` on every batch of new events (not just turn completion)
- Simple but wasteful: adds a REST round-trip per event batch, plus latency

Option A is correct per Architecture Invariant #4 ("Metrics computed server-side") — but live graph topology can be derived client-side from `allEvents` since it's just event filtering, not expensive aggregation.

Actually: the right interpretation is that `buildAgentDAG()` should run client-side incrementally from `allEvents`, just like `groupEventsIntoTurns()` does. The server pre-computes for the initial load; the client updates incrementally. This is exactly what the conversation view does for turns.

## Next Steps

Root cause is confirmed. The fix is clear and localized:

1. Move DAG derivation to happen from `allEvents` (already available in SessionPage)
2. Pass derived DAG down as a prop that updates on every event, replacing the stale `metrics.dag` for the live view
3. Keep `metrics.dag` for initial load (REST baseline), then layer live-derived DAG on top — same pattern as `liveEvents` layering over REST events
