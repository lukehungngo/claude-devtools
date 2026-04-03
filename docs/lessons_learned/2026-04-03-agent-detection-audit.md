# Audit: Agent Detection Discrepancy (Agent Log 4 vs Agent Graph 1)

**Date:** 2026-04-03
**Severity:** P1 — data inconsistency between two views of same session

## Problem

Agent Log (timeline) shows 4 agents (main, Explore, 2x engineer) but Agent Graph (DAG) shows only 1 (main) for the same session.

## Root Cause Analysis

### How the two views detect agents

| View | Source | Method |
|------|--------|--------|
| Agent Log | `event.agentId` on merged events | Scan events, group by unique `agentId` |
| Agent Graph | `subagents/` directory on disk | List `.jsonl` files, read `.meta.json` |

### Why they should agree

Both read from the same JSONL files:
- Main session file: events have **no** `agentId` field
- Subagent files (`subagents/agent-{id}.jsonl`): events carry `agentId` on every event
- Server merges both into `allEvents` at `session-routes.ts:129`
- After merge, subagent events retain their `agentId`, main events have `undefined`

Both approaches are SSOT-compliant (JSONL files are the source of truth).

### Why they disagree in practice

**Hypothesis under investigation:** The DAG builder's `loadFullSession()` is not finding the `subagents/` directory for this session. Possible causes:
1. Path construction bug (wrong session path)
2. Caching — `SessionCache` returning stale data without subagent info
3. SSE/SDK path — live sessions stream events without filesystem artifacts

### SSE/SDK gap (confirmed by differential reviewer)

For dashboard-started sessions (SSE path):
- SSE events have **zero** `agentId` fields (`sse-event-handler.ts` has no agent attribution)
- During active streaming, `subagents/` directory may not exist yet
- Agent Log falls back to `"main"` for all events
- Agent Graph also shows only main
- **Both views fail equally** — this is NOT the cause of the 4-vs-1 discrepancy

## Decision: Filesystem-driven is canonical

**Rationale:**
1. Richer metadata (agentType, description, parent-child via `parentId`)
2. Natural event partitioning (events already separated by file)
3. Already the canonical load path (`loadFullSession()` is the single entry point)
4. Lower FN rate (~1% vs ~2-5% for event-driven)

**The Agent Log should use DAG nodes as its authoritative agent roster**, not derive a separate list from unique `agentId` values. It can still use `event.agentId` for per-entry attribution.

## Root Cause Found: Agent Graph is turn-scoped, Agent Log is session-scoped

The server-side data is correct — `loadFullSession()` finds all 7 subagent files, and `buildAgentDAG()` produces 8 nodes (1 main + 7 subagents). Verified empirically by calling these functions directly on the session `3a0b812a`.

The discrepancy is entirely on the **dashboard side**:

1. **Agent Graph** (TraceTab) calls `filterDagForTurn(dag, activeTurn)` at `TraceTab.tsx:399`. This filters the full DAG to only show agents present in `activeTurn.agents`. When the user selects a main-agent turn (e.g., T0, T11), that turn's `agents` array only contains `"main"`, so the DAG is filtered to 1 node.

2. **Agent Log** shows ALL agents across ALL turns — it's session-scoped, not turn-scoped. It sees all 4+ agents because it reads `event.agentId` from the full merged event stream.

**The two views are answering different questions:**
- Agent Log: "How many agents existed in this session?" → 4 (session-wide)
- Agent Graph: "Which agents were active in the selected turn?" → 1 (turn-scoped)

This is a **UX/expectation mismatch**, not a data bug. The user expects both to show session-wide data, but the Agent Graph was designed to scope to the active turn.

### Previous hypothesis (MetricsCache) — partially valid

The `subagentCount` cache key fix is still correct as a defense-in-depth measure: without it, if the main JSONL file's mtime/size don't change when new subagents appear, the cache would return stale metrics. But this was NOT the cause of the observed 4-vs-1 discrepancy.

**Files changed:**
- `server/src/cache/metrics-cache.ts` — added `subagentCount` to key interface and validation (defense-in-depth)
- `server/src/http/routes/session-routes.ts` — count subagent files before cache lookup

## Lessons

- When two views show different numbers, check **scope** before checking **data source**. The Agent Graph was turn-scoped while Agent Log was session-scoped — both correct, but answering different questions.
- Cache keys must cover ALL inputs that affect the cached value. The `subagentCount` fix is still valid defense-in-depth.
- Empirically verifying server-side functions (`loadFullSession()`, `buildAgentDAG()`) saved hours of wrong-tree investigation.

## Action Items

1. ~~Investigate why `loadFullSession()` isn't finding subagent files~~ **DONE** — server data is correct, issue is dashboard-side scope filtering
2. ~~Fix the specific caching bug~~ **DONE** — `subagentCount` added to cache key (defense-in-depth)
3. **TODO** — Add a "show all agents" toggle or "no turn selected" default to Agent Graph so it shows session-wide data when no turn is focused
4. **Consider** adding SSE agent attribution as a future enhancement

## References

- Research proposal: `docs/plans/agent-detection-approach.md`
- Differential review: `docs/reports/agent-detection-differential.md`
- Key files: `server/src/parser/session-discovery.ts:122-184`, `server/src/analyzer/dag-builder.ts:116-183`
