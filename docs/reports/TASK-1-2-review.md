---
task_id: TASK-1-2
title: "Insights M6+M7 — Breakdown + Trends Aggregators"
verdict: APPROVED_WITH_CHANGES
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 4
  p3: 3
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-18T20:12:43Z"
commit: "5456e353c1cbd121aa8616374689e4d3dae4bd62"
---

## Review: TASK-1-2 — Insights M6+M7 Breakdown + Trends Aggregators

### Business Alignment

- [PASS] Breakdown aggregator computes model shares that sum to ~100% — `share: totalCost > 0 ? (stats.cost / totalCost) * 100 : 0` with sum verified by test at `breakdown-aggregator.test.ts:88`
- [PASS] Trends aggregator detects commands from user events with "/" prefix — `extractCommandName()` at `trends-aggregator.ts:70-75` checks `trimmed.startsWith("/")`, splits on whitespace to extract command name
- [PASS] Agent tool invocations detected — `toolName === "Agent"` branch at `trends-aggregator.ts:155-156`, `subagent_type` field preferred over `description`
- [PASS] Skill tool invocations detected — `toolName === "Skill"` branch at `trends-aggregator.ts:157-158`, `skill` field extracted
- [PASS] Linear regression verdict works correctly — `linearRegressionSlope()` at lines 182-192 uses standard OLS formula; `computeVerdict()` at lines 194-201 uses relative slope threshold 5%; "improving" test passes
- [PASS] Breakdown caching uses stat-based invalidation (fileSize + mtime) — `breakdown-aggregator.ts:47`: `cached.fileSize === stat.size && cached.mtime === mtime`
- [FAIL] Trends caching only checks fileSize, missing mtime — `trends-aggregator.ts:106`: `cached.fileSize === stat.size` (no mtime check) — see P2-1 below
- [PASS] Byte-offset reads — breakdown-aggregator delegates to `parseJsonlIncremental()` which uses `openSync`/`readSync` (architecture invariant #2 satisfied); trends-aggregator uses `openSync`/`readSync` directly with `try/finally` fd close
- [PASS] Fail-safe parsing — both aggregators catch per-line JSON errors and skip malformed lines

---

### Build Status

PASS — TypeScript (`npx tsc --noEmit`) reports zero errors. ESLint v9 reports zero warnings on both new files. All 27 breakdown/trends tests pass. All 10 insights-routes tests pass. 31 pre-existing failures in `debug-db.test.ts` and `routes-debug.test.ts` are caused by a missing `better-sqlite3` native binding; they are unrelated to this change (confirmed: `git diff master -- server/src/debug/` shows zero lines changed).

---

### P0 — Blockers

None.

### P1 — Must Fix

None.

### P2 — Should Fix

**P2-1** `trends-aggregator.ts:106` — Cache invalidation missing `mtime`

The cache key only checks `fileSize`. If a JSONL file is rewritten with the same byte count but different content (e.g. replaced by a backup restore), stale data persists indefinitely. `breakdown-aggregator.ts:47` correctly uses both `fileSize` and `mtime`. Fix: add `mtime: number` field to `TrendsSessionData`, populate with `stat.mtimeMs`, and include it in the cache hit check.

**P2-2** `trends-aggregator.ts:108-111` — Truncation not guarded before copying prior state

When `cached` exists but `stat.size < cached.fileSize` (file was truncated/replaced), the code still does `const commands = cached ? [...cached.commands] : []`, then `readJsonlEvents` returns empty at line 43 because `fromOffset >= fileSize`. Result: stale accumulated entries persist silently. `breakdown-aggregator.ts:52` guards this with `useIncremental = cached.fileSize < stat.size`. Fix: add the same guard here — only use cached entries for the incremental path; do a full re-parse when the file shrank.

**P2-3** `trends-aggregator.ts:38-65` — Duplicate JSONL reading implementation

`readJsonlEvents()` reimplements byte-offset JSONL reading that already exists in `parseJsonlIncremental()` (used by breakdown-aggregator). Two implementations of the same logic with subtle differences: the local version does not call `isRelevantEvent` and does not log skipped malformed lines via `parserLog`. Fix: replace `readJsonlEvents` and its usages with a call to `parseJsonlIncremental`, casting the events to `RawEvent[]`. This eliminates duplication and ensures architectural consistency.

**P2-4** `trends-aggregator.ts:152` — Unsafe `as string` cast on tool item name

`const toolName = toolItem.name as string;` — all other property accesses on `toolItem` are guarded with `typeof` checks, but `name` is not. If `name` is absent or non-string, `toolName === "Agent"` / `toolName === "Skill"` will still fail safely, but `extractAgentName(input)` will receive garbage. Low risk, but inconsistent with the surrounding defensive pattern. Fix: add `typeof toolItem.name === "string"` guard before the comparisons.

---

### P3 — Optional

**P3-1** `trends-aggregator.ts:283-284` — Spread on large arrays for min/max

```typescript
const earliestMs = Math.min(...sessionTimes);
const latestMs = Math.max(...sessionTimes);
```

Spread into `Math.min/max` overflows the call stack at ~100k arguments. Use `reduce` instead:
```typescript
const earliestMs = sessionTimes.reduce((a, b) => Math.min(a, b), Infinity);
const latestMs = sessionTimes.reduce((a, b) => Math.max(a, b), -Infinity);
```

**P3-2** Both module-level caches (`breakdownCache`, `trendsSessionCache`) have no eviction. Sessions deleted from disk leave stale entries until server restart. Acceptable for now given server process lifetimes, but worth a note for future LRU or TTL eviction.

**P3-3** `breakdown-aggregator.test.ts:83` — Test name spells model as `"claude-haiku-4-5-20251001"` which is the correct string ID but unusual to see in a test constant. Not a bug, but a reader-clarity issue.

---

## TASK-1: Breakdown Aggregator

**Verdict: APPROVED**

Types in `server/src/types.ts` (lines 313-344) match the plan spec exactly. `computeInsightsBreakdown` correctly aggregates per-model tokens and cost, computes proportional shares summing to 100%, groups sessions by `cwd` for top-repos, builds session labels as `repoName · date`, and limits topRepos/topSessions/topTools to 5/5/10. Caching uses both `fileSize` and `mtime` for correct stat-based invalidation. Delegates to `parseJsonlIncremental` (architecture invariant #2 compliant). All 8 unit tests cover empty input, aggregation, proportional shares, tool counting, ranking, time-range filtering, repo filtering, and repo aggregation. No P0/P1 issues found.

Issues: None beyond pre-existing test infrastructure failures (debug-db, out of scope).

---

## TASK-2: Trends Aggregator

**Verdict: APPROVED WITH CHANGES**

`computeInsightsTrends` correctly detects `/` commands from external user events, Agent tool invocations (preferring `subagent_type`), and Skill tool invocations. The linear regression implementation is mathematically correct (standard OLS) and the verdict threshold (±5% relative slope) is reasonable. The weekly bucket structure is correct. All 9 unit tests pass including the improving-trend regression test. Session-level caching with `openSync`/`readSync` follows architecture invariant #2.

Issues: P2-1 (missing mtime in cache), P2-2 (truncation not guarded), P2-3 (duplicate JSONL reader), P2-4 (unsafe name cast); plus three P3s. All four P2s can be resolved in a single fix: switch `computeTrendsSessionData` to use `parseJsonlIncremental` (eliminating the duplicate reader), add `mtime` to the cache struct, and add the `fileSize < cached.fileSize` incremental guard.

---

### Summary

TASK-1 is clean and production-ready. TASK-2 has four P2 issues, all traceable to a single root cause: the session-level cache for trends was written independently from the breakdown cache instead of following the established pattern. Switching to `parseJsonlIncremental` and aligning the invalidation logic would resolve all four in one pass. No security, data-integrity, or performance regressions in either task.
