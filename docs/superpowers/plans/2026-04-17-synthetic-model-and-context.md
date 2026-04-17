# Plan: Fix `<synthetic>` model display and wrong context-window computation

**Date:** 2026-04-17
**Branch:** `fix/synthetic-model-and-context`
**Scope:** Bug fix — no feature work, no refactor of unrelated code.

## Bug

In the TopBar HUD for session `df0c5a8d-acf8-49e4-b2a0-212c8829461d`:

1. **Model** displays `<synthetic>` instead of the real model the user is running (e.g. `Opus 4.6`).
2. **Context** shows 100% even though it depends on the model's context window (1M vs 200k).

## Root Cause

### 1. `<synthetic>` model gets aggregated
Claude Code writes synthetic assistant events with `"model":"<synthetic>"` and a zeroed `usage` object. In `server/src/analyzer/metrics.ts` the loop (line ~199) only skips events with `if (!usage) continue`. Zero-valued usage still passes, so `<synthetic>` gets added to the `models` Set.

`dashboard/src/components/TopBar.tsx:65` then picks `modelsList[modelsList.length - 1]`. When `<synthetic>` is the last model seen, the HUD renders `<synthetic>`.

Confirmed in session JSONL:
```
$ grep -o '"model":"[^"]*"' df0c5a8d-….jsonl | sort -u
"model":"<synthetic>"
"model":"claude-opus-4-6"
"model":"claude-sonnet-4-6"
```

### 2. Context-window lookup uses wrong model
`server/src/analyzer/metrics.ts:292` uses:
```ts
const primaryModel = Array.from(models)[0] || "claude-sonnet-4-6";
const contextWindowSize = sdkContextWindow || getContextWindowSize(primaryModel);
```
This picks the FIRST model in the Set. In this session the first is `claude-opus-4-6` (no `[1m]` tag in JSONL), so `getContextWindowSize` returns 200k. But if the user actually runs the 1M-tier variant, the true window is 1M and percent is ~5× inflated.

The SDK-authoritative path (`sdkContextWindow`) only fires after a `result` event during an active live session. For historical sessions, or before the first result, fallback is used.

The correct primary model for context-window calculation is the model tied to the event that produced `lastInputTokens` — i.e. the most recent assistant event with real usage. That's also the model currently running.

## Fix

### A. `server/src/analyzer/metrics.ts`
- Skip events whose model begins with `<` (pseudo-models like `<synthetic>`) when aggregating `models`, tokens, and cost. They carry no real usage and pollute the list.
- Track `lastRealModel` alongside `lastInputTokens` — the model of the latest assistant event that contributed usage. Use that as `primaryModel` for `getContextWindowSize`.
- Keep existing `sdkContextWindow` priority.

### B. `dashboard/src/components/TopBar.tsx`
- When falling back to `modelsList` for display (non-live or before controls are ready), filter out any model starting with `<` before picking the last entry. Defensive — server already filters, but belt-and-suspenders against stale cached metrics.

### C. Tests
- `server/src/analyzer/metrics.test.ts`:
  - Reproduction test: a session with `<synthetic>` and `claude-opus-4-6` events → `metrics.models` excludes `<synthetic>`; `contextWindowSize` reflects the real model.
  - Last-real-model test: events [sonnet, opus] (opus last, has usage) → context window uses opus (via `lastRealModel`).
- `dashboard/src/components/__tests__/TopBar.test.tsx`:
  - If `metrics.models` contains `<synthetic>`, the displayed model name must not be `<synthetic>`.

## Out of Scope

- Refactor of `computeMetrics` beyond the two narrow changes above.
- Changes to SDK event handling or `sessionManager.setContextWindow`.
- UI tweaks to the TopBar layout.

## Verification

```bash
cd server && pnpm test --run
cd ../dashboard && pnpm test --run
cd ../server && npx tsc --noEmit
cd ../dashboard && npx tsc --noEmit
```

All green. Plus the new reproduction tests explicitly cover both bugs.
