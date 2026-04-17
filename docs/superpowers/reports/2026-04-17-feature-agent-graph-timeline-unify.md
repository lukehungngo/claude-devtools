# Delivery Report: feature/agent-graph-timeline-unify

**Plan:** `docs/superpowers/plans/2026-04-17-agent-graph-timeline-unify.md`
**Brainstorm:** `docs/brainstorms/2026-04-17-agent-graph-timeline-bounds.md`
**Date:** 2026-04-17
**Branch:** `feature/agent-graph-timeline-unify`

## Task Delivery

| # | Task (from plan) | Status | Evidence |
|---|------------------|--------|----------|
| TASK-001 | Timeline convex hull + main endTime override | DONE | `TraceTab.tsx:100-118` (convex hull) + `filterDagForTurn.ts:29-55, 93-108` (main endTime widened via groupEnvelope). Tests: T-TIMELINE-1/2/3, T-FILTER-1/2/3/4/5. |
| TASK-002 | Turn membership by dispatch, not timestamp | DONE | `turnSnapshot.ts:158-217` (`computeDispatchedAgentIds` helper with seed + parallel-dispatch guard); `buildTurn`/`extendTurn` filter `agentMap` by dispatched set. Tests: T-DISPATCH-1/2/3/4/5/6. |
| TASK-003 | Dev-mode bar clip warning | DONE | `TraceTab.tsx:181-214` (dev-only `console.warn` with diagnostic fields; clipping unchanged in production). Tests: T-WARN-1/2/3. |

## Review + Reflect Cycle

- **Cross-task reviewer verdict:** APPROVED WITH CHANGES (0 P0, 0 P1, 2 P2 on TASK-002, multiple P3). Report: `docs/reports/reviewer-report.md`.
- **Per-task verdicts:** TASK-001 APPROVED, TASK-002 APPROVED WITH CHANGES, TASK-003 APPROVED.
- **P2 fix cycle:** Dispatched Bug-Fixer for P2-1 (`extendTurn` streaming cost regression) and P2-3 (`filterDagForTurn` memo missed endTime changes). Both fixed in `turnSnapshot.ts` (inherited seed) and `filterDagForTurn.ts` (envelope computed before memo). +4 new tests (T-DISPATCH-5/6, T-FILTER-4/5).
- **Reflect verdict:** PROCEED — all 4 requirements from the brainstorm (D1/D2/D3 + silent-clipping hazard) covered; scope clean; lineage consistent with prior `finalizeTurn` invariant work. Report: `docs/reports/reflect-report.md`.

## Deviations from Plan

1. **Deleted obsolete `TraceTab.test.ts`** (TASK-001): file encoded the pre-fix main-only timeline behavior. Justified by git archaeology in the reviewer report.
2. **Subagent-only envelope** in `filterDagForTurn` (TASK-001): Plan said "filtered nodes" but engineer correctly used subagents only. Main's original endTime on the input DAG is session-wide (from the server-side DAG builder), so including main would defeat turn scoping.
3. **9 existing `turnSnapshot.test.ts` fixtures** updated (TASK-002): added matching Task dispatches to make the filter pass. Assertions unchanged. Documented in TASK-002 result file.
4. **P2 addendum added `dispatchedAgentIds?: Set<string>` field to `TurnSnapshot`**: needed to carry the dispatched set forward through the streaming path efficiently. Type widening is optional so no consumer is forced to change.

## Verification Summary

- **Lint:** N/A (ESLint via editor/hooks; no lint step in project verification block).
- **Dashboard typecheck:** PASS (4 pre-existing unrelated errors in `useUsage.test.ts` and `globals.test.ts` only).
- **Server typecheck:** PASS.
- **Dashboard tests:** PASS — 1174/1174 (105 files), +15 net new.
- **Server tests:** PASS — 478/478 (40 files).

## Follow-ups (non-blocking, surfaced for orchestrator)

1. **P2-2** — `turnSnapshot.ts` status-derivation loop at lines ~376-387 still scans all events (including non-dispatched sidechain) for last `end_turn`. Defer per plan; fix in next iteration.
2. **P3-3** — Add integration test that wires a multi-turn session with prior-turn leakage through the full pipeline (group → filter → timeline → barPosition) to assert the turn-9 scenario end-to-end.
3. **P3-4** — `docs/brainstorms/2026-04-17-agent-graph-timeline-bounds.md` is present on disk but was untracked on master. Now committed to this branch.
4. **P3-2** — Dev-mode warning when temporal-proximity fallback fails to bind, so drift toward slower subagent spin-up surfaces before silent misses.

## Verdict

**DELIVERED**

Three focused tasks close all three defects from the brainstorm plus the silent-clipping hazard. For turn 9 of session `de81c175-796c-483f-877c-d81ccac9029d`, the code will now render main's row as a full-width bar spanning the real ~22-min turn, exclude the 2 pre-turn subagents that used to leak in, render the 2 in-turn subagents at correct proportional widths (~27% and ~21%), and show 8 ticks across the true wall-clock span instead of `0m..1m`.
