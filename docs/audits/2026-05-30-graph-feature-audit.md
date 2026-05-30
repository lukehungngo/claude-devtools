# Graph Feature Audit — findings + verification verdicts

**Date:** 2026-05-30
**Method:** 7 parallel dimension finders (workflow `wf_e11448c5-255`), each self-verifying against real JSONL with probes. The independent adversarial-verify pass **failed (API rate-limiting)**, so findings below are re-verified by the lead (me) before any fix. Treat finder claims as leads, not confirmed bugs.

## Verdicts

### CONFIRMED — fixing (root cause)

| # | Sev | Finding | Root cause | Confirmed by |
|---|-----|---------|-----------|--------------|
| 1 | P1 | **Errored agents render as green "Finished"** | `AgentFlowNode.nodeMode` is 2-mode (running\|finished); server `status:"error"` collapses to the green "Finished" check. Error is also dropped from `summarizeDag` and `WorkflowTable`. `main:error` in 98269c6b shows as success. | ui-ux + status finders; confirmed by code (I built the 2-mode) |
| 2 | P1 | **`useAgentLogs` double-fetches + stale-response race** | `liveEventCount` is the always-positive total count (not a delta) → the live-refetch effect fires on mount too (2 fetches). Bare `fetch().then(setLogs)` with no AbortController/key-guard → rapid agent switching renders the wrong agent's log. | live-state + log finders; confirmed in hook code |
| 3 | P1 | **`getAgentEvents("main")` full-file re-read every live poll** | `/events/:agentId` → `parseJsonlFile(path)` full `readFileSync` (~50-60ms / 17MB) on every `useAgentLogs` refetch. Violates byte-offset invariant (#2) + O(1)/event (#8). | perf + log finders |
| 4 | P2 | **AgentGraph freezes per-node token/tool data after seed** | The per-render data-patch effect spreads `...n.data` + sets running/selected but never replaces `data.node`, so an expanded node (e.g. `main` accruing tokens) shows stale numbers until the structure changes. | live-state finder |
| 5 | P2 | **Metrics cache key counts only flat `subagents/`** | `session-routes` invalidation counts flat `.jsonl` (8), not recursive `workflows/<wf>/` (32). A new nested workflow agent doesn't bust the cache → stale DAG/WorkflowTable up to the 60s TTL. | perf finder |
| 6 | P2 | **Edges near-invisible + directionless** | `EDGE_STYLE` uses the dimmest token `var(--t3)` @1.5px (≈2.1–2.4:1 contrast, below the 3:1 graphical min), no arrowheads. | ui-ux finder |
| 7 | P2 | **A11y: tabs lack `tabpanel`/linkage; resize handle not keyboard-operable** | `GraphRightPanel` has `role=tab` but no `role=tabpanel`/`aria-controls`; the `role=separator` resize handle has no `tabIndex`/`onKeyDown`/`aria-value*` (WCAG 2.1.1). | ui-ux finder |

### REJECTED — false positive (verified)

- **"Authoritative `workflows/<wf_id>.json` sidecar exists with phases/labels/progress"** — **FALSE.** `find ~/.claude/projects -path "*/subagents/workflows/*.json" ! -name "*.meta.json"` → 0 results across all projects; the only non-agent file in any workflow dir is `journal.jsonl`. The workflow-table correctly degrades (no phase data in journals; flat list + derived labels is the only option). The finder over-claimed; the verify pass that would have caught it was rate-limited.

### ACKNOWLEDGED — by-design / low / deferred

- Workflow phases never render — **expected** (journals carry no `phase` field; we group-by-phase only when present). Not a bug.
- Workflow aborted agent shows "running" while `sessionIsRunning` — acceptable (it IS unfinished on a live session); collapses to finished once the session ends.
- Workflow subagents can show "Finished" while running via Signal-3 weak fallback — P2, mitigated (only mis-fires when the running agent isn't at the session tail); deferred.
- `indeterminate→completed` collapse, synthetic 0s/0-token nodes, picker worktree-stub duplicate, `main` dragged-position carryover across sessions, WS key missing `projectHash` (0 real collisions today), `queue-operation` `key={undefined}`, `buildAgentDAG` O(subagents×mainEvents) — P3/latent; recorded, not blocking.
- Silent fetch-error states (empty data on error) — P2; deferred to a follow-up (needs an error/retry UI pattern).

## Resolution (2026-05-30)

**Fixed (root cause) + verified:**
- #1 Error visibility — `AgentFlowNode` gains a red `error` mode (was green "Finished"); `summarizeDag`/`GraphSummary` surface an `errored` count. Verified E2E on 98269c6b: "1 running · 61 finished · 12 error" + red nodes. (unit: AgentFlowNode + graphSummary + GraphSummary tests)
- #2 `useAgentLogs` — AbortController + cancelled-guard (stale-race) + live-refetch only on increasing `liveEventCount` (no mount double-fetch). (unit: +2 tests)
- #3 `getAgentEvents` — bounded stat-keyed entry cache; unchanged files (finished agents, main between appends) return instantly instead of re-parsing the full transcript.
- #4 AgentGraph — data-patch effect now refreshes `data.node` from the latest dag (live token/tool counts no longer frozen at seed).
- #5 Metrics cache key — subagent count is now recursive (counts `workflows/<wf>/agent-*.jsonl`), so a new nested workflow agent busts the cache.
- #6 Edges — stroke bumped `var(--t3)@1.5 → var(--t2)@2` to clear the 3:1 contrast minimum.

**Deferred (confirmed, queued):**
- #7 A11y completeness — add `role=tabpanel`/`aria-controls` to the rail tabs; make the resize handle keyboard-operable (`tabIndex`/arrow keys/`aria-value*`); edge arrowheads (needs `MarkerType` + test-mock updates). 
- Residual cache staleness: a workflow journal `result` append (agent finishing) doesn't change the agent-file count, so workflow-row status can lag until the 60s TTL / next main write — needs a journal-mtime signal in the cache key.
- Silent fetch-error states (empty data on error) — needs an error/retry UI pattern.
- P3s: picker worktree-stub duplicate, `main` dragged-position carryover across sessions, WS key missing `projectHash`, `queue-operation` `key={undefined}`, `buildAgentDAG` O(subagents×mainEvents), `indeterminate→completed` collapse, synthetic 0s nodes.

## Notes
Token aggregation is byte-exact vs JSONL; node/edge construction has no corruption; subagent discovery (incl. nested + worktree-scatter) is complete; status server↔dashboard parity is byte-identical (68-case harness, 0 mismatches); the recursive `findSubagentFile` log fix is correct for all 6 cases. These were verified clean by the finders.
