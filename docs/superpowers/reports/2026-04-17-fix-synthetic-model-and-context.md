# Bug Fix Report: fix/synthetic-model-and-context

**Plan:** `docs/superpowers/plans/2026-04-17-synthetic-model-and-context.md`
**Date:** 2026-04-17
**Branch:** `fix/synthetic-model-and-context`

## Bug

In the TopBar HUD for session `df0c5a8d-acf8-49e4-b2a0-212c8829461d`:
1. `MODEL` field displayed `<synthetic>` instead of the real model (e.g. `Opus 4.6`).
2. `CONTEXT` field showed a wrong percent because the context window was looked up from the wrong model.

User clarification: model should be the current model the user set; context depends on the model (1M vs 200k).

## Root Cause

1. Claude Code writes synthetic client-injected assistant events with `"model":"<synthetic>"` and a zeroed `usage` object. `computeMetrics` (`server/src/analyzer/metrics.ts`) guarded only on `if (!usage) continue`, so these events passed the guard and `<synthetic>` was added to `models`/`tokensByModel`/`tokensByTurn`. `TopBar.tsx:65` picked the last model from that list.
2. `primaryModel = Array.from(models)[0]` returned the FIRST model inserted, not the one tied to the latest assistant event that produced `lastInputTokens`. So `getContextWindowSize` looked up the wrong window when the real current model differed from the earliest one.

## Fix Applied

Planned-scope changes:
- `server/src/analyzer/metrics.ts` — skip any assistant event whose `message.model` starts with `<`; track `lastRealModel` alongside `lastInputTokens`; use `lastRealModel ?? Array.from(models)[0] ?? "claude-sonnet-4-6"` as fallback primary model for context-window lookup. `sdkContextWindow` priority preserved.
- `dashboard/src/components/TopBar.tsx` — defensive filter `modelsList.filter((m) => !m.startsWith("<"))` before picking the last model for display.

Reviewer-surfaced P3 extensions (same bug class in other surfaces):
- `server/src/analyzer/dag-builder.ts` — don't set `lastModel` to a pseudo-model (`AgentNode.model` feeds `AgentNodeCard`).
- `dashboard/src/components/panels/SettingsPanel.tsx` — same defensive filter before reading `metrics.models[0]`.

## Review Verdict

**APPROVED WITH CHANGES** (two P3 observations, both addressed in this branch).

Reviewer notes captured in `docs/reports/bugfix-review.md`.

## Verification

- **Lint:** N/A (no standalone lint step; ESLint runs via editor/hooks).
- **Server typecheck:** PASS (`npx tsc --noEmit` clean).
- **Dashboard typecheck:** PASS for this fix's surface. 4 pre-existing errors in unrelated test files verified unchanged by this fix.
- **Server tests:** PASS (478/478, 40 files). Two new reproduction tests included and passing.
- **Dashboard tests:** PASS (1156/1156, 106 files). One new reproduction test included and passing.
- **Reproduction tests:** cover (a) `<synthetic>` exclusion from `models` and `tokensByModel`, (b) context window uses the last real model (opus 1M → 1M window → 50% for 500k tokens), (c) TopBar does not render `<synthetic>` when the models list contains it.

## Verdict

**FIXED**

Both user-visible symptoms resolved at the source plus two adjacent surfaces, with regression tests to prevent recurrence. See `docs/reports/verification-fix-synthetic-model-and-context.md` for the full verification trace.
