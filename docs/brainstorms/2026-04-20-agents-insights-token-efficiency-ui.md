# Brainstorm: Agents Insights UI Redesign (Token Efficiency View)

**Date:** 2026-04-20
**Input type:** Idea
**Input:** Screenshot mockup showing a two-panel Agents section — ranked list (left) + token efficiency cards with dual-line sparklines (right)

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Token usage per agent type is available | CONFIRMED | Each subagent has `subagents/agent-{id}.jsonl` with `usage` events; `meta.json` contains `agentType` |
| We can attribute cost to agent type | CONFIRMED | Subagent JSONL usage events have `input_tokens` / `output_tokens`; cost = tokens × model rate |
| The two sparkline lines are tokens-in/run and tokens-out/run over time | CONFIRMED | Mockup legend: "— Tokens in / run" and "— Tokens out / run" |
| Trend pills represent token efficiency trend (not call count) | CONFIRMED | Right panel has separate trend from left panel's call count |
| Agent taglines ("builds & edits") come from agent definition descriptions | QUESTIONED | Look hand-crafted; `.claude/agents/` may have descriptions but not exactly these taglines |

## Fundamentals

**Left panel — data per row:**
- Badge: hash-stable color from `agentType` name (hashCode % 8, same as CASRow)
- Agent name: last segment of `subagent_type` (e.g. `mas:engineer:engineer` → `engineer`)
- Tagline: agent `description` from `.claude/agents/` definition if available, else omit
- Run count: `InsightsAgentRow.count` — already available
- Cost: summed across subagent JSONL token usage × model rate
- Total tokens: `tokensIn + tokensOut` aggregated across all runs

**Right panel — data per card:**
- Sparkline (two lines): daily `tokensIn / count` and `tokensOut / count` (avg per run per day)
- Token stats text: "11.0K in -25% / 36.0K out -25%" — current vs prior half avg
- Trend pill: IMPROVING/STABLE/REGRESSING on token-per-run efficiency (not call count)

**Data gaps to close in `InsightsAgentRow`:**
```
Current: { type, count, share, daily: number[], trend }
Needed:  { type, count, share, daily: number[], trend,
           tokensIn: number,         // total over window
           tokensOut: number,        // total over window
           cost: number,             // total over window
           dailyTokensIn: number[],  // avg tokens in per run per day
           dailyTokensOut: number[], // avg tokens out per run per day
           tokenTrend: CasTrend }    // token efficiency trend
```

**Analyzer change:** `insights-commands-agents-skills.ts` currently reads main session JSONL only.
Must also traverse `subagents/agent-{id}.jsonl` + `meta.json` per session to attribute token usage by agentType.

## Output

**Validation: YES — worth building.** Call counts are vanity; tokens-per-run is the actionable signal. Rising tokens-per-run means agent context is bloating. The data is available via subagent JSONL files.

### Technical Approach

1. **Server — extend type** (`server/src/types.ts`): Add `tokensIn`, `tokensOut`, `cost`, `dailyTokensIn[]`, `dailyTokensOut[]`, `tokenTrend` to `InsightsAgentRow`.

2. **Server — extend analyzer** (`server/src/analyzer/insights-commands-agents-skills.ts`): When iterating a session directory, also read `subagents/` subdirectory. For each subagent: read `meta.json` → `agentType`, parse `agent-{id}.jsonl` for `usage` events → `input_tokens`, `output_tokens`, bucket by day.

3. **Dashboard — redesign agents section** (`dashboard/src/routes/InsightsPage.tsx` + new `AgentInsightCard.tsx`): Two-panel layout. Left = CASRow-style list updated with cost/tokens. Right = grid of `AgentInsightCard` with dual-line sparkline.

4. **Dashboard — dual-line Sparkline**: Extend the existing inline sparkline or extract shared `<Sparkline dataA={[]} dataB={[]} />` component.

**Scope:** 3 tasks. Medium complexity — similar to the CAS daily sparklines work (86c76b5 / 6aeeaaa).

## Correction (from user)

The left panel (ranked list with progress bar) was already implemented in commit `64f4775` but was replaced entirely by CASRow. The goal is to have BOTH panels side by side.

**Task 1 (no new data needed):** Restore the two-panel layout. Left = colored badge + name + progress bar + count. Right = existing CASRow cards.

**Task 2 (new data needed):** Enhance right panel with dual-line sparkline (tokens in/run + tokens out/run). Requires subagent JSONL traversal to attribute token usage per agent type.

These can ship independently. Task 1 is immediate; Task 2 requires server-side data work.

## Next Steps

```
/mas:dev-loop implement agents two-panel layout (left: ranked list, right: CASRow cards) — see docs/brainstorms/2026-04-20-agents-insights-token-efficiency-ui.md --auto
```
