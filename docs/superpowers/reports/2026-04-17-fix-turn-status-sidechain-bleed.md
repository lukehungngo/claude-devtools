# Bug Fix Report: fix/turn-status-sidechain-bleed

**Plan:** `docs/superpowers/plans/2026-04-17-turn-status-sidechain-bleed.md`
**Brainstorm:** `docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md`
**Date:** 2026-04-17
**Branch:** `fix/turn-status-sidechain-bleed`

## Bug

"i always see the last turn state is completed, it's always like that" — the currently-running turn renders "Completed ✓" in its footer during live multi-agent sessions even though main agent is still working. Secondary: a prior-turn subagent's late `end_turn` event can flip a later turn to completed.

## Root Cause

Two reducer loops in `dashboard/src/lib/turnSnapshot.ts` (`buildTurn` and `extendTurn`) scanned the merged main+sidechain event stream backward for the "last assistant event" and checked its `stop_reason`. Neither filtered by `isSidechain`. Subagents emit `stop_reason: "end_turn"` when they finish — landing in the stream and flipping parent turn status to completed.

This is the deferred P2-2 from PR #28. Same "multiple derivations of one fact" class as prior fixes.

## Fix Applied

- `dashboard/src/lib/turnSnapshot.ts` — two lines: add `&& !events[i].isSidechain` to the backward-scan guard in both `buildTurn` and `extendTurn`. Comment updates to reflect the new filter.
- `dashboard/src/lib/turnSnapshot.test.ts` — new `describe("Turn status ignores subagent end_turn")` block with 4 regression tests plus a local `markSidechain()` helper (needed because `makeAssistantEvent` factory doesn't propagate `isSidechain` override; modifying the factory was out of scope per the Bug-Fixer's scope discipline).

Left intact per plan:
- `adjustStatusForSubagents`, `finalizeTurn` — orthogonal, still correct.
- `computeDispatchedAgentIds` from PR #28 — orthogonal, still correct. T-4 confirms this fix and PR #28's filter are independently necessary.
- Per-agent status derivation (lines 284-289, 453-460) — uses each agent's own `lastEvent`, correctly per-ownership.
- `turn_duration` system-event scanner — system events only emitted for parent turn.

## Review Verdict

**APPROVED** (0 P0, 0 P1, 1 P2). The P2 is the deferred structural `mainEventsOnly(events)` helper — intentionally out of scope for this narrow fix; recommended as a separate `/mas:dev-loop`.

Review report: `docs/reports/bugfix-review.md`.

## Verification

- **Lint:** N/A (no lint step in project verification block; ESLint via editor/hooks).
- **Dashboard typecheck:** PASS for this fix's surface. 4 pre-existing unrelated errors unchanged.
- **Dashboard tests:** PASS — 1178/1178 (105 files). +4 new regression tests.
- **Server:** untouched.
- **Reproduction tests:** T-TURNSTATUS-1/3/4 all failed pre-fix (`expected 'running', received 'completed'`), pass post-fix. T-2 guards that main's own end_turn still wins.

## Verdict

**FIXED**

Closes the user-visible bug. The class-of-bug cure ("every reducer must filter by ownership") is proposed as a follow-up structural dev-loop per the brainstorm.
