# Brainstorm: Demonstrating Token Saving from Claude Memory

**Date:** 2026-04-20
**Input type:** Idea
**Input:** Claude mem (Token Savior MCP) is running — can we demonstrate token saving or reduction?

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| "Claude mem" = Token Savior memory engine | CONFIRMED | Activated at session start |
| Memory saves tokens by avoiding re-reads | QUESTIONED | Token Savior stores observations, but dashboard can't measure "what would have been read" |
| Cached tokens already tracked in dashboard | CONFIRMED | cacheReadTokens wired through TurnSnapshot → CostFooter |
| Cache savings = measurable dollar amount | CONFIRMED | Cached input = 10% of full price → 90% savings on cache hits |
| "Demonstrate" means a UI feature | QUESTIONED | Could be logging or diff comparison |

## Fundamentals

Two distinct token-saving mechanisms:

1. **Prompt caching (Claude-native)** — same system prompt prefix reused across turns. Charged at 10% of input price. Already tracked as `cacheReadTokens`. Savings are real and calculable now.

2. **Token Savior memory engine** — stores code intelligence observations. In theory replaces file re-reads with memory recalls. Savings depend on: memory size < file size AND hit rate. Not yet observable in dashboard.

**Formula (calculable today):**
```
cache_savings_usd = cacheReadTokens × input_price_per_tok × 0.90
```
For Sonnet 4.6 at $3/MTok: every 1M cached tokens saves $2.70.

## Output

### Path A — "Cache Savings $" tile in Insights stats bar (recommended, ~1h)
- Compute `cache_savings = cacheReadTokens × 0.9 × model_input_price`
- Add tile next to cacheReadTokens tile in InsightsPage stats bar
- Show "Saved $X.XX from cache" — concrete, real money, immediate impact

### Path B — Cache Hit Rate tile
- `cacheHitRate = cacheReadTokens / totalInputTokens` as a percentage
- Natural follow-on after Path A

### Path C — Token Savior memory diff (research required)
- Use memory_status/corpus_query to show "X observations stored, ~Y tokens saved vs re-reading"
- Not proven yet — needs investigation of what Token Savior actually exposes

## Next Steps

/mas:loop implement cache savings tile for Insights stats bar — see docs/brainstorms/2026-04-20-token-savings-demo.md
