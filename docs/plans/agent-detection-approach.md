# Research Proposal: Agent Detection Approach Unification

## Round
1 of 3

## Problem Definition

The dashboard has two independent mechanisms for detecting sub-agents in a session, and they produce different counts:

1. **Event-driven** (Agent Log / `AgentLogs.tsx`): Reads `event.agentId` from the merged event stream. When subagent JSONL files are loaded by `loadFullSession()` and merged into `allEvents`, each subagent event carries its `agentId` field. The Agent Log groups by these IDs.

2. **Filesystem-driven** (DAG / Agent Graph / `dag-builder.ts`): Reads `subagents/*.jsonl` files from disk via `loadFullSession()` in `session-discovery.ts`. Each file becomes one entry in the `subagentEvents` Map, and optionally a `.meta.json` file provides type/description. `buildAgentDAG()` creates one node per Map entry.

The discrepancy ("4 agents event-driven vs 1 filesystem") likely arises when the two approaches are used with different data sources or when internal agents (like `compact` or `aside_question`) are counted differently.

## Key Empirical Findings

### Finding 1: Main JSONL files have NO agentId

Verified on multiple sessions. The main session JSONL file (e.g., `<session-id>.jsonl`) contains events with **no `agentId` field**. Example from session `b9fc5b5e` (3,902 events): zero unique `agentId` values in the main file.

### Finding 2: Subagent JSONL files DO have agentId

Each event in a subagent file (e.g., `subagents/agent-a008a6e613017b245.jsonl`) carries `"agentId": "a008a6e613017b245"`. This is written by Claude Code itself.

### Finding 3: The server merges both into allEvents

`session-routes.ts` line 129:
```
allEvents = [...mainEvents, ...allSubEvents].sort(...)
```

After merging, main events have `agentId === undefined`, subagent events have their original `agentId`. The dashboard's `AgentLogs.tsx` line 145 normalizes: `const agentId = event.agentId || "main"`.

### Finding 4: Filesystem approach catches internal agents

The `subagents/` directory contains not just user-spawned Task/Agent calls, but also Claude Code internal agents like `acompact-*` (context compaction) and `aside_question-*`. These have JSONL files but typically no `.meta.json`. The code at `session-discovery.ts:169-179` infers their type from filename pattern.

### Finding 5: Real scale of subagents

One session (`b9fc5b5e`) has **164 subagent JSONL files** plus 6 `acompact-*` and 8 `aside_question-*` internal agents. This is not an edge case -- multi-agent workflows are the norm for this project.

## Approach Comparison

### Approach A: Event-driven (read agentId from merged events)

**Algorithm**: Scan all events in the merged `allEvents` array, extract unique `agentId` values, use them to group/filter.

**How it works today**: `eventsToLogEntries()` in `AgentLogs.tsx` iterates events and reads `event.agentId`. It cross-references with DAG nodes and `subagentMeta` for display labels.

### Approach B: Filesystem-driven (read subagents/ directory)

**Algorithm**: `loadFullSession()` reads `subagents/` directory, creates `Map<agentId, SessionEvent[]>` and `Map<agentId, meta>`. Passed to `buildAgentDAG()` which creates one node per entry.

**How it works today**: `session-discovery.ts` `loadFullSession()` reads the filesystem. `dag-builder.ts` `buildAgentDAG()` consumes the Maps.

### Approach C: Hybrid (current implicit state)

Both approaches run. The server loads via filesystem (Approach B), merges events, sends merged `allEvents` + `subagentMeta` + `dag` to client. The client then uses event-driven grouping (Approach A) in the Agent Log while displaying the filesystem-sourced DAG in the Agent Graph.

## Trade-off Analysis

| Dimension | Event-driven (A) | Filesystem-driven (B) | Hybrid (C, current) |
|-----------|-------------------|----------------------|---------------------|
| **Speed: initial load** | O(n) scan of all events | O(k) readdir + k file reads (k = subagent count) | Both costs combined |
| **Speed: incremental** | O(1) per new event -- just check agentId | Must re-scan directory for new agents | Both costs |
| **Speed: scaling** | Linear in total events | Linear in subagent count (typically << events) | Sum of both |
| **Accuracy: agent count** | Correct -- every event self-identifies | Correct -- every subagent has a JSONL file | Should agree but can diverge (see FP/FN) |
| **Metadata** | None -- agentId only, no type/description | Rich -- `.meta.json` has agentType + description; filename-based inference for internals | Best of both when wired correctly |
| **SSOT alignment** | Yes -- reads from JSONL files (the invariant says JSONL is source of truth) | Yes -- also reads from filesystem, which IS the JSONL storage | Both aligned |
| **Token aggregation** | Would need per-agent grouping from merged stream | Natural -- events are already partitioned by file | B is cleaner for aggregation |
| **Edge detection** | Cannot determine parent-child without scanning main events for Agent/Task tool_use | Natural -- parent-child via which session spawned which file + description matching | B is better |
| **Maintenance** | Simple -- one loop | More complex -- filesystem + meta parsing + inference | Most complex |

## Recommendation: Filesystem-driven (B) as canonical, with event-driven agentId as validation

### Rationale

1. **Both approaches read JSONL files** -- they are both SSOT-compliant. The `agentId` field in subagent JSONL events comes from the same files the filesystem approach reads. The distinction is whether you discover agents by listing the directory or by scanning event content.

2. **Filesystem approach is richer** -- it provides metadata (agentType, description), natural event partitioning, and correct parent-child relationships. The event-driven approach only gives you an opaque ID string.

3. **Filesystem approach is already the canonical path** -- `loadFullSession()` is the single entry point for session loading. Both `computeMetrics()` and the session detail API use it. The Agent Log already receives `subagentMeta` from this path.

4. **The "4 vs 1" discrepancy is a wiring bug, not an architectural flaw** -- if the Agent Log sees 4 agents but DAG sees 1, it means:
   - The DAG is built from `subagentEvents` Map (filesystem) which found 1 subagent directory
   - The Agent Log is reading `agentId` from merged events where multiple agents self-identified
   - The likely cause: one approach is run on a different session or the filesystem check is failing for some sessions (e.g., wrong path construction)

### What changes are needed to unify

1. **Ensure Agent Log uses DAG nodes as its agent roster** -- `AgentLogs.tsx` already receives `agents: AgentNode[]` from the DAG. It should use this as the authoritative list of agents, not derive a separate list from unique `agentId` values in events.

2. **Ensure merged events preserve agentId** -- Already done. Subagent events carry `agentId`; main events get normalized to `"main"`.

3. **Add a debug assertion** -- When the set of unique `agentId` values from events differs from the set of DAG node IDs, log a warning. This catches future divergence early.

4. **Handle compact/aside_question agents consistently** -- The filesystem approach already catches these. The Agent Log should either show or hide them based on a filter, not count them differently.

## FP Analysis (False Positives = Phantom Agents)

| Scenario | Event-driven | Filesystem-driven |
|----------|-------------|-------------------|
| Agent spawned but produced 0 events | No (never appears in events) | Yes -- JSONL file exists but may be empty. FP rate: ~1-2% (rare) |
| Duplicate agentId across events | No -- same ID groups correctly | N/A |
| Internal agents (compact, aside_question) | Yes if events are included in merged stream without filter | Yes -- they have JSONL files. Both show them. FP depends on whether "phantom" means "not a user-visible agent" |

**Estimated FP rate**: ~2-5% for both approaches if internal agents are unwanted. Zero for both if internal agents are intentionally included.

## FN Analysis (False Negatives = Missed Agents)

| Scenario | Event-driven | Filesystem-driven |
|----------|-------------|-------------------|
| Agent spawned, events exist in subagent file, but not merged into allEvents | **Yes** -- agent invisible. Rate depends on merge bugs | No -- directory listing catches it |
| Main session events (no agentId) | Correctly attributed to "main" | Correctly handled as mainEvents |
| Very short-lived agent (1-2 events) | No -- still carries agentId | No -- still has a JSONL file |
| Agent file created but not yet flushed | No -- events not visible | Yes -- file exists even if empty or partially written |
| Race condition during active streaming | Both approaches may lag -- event-driven waits for next WS batch, filesystem waits for next REST fetch | Similar |

**Estimated FN rate**: <1% for filesystem, ~2-5% for event-driven (depends on merge correctness).

## Implementation Hints

### Key files to modify
- `dashboard/src/components/AgentLogs.tsx` -- Use `agents` prop (from DAG) as authoritative roster. Keep `event.agentId` for per-entry attribution.
- `dashboard/src/components/bottom-panel/AgentLogTab.tsx` -- Ensure it passes DAG agents through.
- `server/src/http/routes/session-routes.ts` -- Add debug logging when event agentIds diverge from DAG node IDs.

### Test strategy
- Unit test: `eventsToLogEntries()` with events that have agentIds not present in the agents array -- should attribute to "unknown" or "main", not create phantom agents.
- Integration test: Load a real session with subagents, verify Agent Log agent count equals DAG node count.

### Files to NOT modify
- `server/src/parser/session-discovery.ts` -- `loadFullSession()` is correct as-is.
- `server/src/analyzer/dag-builder.ts` -- `buildAgentDAG()` is correct as-is.

## Risk Analysis

1. **Breaking existing Agent Log filtering** -- The Agent Log filter tabs derive from `agentType` on entries. If we change the agent roster source, filters may show different options. Low risk -- the data source is already `resolveAgentType()` which checks both DAG and subagentMeta.

2. **Performance regression from debug assertion** -- Computing the set difference of agentIds vs DAG nodes is O(n) in events. Should only run in development mode or be gated behind a flag.

3. **Internal agents appearing in Agent Graph** -- If `compact` and `aside_question` agents are included in the DAG, the graph becomes visually noisy. Consider a filter toggle.

## References

- `server/src/parser/session-discovery.ts:122-184` -- `loadFullSession()` canonical implementation
- `server/src/analyzer/dag-builder.ts:116-183` -- `buildAgentDAG()` canonical implementation
- `dashboard/src/components/AgentLogs.tsx:136-223` -- `eventsToLogEntries()` event-driven approach
- `server/src/http/routes/session-routes.ts:113-144` -- Event merging in session detail route
- Claude Code JSONL format: main file has no `agentId`, subagent files carry `agentId` on every event
- Architecture invariant #1: "JSONL is source of truth" -- both approaches comply since both read JSONL files
