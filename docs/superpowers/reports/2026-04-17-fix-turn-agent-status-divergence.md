# Bug Fix Report: fix/turn-agent-status-divergence

**Plan:** `docs/superpowers/plans/2026-04-17-turn-agent-status-divergence.md`
**Brainstorm:** `docs/brainstorms/2026-04-17-turn-agent-status-divergence.md`
**Date:** 2026-04-17
**Branch:** `fix/turn-agent-status-divergence`

## Bug

`TurnCard` footer rendered "Completed ✓" while agent pills within the SAME turn showed a pulsing "running" dot. Two contradictory statuses for the same turn at the same moment.

User quote: "the conversation turn show completed, but i know it's not and in the same time agent status is running. and why the fuck on earth that we have this mistake over and over and over again".

## Root Cause

In `dashboard/src/lib/turnSnapshot.ts`, two paths produce status: `groupEventsIntoTurns` (full rebuild) and `extendTurn` (streaming fast path). The full rebuild path called `finalizeTurn` for every completed turn, which force-syncs any running agent to completed. The streaming path never called `finalizeTurn`. During live streaming, the turn could flip to "completed" while one or more agents still registered as "running" because their last recorded assistant event didn't have `stop_reason === "end_turn"`.

This is the same class of bug documented in P0 lessons 2026-04-12 and 2026-04-15: independent status derivations that drift between paths. Each prior fix patched one derivation. The brainstorm (`docs/brainstorms/2026-04-17-turn-agent-status-divergence.md`) decomposed why the bug keeps recurring and proposed a narrow fix (this PR) plus a structural fix (separate `/mas:dev-loop` follow-up).

## Fix Applied

- `dashboard/src/lib/turnSnapshot.ts`: call `finalizeTurn(turn)` at the end of both `buildTurn` and `extendTurn` when `turn.status === "completed"`. Kept the existing finalize loop in `groupEventsIntoTurns` (now idempotent and defensive).
- `dashboard/src/lib/turnSnapshot.test.ts`: three new regression tests:
  1. Main agent finalization when `end_turn` arrives via delta.
  2. Multi-subagent concurrent `end_turn` → turn completes → main force-synced by finalize.
  3. Structural invariant: full-rebuild output matches incremental output for the same stream, for both `turn.status` and every `agent.status`.

Test 3 is the structural guard — any future drift between `extendTurn` and `groupEventsIntoTurns` for status derivation will fail this test.

## Review Verdict

APPROVED WITH CHANGES — 0 P0, 0 P1, 1 P2, 2 P3. All addressed in-branch:
- P2: Original Test B duplicated Test C. Replaced with a distinct multi-subagent scenario that exercises `finalizeTurn` via main-agent completion when concurrent subagents have ended.
- P3: Test B docstring corrected.
- P3: 3-line code comment above the new `finalizeTurn(turn)` call in `extendTurn` explaining the streaming-path invariant.

Full review: `docs/reports/bugfix-review.md`.

## Verification

- **Lint:** N/A (no standalone lint; ESLint runs via editor/hooks).
- **Dashboard typecheck:** PASS for this fix's surface. 4 pre-existing unrelated errors unchanged.
- **Dashboard tests:** PASS — 1159/1159 (106 files), including 3 new regression tests.
- **Server:** untouched.
- **Failing-revert confirmed:** Bug-Fixer reverted the `finalizeTurn` call in `extendTurn` locally — Test A and new Test B failed for the right reason. Restoring the fix → green.

## Verdict

**FIXED**

Narrow fix closes the user-visible divergence. Structural `deriveStatus` refactor (brainstorm option 2) remains recommended as a follow-up `/mas:dev-loop` to stop this class of bug from recurring next quarter.

See `docs/reports/verification-fix-turn-agent-status-divergence.md` for the full verification trace.
