# Bug K: Context-window % was a hardcoded model-name guess (correct by luck)

**Severity:** P1 — every TopBar context-% display for sessions without a live SDK `result` event was computed from a static per-model lookup table. The number happened to be right when the user's model + tier matched the table's assumption; it was wrong by design for every other combination, with no signal to the user that it was a guess.
**Filed:** 2026-05-17
**Detected:** code-audit of `server/src/analyzer/metrics.ts` + `dashboard/src/lib/cost.ts` while verifying the Bug-G/H/I display chain after the 0.3.12 dashboard regression fix.

## Symptom

TopBar showed e.g. "47%" of context used. That percentage is `lastInputTokens / contextWindowSize`. `contextWindowSize` came from:

```ts
// server/src/analyzer/metrics.ts (pre-fix)
function getContextWindowSize(model: string): number {
  const cached = getModelContextWindow(model);                              // (1) persistent SDK cache
  if (cached !== undefined) return cached;
  if (model.includes("1m") || model.includes("1M")) return ONE_MILLION_CONTEXT; // (2) substring heuristic
  for (const [key, size] of Object.entries(FALLBACK_CONTEXT_WINDOW_SIZES)) { // (3) static per-model map
    if (model.includes(key)) return size;
  }
  return DEFAULT_CONTEXT_WINDOW;                                            // (4) 200K default
}
```

The same shape lived in `dashboard/src/lib/cost.ts` (steps 2-4 only — dashboard has no SDK cache).

The `FALLBACK_CONTEXT_WINDOW_SIZES` map encoded:

```ts
{ "claude-opus-4-7": 1_000_000,
  "claude-opus-4-6":   200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5":  200_000 }
```

i.e. "every Opus 4.7 session uses the 1M tier, everything else 200K". That's a project-wide policy bet, not a fact about any individual session. Any 200K-tier Opus 4.7 user would see `47%` reported as `9%` (47K / 1M instead of 47K / 200K). Any future model not in the table would silently fall to the 200K default — wrong for any extended-context model that ships after this table was last edited.

## Empirical evidence

### The persistent cache is empty in practice

```bash
$ ls -la ~/.claude/devtools/model-context-window.json
ls: ~/.claude/devtools/model-context-window.json: No such file or directory
```

The cache only gets populated by `updateModelContextWindows()` in `server/src/cache/model-context-cache.ts`, which is invoked from the SDK `result` event handler. Users who never launch a session via the in-dashboard SDK path (the vast majority — they tail JSONL written by Claude Code CLI) never produce a `result` event in our process, so the cache file is never created. Step (1) of the lookup is dead in the common case. The visible behavior is entirely steps (2)-(4).

### The "1m" substring heuristic never fires for CC daemon model names

Claude Code CLI sets `model` to the model id as returned by Anthropic, e.g. `claude-opus-4-7`, `claude-sonnet-4-6`. There is no `[1m]` suffix in JSONL output. The substring heuristic was a remnant of an older SDK path and matches nothing in real JSONL sessions.

### The hardcoded map "works by luck" for the current author's tier

JSONL session `~/.claude/projects/-Users-soh-working-ai-claude-devtools/23ba0306-1ae7-4890-b6bc-08c5c49ace13.jsonl`:

- `model`: `claude-opus-4-7`
- max observed `(input_tokens + cache_read_input_tokens + cache_creation_input_tokens)` across assistant events: **999,644**

The static map happened to return `1_000_000` for `claude-opus-4-7`. This session genuinely IS on the 1M tier — proven by the 999K observation that the 200K tier could not have served. The map was right, but right by coincidence: the same map would mis-report a different user's 200K-tier Opus 4.7 session, and a different model name would fall through to the wrong default.

## Root cause

`FALLBACK_CONTEXT_WINDOW_SIZES` conflated "model identity" with "context tier". Those are independent: the same model id can be served from either the 200K or the 1M tier depending on the calling account's entitlements and SDK options. Encoding a per-model default is a guess, not a fact. The "1m" substring path was a similarly fragile model-name guess that never fired against real CC output.

## Source-of-truth hierarchy (post-fix)

In order of authority:

1. **SDK live `result.modelUsage[model].contextWindow`** — passed in as `sdkContextWindow` when the session was launched via our in-dashboard `query()` iterator. Authoritative when present.
2. **Persistent cache** (`server/src/cache/model-context-cache.ts`, server only) — populated by past SDK `result` events for this model. Survives across server restarts. Authoritative when present.
3. **Observation-derived** — `max(input_tokens + cache_read + cache_create)` across the session's assistant events, bucketed to known Anthropic ceilings (200K vs 1M). Universal, per-session, no model-name string matching. A hard LOWER BOUND on the true window: a single observation above 200K proves the session is on the 1M tier.
4. **`DEFAULT_CONTEXT_WINDOW = 200_000`** — safe default when no assistant events have been observed yet (empty session, parser still warming up).

## Fix

New helper `server/src/analyzer/contextWindow.ts` + dashboard mirror `dashboard/src/lib/contextWindow.ts`:

```ts
export function deriveObservedContextWindow(events: readonly SessionEvent[]): number {
  let max = 0;
  for (const evt of events) {
    if (evt.type !== "assistant") continue;
    const u = evt.message?.usage;
    if (!u) continue;
    const sum = (u.input_tokens ?? 0)
              + (u.cache_read_input_tokens ?? 0)
              + (u.cache_creation_input_tokens ?? 0);
    if (sum > max) max = sum;
  }
  if (max > 200_000) return 1_000_000;
  return 200_000;
}
```

`server/src/analyzer/metrics.ts:39-50` and `dashboard/src/lib/cost.ts:35-44` rewired:

```diff
-function getContextWindowSize(model: string): number {
+function getContextWindowSize(model: string, observedEvents: readonly SessionEvent[]): number {
   const cached = getModelContextWindow(model);          // server only
   if (cached !== undefined) return cached;
-  if (model.includes("1m") || model.includes("1M")) return ONE_MILLION_CONTEXT;
-  for (const [key, size] of Object.entries(FALLBACK_CONTEXT_WINDOW_SIZES)) {
-    if (model.includes(key)) return size;
-  }
-  return DEFAULT_CONTEXT_WINDOW;
+  return deriveObservedContextWindow(observedEvents);
}
```

Call sites pass the session's event array (already in scope as `allEvents` in `metrics.ts` and `events` in `cost.ts`).

`FALLBACK_CONTEXT_WINDOW_SIZES` and `ONE_MILLION_CONTEXT` were deleted from both `server/src/analyzer/modelPricing.ts` and `dashboard/src/lib/modelPricing.ts`. `DEFAULT_CONTEXT_WINDOW = 200_000` was kept (used inside the new helper as the no-observation default) with updated doc comment explaining the new source-of-truth hierarchy.

The parity test `server/src/analyzer/modelPricing.parity.test.ts` was updated:
- Removed the per-context-window verbatim parity block (there is no static map left to parity-check).
- Removed the `ONE_MILLION_CONTEXT` assertion in the constants block.
- Kept the `DEFAULT_CONTEXT_WINDOW` parity check.
- Added a guard that the deleted exports do not return: matches `/export\s+const\s+FALLBACK_CONTEXT_WINDOW_SIZES/` and `/export\s+const\s+ONE_MILLION_CONTEXT/` on the dashboard file and fails loud if either is reintroduced.

## Tests added

- `server/src/analyzer/contextWindow.test.ts` — 8 fixtures covering: below-200K → 200K, above-200K → 1M, boundary at 200_000 → 200K, just-over at 200_001 → 1M, empty events, events missing usage, mixed event types (only assistant counts), undefined sub-fields.
- `dashboard/src/lib/contextWindow.test.ts` — same 8 fixtures against the dashboard mirror.
- `server/src/analyzer/metrics.test.ts` — two new Bug-K integration tests using model ids that are NOT in the deleted static map (`claude-future-model-2027`, `claude-future-small-2027`, `claude-future-big-2027`). The pre-fix path would return the 200K default for these; only the observation-derived path returns 1M when a turn served > 200K input.

## Tests adjusted (and why)

- `metrics.test.ts` — "caps contextPercent at 100 when tokens exceed window": pinned via `sdkContextWindow=200_000` because the observation-derived path would now treat 300K input as evidence of a 1M tier (reporting 30%, not capping). The SDK-pinned variant cleanly exercises the cap logic.
- `metrics.test.ts` — "uses 1M context window for models containing '1m'": **deleted**. The substring heuristic was removed by design; there is no behavior left to test.
- `metrics.test.ts` — "uses 1_000_000 context window for claude-opus-4-7": renamed to "derives 1M window from observed usage when a turn exceeds 200K (Bug K)" and the fixture model id was changed from the formerly-hardcoded `claude-opus-4-7` to `claude-future-model-2027`. The original test passed by coincidence under both old and new logic; the new fixture genuinely exercises only the new path.
- `metrics.test.ts` — "uses last real model's context window (not the first model seen)": renamed and fixture model ids changed to unknowns, same reason.
- `cost.test.ts` — "caps contextPercent at 100 when tokens exceed window without SDK value": same SDK-pinning treatment as the server-side cap test.
- `modelPricing.parity.test.ts` — updated as described above.

## Both-directions verification

1. **Saved** the production rewire (`server/src/analyzer/metrics.ts` + `dashboard/src/lib/cost.ts` + `server/src/analyzer/modelPricing.ts` + `dashboard/src/lib/modelPricing.ts`) to `/tmp/bug-k-rewire.patch` and `git checkout`ed those four files back to the pre-fix state. Kept the new helper files and the new tests in place.
2. **Ran** `pnpm vitest run src/analyzer/metrics.test.ts` against the reverted code:
   - 22 pre-existing tests still passed (no false regressions in the test rename).
   - 2 new Bug-K integration tests **failed** with `expected 200000 to be 1000000` — the pre-fix code returned the 200K default for the unknown model ids, exactly as predicted.
3. **Re-applied** the rewire patch + re-deleted the dead constants from `modelPricing.ts`. All 24 metrics tests pass. Helper tests (server + dashboard) pass. Full suites pass (866 server, 1641 dashboard, 0 failures).

## Files changed

### New
- `server/src/analyzer/contextWindow.ts` — observation-derived helper
- `server/src/analyzer/contextWindow.test.ts` — 8 unit tests
- `dashboard/src/lib/contextWindow.ts` — dashboard mirror
- `dashboard/src/lib/contextWindow.test.ts` — 8 unit tests

### Modified
- `server/src/analyzer/metrics.ts` — rewired `getContextWindowSize`, pass `allEvents` at call site
- `server/src/analyzer/modelPricing.ts` — deleted `FALLBACK_CONTEXT_WINDOW_SIZES` and `ONE_MILLION_CONTEXT`; kept `DEFAULT_CONTEXT_WINDOW` with updated docs
- `server/src/analyzer/modelPricing.parity.test.ts` — surgical update per above
- `server/src/analyzer/metrics.test.ts` — 2 new Bug-K tests, 1 deleted (substring heuristic), 4 renamed/adjusted
- `dashboard/src/lib/cost.ts` — rewired `getContextWindowSize`, pass `events` at call site
- `dashboard/src/lib/modelPricing.ts` — same deletions as server side
- `dashboard/src/lib/cost.test.ts` — 1 test pinned to SDK window for cap behaviour

## Prevention

The parity test now actively asserts that `FALLBACK_CONTEXT_WINDOW_SIZES` and `ONE_MILLION_CONTEXT` are not re-exported from the dashboard mirror. Any future re-introduction trips the parity test before merge.

The source-of-truth doc comment in both `modelPricing.ts` files names the four sources in priority order. A reviewer asked to change context-window logic now has the canonical hierarchy in front of them.

## Related

- Architecture invariant #9 (CLAUDE.md): "Data integrity — numbers must be correct. Token counts, costs, status must match JSONL source. Wrong data is worse than no data." The pre-fix path returned a number that *looked* correct but was a model-name guess; the post-fix path returns a number that is provably consistent with the session's own observations.
- Architecture invariant in `.claude/rules/architecture.md`: "Filesystem JSONL is the single source of truth." Observation-derived context window is a direct application of that principle — we use what the data tells us, not what we assumed about it.
