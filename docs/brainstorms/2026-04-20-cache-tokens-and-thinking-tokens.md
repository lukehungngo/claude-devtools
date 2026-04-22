# Brainstorm: Cache-input tokens per command/agent + Thinking output tokens

**Date:** 2026-04-20
**Input type:** Idea
**Input:** can we have cache-input for each command, skills, agents, repo and all, also can we have thinking output tokens

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Cache tokens aren't tracked yet | WRONG | `AggregatedTokens` has `cacheWrite` + `cacheRead`; `tokensByTurn` already aggregates them server-side |
| Cache tokens aren't displayed | QUESTIONED | `CostStrip.tsx` shows input/output/cost but likely omits cache breakdown |
| Thinking tokens are a separate API field | WRONG | Anthropic API rolls thinking into `output_tokens` — no separate count returned |
| Thinking content is parsed | CONFIRMED | `ThinkingContent` type exists; blocks are parsed and previewed |

## Fundamentals

**Cache tokens:**
- TRUTH: `computeMetrics()` already aggregates `cacheRead` and `cacheWrite` per turn and per session
- TRUTH: Per-agent breakdown exists (`tokensByTurn` includes per-turn model + tokens)
- TRUTH: The UI (`CostStrip`, `CostFooter`) shows input/output/cost — cache fields exist in the data but are not displayed
- CONSTRAINT: Per-command granularity (per skill invocation) would require matching tool call events to usage events — possible since they're in the same turn, but needs correlation logic

**Thinking tokens:**
- TRUTH: API doesn't return separate thinking token count — `output_tokens` = regular output + thinking combined
- TRUTH: Thinking text content IS parsed (`ThinkingContent.thinking: string`)
- TRUTH: Token count can be estimated: `chars / 4` ≈ tokens (rough, not billable-accurate)
- CONSTRAINT: Exact thinking token count is unknowable from JSONL alone without re-tokenizing the text

## Output

### Cache tokens — YES, worth building, mostly done

The data is already there. What's missing is display. Two levels:

**Level 1 — Session/turn level (easy, high value):** Show `cacheRead` and `cacheWrite` in `CostStrip` and the insights CAS panel. The metrics object already has it. Savings = `cacheRead × (input_price - cache_read_price)`.

**Level 2 — Per-agent/per-command (medium effort):** Each turn is already tied to an agent group. `tokensByTurn` has per-turn cache counts. Aggregating by agent group gives per-agent cache stats. Per-command (per-skill) would need matching within a turn — feasible but more work.

Recommended scope: Level 1 + per-agent aggregation from existing `tokensByTurn`.

### Thinking tokens — YES, but with honest labeling

Can't show exact thinking token count (API doesn't expose it). Can show:
- **Estimated thinking tokens** — `thinkingText.length / 4`, labeled "~est"
- **Thinking presence** — badge/indicator when thinking blocks exist in a turn
- **Thinking text length** — raw chars as a proxy metric

The honest display: "~1,240 thinking tokens (est.)" — users understand it's approximate.

## Next Steps

Both are implementable. Cache is clean data work; thinking requires estimated labeling.
Recommended order: cache display first (no estimation needed), then thinking tokens.
