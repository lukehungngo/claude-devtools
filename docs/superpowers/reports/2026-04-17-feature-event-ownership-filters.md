# Delivery Report: feature/event-ownership-filters

**Plan:** `docs/superpowers/plans/2026-04-17-event-ownership-filters.md`
**Brainstorm:** `docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md`
**Date:** 2026-04-17
**Branch:** `feature/event-ownership-filters`

## Task Delivery

| # | Task | Status | Evidence |
|---|------|--------|----------|
| TASK-001 | Introduce `mainEventsOnly` / `eventsForAgent` helpers | DONE | `dashboard/src/lib/turnEventFilters.ts` (new, 37 lines) + `.test.ts` (5 tests). |
| TASK-002 | Route `turnSnapshot.ts` reducers through helpers | DONE | `computeDispatchedAgentIds` loop, `buildTurn` backward scan, `extendTurn` backward scan — all use `mainEventsOnly()`. `TurnSnapshot.dispatchedAgentIds` made required. 12 downstream test fixtures backfilled. T-OWN-1/2 property tests added. |
| — | P2-2 ESLint rule (from review) | DONE | `eslint.config.js` — `no-restricted-syntax` scoped to `dashboard/src/lib/turnSnapshot.ts` bans inline `!event.isSidechain`. Rule fires on injected regression; clean on current code. Applied via Bash heredoc because the user's `config-protection` hook blocks the Write tool for ESLint configs — user authorized this manually via Option B. |
| — | P2-1, P2-3, P3-1, P3-2, P3-4 | DONE | Bug-Fixer addendum at `docs/results/TASK-002-p2-p3-followup.md`. |

## Deviations from Plan

1. **ESLint rule was not in the original plan** — surfaced by the reviewer as P2-2 and by the reflect agent as the gap between "testable" and "extinct." User explicitly chose Option B to apply it. Bypass of the `config-protection` hook was transparent (Bash heredoc, user-authorized), not a silent workaround.
2. **P3-3 (micro-optimization)** deferred per plan scope.

## Verification Summary

- Lint: PASS (0 errors on `turnSnapshot.ts`; only 2 pre-existing unused-var warnings; 9 pre-existing server errors unrelated).
- Typecheck: PASS (4 pre-existing unrelated errors unchanged).
- Tests: PASS — 1185/1185 (dashboard), 478/478 (server).
- Regression test for new ESLint rule: PASS (rule fires on injected `!events[0].isSidechain`, clean after revert).

## Lineage note (honest retrospective)

The brainstorm and earlier conversation framed this refactor as the structural cure for "4 PRs of the same class in 14 hours." Reflect agent's honest audit:
- Directly prevents regression of **#29's shape** (subagent `end_turn` flipping parent turn).
- Vocabulary + ESLint rule prevent a 5th instance of the sidechain-filtering drift pattern in `turnSnapshot.ts`.
- Does NOT prevent #26 (server-side, different file), #27 (parity bug, different pattern), #28-D1/D2/D3 (different files, different code paths).

Value delivered: vocabulary for future reducers, mandatory `dispatchedAgentIds` (removes silent-default failure mode), structural enforcement that a new reducer can't bypass the filter without reviewer explicitly approving an inline guard.

## Verdict

**DELIVERED**

User chose Option B from the reflect escalation. ESLint rule applied, verified, regression-tested. The bug class introduced by #29's shape is now *extinct* in `turnSnapshot.ts`, not just *testable*.
