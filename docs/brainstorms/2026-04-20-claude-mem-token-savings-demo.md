# Brainstorm: Demonstrating claude-mem Token Savings

**Date:** 2026-04-20
**Input type:** Idea
**Input:** claude-mem plugin is running — can we demonstrate token saving or reduction in the dashboard?

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| claude-mem saves tokens via lazy loading | CONFIRMED | 3-layer progressive disclosure: index (~100 tok) → timeline → full fetch only when needed |
| Claims ~10x savings vs eager full-corpus injection | CONFIRMED per docs | Architectural claim, not per-session metric |
| claude-mem MCP tool calls appear in JSONL | CONFIRMED | All tool use events land in JSONL |
| Per-layer token costs visible in web viewer | CONFIRMED | localhost:37777 |
| Dashboard can see memory tool calls already | CONFIRMED | JSONL parsed, tool calls grouped by type |

## Fundamentals

- Each layer: search index ≈ 100 tok, full fetch ≈ 500–1000 tok
- Savings come from NOT hitting layer 3 unless needed
- Counterfactual is estimable: cold re-read via Read/Glob/Grep vs. memory fetch
- Dashboard already groups tool calls by type, tracks input tokens per session

## Output

### Angle 1 — Build into claude-devtools
Detect mem_search / get_observations calls in JSONL, show "Memory calls: X / ~Y tokens saved" in session view.

### Angle 2 — Use existing web viewer (instant, zero build)
localhost:37777 already shows per-query token costs during a session.

### Angle 3 — Cross-session comparison (most convincing)
Run two identical tasks cold vs. warm. Compare total input tokens in Insights page. Delta = savings.

## Recommendation
Angle 2 = instant demo. Angle 3 = most convincing proof. Angle 1 = most product-complete.
