---
task_id: TASK-token-cache-split
title: "Token cache accounting fix — double-counting in insights aggregators"
verdict: APPROVED
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 0
  p3: 0
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-19T19:46:33Z"
commit: "b12bff897ee5f33e92953ff27d7d5e1bbcb45429"
---

## Review: TASK-token-cache-split — Token cache accounting fix

### Business Alignment

- [PASS] P1 from previous review is resolved — `insights-aggregator.ts` no longer passes `inTok` (bare+cacheRead+cacheWrite) as `inputTokens` to `calculateTokenCost()`. It now passes `bareIn` (bare input tokens only), eliminating the double-charge.
- [PASS] `insights-model-mix.ts` received the same correction — `inputTokens: usage.input_tokens || 0` (bare only) passed to cost calculator, while `inTok` (sum of all) is used for the display metric only.
- [PASS] `tokensIn` display field correctly reflects total tokens processed (bare + cache_read + cache_creation) in both files — matches the established convention from `computeMetrics()`.
- [PASS] No architecture invariants violated — server-side metrics, incremental JSONL parsing, fail-safe error handling all preserved.

### Build Status

PASS

- Server TypeScript: 0 errors (`server/node_modules/.bin/tsc --noEmit`)
- Dashboard TypeScript: 0 errors (`dashboard/node_modules/.bin/tsc --noEmit`)
- Server tests: 607 passed, 31 failed — all 31 failures are pre-existing (debug-db.test.ts, routes-debug.test.ts, routes-lifecycle-storage.test.ts; confirmed by stash comparison against parent commit which shows same 31 failures)
- Dashboard tests: 1387 passed, 1 failed — TurnCard.test.tsx failure is pre-existing (confirmed by stash comparison)
- ESLint: binary not present in worktree node_modules (pre-existing worktree environment issue). Diff is 7 lines across 2 server files; no ESLint-relevant patterns introduced (no `any`, no `console.log`, no `==`, no non-null assertions)
- Insights-specific tests: 23/23 passed (`insights-aggregator.test.ts` + `insights-model-mix.test.ts`)
- Net new passing tests: +3 server tests compared to parent commit (607 vs 604 before fix)

### P0 — Blockers

None.

### P1 — Must Fix

None. The previous review's P1 (double-counting of cache tokens in cost calculation) is resolved.

### P2 — Should Fix

None.

### P3 — Optional

None.

### Verdict

APPROVED

### Summary

The fix correctly addresses the P1 double-counting bug in both `insights-aggregator.ts` and `insights-model-mix.ts`. Both files now split `usage.input_tokens` (bare) from cache tokens — using the bare value for cost calculation via `calculateTokenCost()` and the summed total for the display `tokensIn` metric. TypeScript is clean, all 23 insights-specific tests pass, and no pre-existing test failures were introduced or unmasked by the change.
