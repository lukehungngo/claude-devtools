# Brainstorm: Context Window Accuracy + Token In/Out with Every Cost Label

**Date:** 2026-04-17
**Input type:** Problem (two distinct bugs/gaps)
**Input:** Context showing not correct — depends on model context window (1M vs 250K). Also need to show total token in/out next to every cost label across the product.

---

## Problem 1: Context Window Size Is Wrong

### Assumptions

| Assumption | Status | Evidence |
|---|---|---|
| Context window size comes from model name heuristic | CONFIRMED | `getContextWindowSize()` in `server/src/analyzer/metrics.ts:51` and `dashboard/src/lib/cost.ts:48` both use fallback map + name matching |
| 1M detection works for all 1M models | QUESTIONED | Detection checks `model.includes("1m")` — `claude-opus-4-7` does NOT contain "1m" |
| Fallback map covers all active models | QUESTIONED | Map has `claude-opus-4-6` (200K), `claude-sonnet-4-6` (200K), `claude-haiku-4-5` (200K) — `claude-opus-4-7` is missing |
| SDK provides authoritative window size | CONFIRMED (partial) | `sdkContextWindow` param in `computeMetrics()` — but only for live SDK sessions, not JSONL replays |

### Fundamentals

- **Truth 1**: Claude Opus 4.7 (`claude-opus-4-7`) has 1M context window. It's the current top model.
- **Truth 2**: The fallback map in both server (`metrics.ts:29`) and dashboard (`cost.ts:42`) only has `claude-opus-4-6` → 200K. Opus 4.7 is absent.
- **Truth 3**: The "1m" string detection (`model.includes("1m")`) is a heuristic that won't match future model naming conventions unless they happen to embed "1m".
- **Truth 4**: A session using Opus 4.7 falls through to the 200K default → context bar shows 5× too high (5% of real capacity shown as 25%).

### Root Cause (Confirmed)

`claude-opus-4-7` is not in `FALLBACK_CONTEXT_WINDOW_SIZES`. The "1m" heuristic doesn't catch it. Both server and dashboard default to 200K. Context % is inflated 5× for Opus 4.7 users.

### Fix

Add to both `server/src/analyzer/metrics.ts` and `dashboard/src/lib/cost.ts`:
```
"claude-opus-4-7": 1_000_000,
```

Also add Haiku 4.5 full model ID variant to prevent future misses:
```
"claude-haiku-4-5-20251001": 200_000,
```

The `model.includes(key)` matching means the short key `"claude-haiku-4-5"` already matches the full ID — but being explicit prevents drift.

**Long term**: Read context window from JSONL `usage.system` metadata if available. But that requires SDK schema investigation. The immediate fix is the fallback map.

---

## Problem 2: Token In/Out Missing Next to Every Cost Label

### Assumptions

| Assumption | Status | Evidence |
|---|---|---|
| Cost is displayed in many places | CONFIRMED | 8 locations show cost without tokens — see scan below |
| All cost display sites have access to token data | QUESTIONED | Some receive only `cost: number`, not full tokenUsage object |
| "Every cost label" means all UI surfaces | CONFIRMED (user) | "deep scan whenever the cost show up, it's must show up with number of in/out token" |

### Locations Without Token Counts (to fix)

| Component | File | Line | Has token data available? |
|---|---|---|---|
| CostTab | `bottom-panel/CostTab.tsx` | 96, 104, 110-164 | Yes — `node.tokenUsage` object |
| CostFooter | `conversation/CostFooter.tsx` | 26, 30, 32 | Partial — receives `totalCost`, `mainCost`, `agentCost` — needs tokens added to props |
| TurnHistoryPanel | `TurnHistoryPanel.tsx` | 148 | Needs `turn.inputTokens` / `turn.outputTokens` added to turn data |
| AgentNodeCard | `AgentNodeCard.tsx` | 64 | Yes — `node.tokenUsage` has input/output |
| AgentCard | `conversation/AgentCard.tsx` | 139 | Needs tokens added to props |
| AgentPills | `conversation/AgentPills.tsx` | 98 | `agent.cost` — needs `agent.inputTokens` / `agent.outputTokens` |
| AgentLogs | `AgentLogs.tsx` | 664 | Computed from `calculateTurnCost` — needs `group.inputTokens` etc |

### Already Correct (no change needed)

| Component | File | Notes |
|---|---|---|
| CostStrip | `viewer/CostStrip.tsx` | Shows In/Out flanking cost ✅ |
| TopBar | `TopBar.tsx` | Shows tokens separately in right section ✅ |
| /cost command | `commandFormatters.ts` | Shows per-model in/out ✅ |
| /analytics command | `commandFormatters.ts` | Shows in/out for 24h/7d ✅ |

### Fundamentals

- **Truth**: The data exists server-side — `SessionMetrics.tokensByTurn`, `dag.nodes[].tokenUsage`, `tokens.inputTokens` etc. all carry input/output counts.
- **Truth**: The display gap is a prop threading problem — not a data problem. Some components were given only `cost` where they need `{ cost, inputTokens, outputTokens }`.
- **Truth**: The pattern to follow is already in `CostStrip` — render `In: {k(inputTokens)} / Out: {k(outputTokens)}` in a secondary style next to cost.

### Fix Approach

1. Create a small shared utility `formatTokenPair(input, output)` → `"In: 12k / Out: 3k"` (consistent format)
2. For each location, thread the token counts through props
3. Add display inline with existing cost label — secondary text color, same line or directly below

---

## Summary: Two Root Causes

| Problem | Root Cause | Fix Complexity |
|---|---|---|
| Context window wrong | `claude-opus-4-7` missing from fallback map | Trivial — 1 line in 2 files |
| Token in/out missing | Props not threaded to 7 cost-display components | Moderate — prop changes in ~7 components |

## Next Steps

Primary: implement both fixes.
