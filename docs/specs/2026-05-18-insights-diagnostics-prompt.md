# Insights Diagnostics Prompt + Quick Win Capability Spec

**Date:** 2026-05-18  
**Status:** Draft  
**Scope:** Insights page - "This week's diagnostics" coaching layer

## 1. Purpose

This spec defines the second iteration of Insights: a coach-first weekly diagnostics layer backed by deterministic evidence.

The page should not ask users to interpret charts. It should tell them what behavior cost time, money, or quality this week, what evidence proves it, and what to change next.

Quick Wins remain rule-based. They are carefully researched deterministic checks that run fast and provide stable, inspectable evidence. The AI layer should not decide whether a Quick Win fired. The AI layer should rank, explain, and prescribe using the facts already computed by the system.

## 2. Product Shape

The first viewport should show:

- Compact period context: spend, tokens, sessions, turns, date range.
- `This week's diagnostics`: 3 ranked coaching patterns.
- One expanded primary diagnosis.
- Smaller collapsed rows for the next 2 patterns.
- Quick Wins kept intact as rule-backed coaching hints.
- Evidence below the coaching content, not above it.

The desired hierarchy is:

1. Diagnosis.
2. Cost, time, or quality impact.
3. Change this week.
4. Evidence chips.
5. Deeper evidence and charts below.

## 3. Quick Win Capability Check

| Pattern | Goal | Current feasibility | Data source | Notes |
|---|---|---:|---|---|
| Edit rejection rate | Quality | Yes | Permission requests, user decisions, auto-denial records | This measures proposed edit decisions rejected by the user or permission system. It is separate from tool execution failures. |
| Tool failure storm | Quality | Yes | `tool_result.is_error`, tool use/result mapping | Strong quality signal. Count all tool calls and failed tool results in the selected period. |
| Cache hit ratio | Cost | Yes | Assistant usage tokens: input, cache creation, cache read | Current code already reads cache tokens. Savings should use model pricing and be labeled estimated. |
| Cost-per-LOC outlier | Cost | Mostly | Session cost, `Edit`/`Write` payloads, edited file hooks | LOC changed is estimated. Good enough for a coaching signal if labeled estimated and gated by minimum LOC. |
| Long turn durations | Latency | Yes | `system` events with `turn_duration`, turn grouping | Supported by existing duration data. Use p95 plus count of long turns. |
| High-context duration tax | Latency | Yes | Assistant input/cache tokens, `turn_duration`, turn grouping | Prefer duration tax over TTFT because historical data reliably supports turn duration, not result-level TTFT. |

## 4. Quick Win Rule Definitions

### 4.1 Edit Rejection Rate

**Goal:** Detect when Claude proposes edits that are rejected by the user or permission system.

**Rule:**

```text
Warn:
rejectRate > 0.20
AND totalDecisions >= 5

Praise:
rejectRate < 0.05
AND totalDecisions >= 5
```

**Shown to user:**

```text
N of M proposed edits rejected
```

**Implementation notes:**

- Count decisions tied to edit-capable tools such as `Edit`, `Write`, `MultiEdit`, or permission records that name a file-write operation.
- Rejection means the user or permission system denied the proposed edit. Do not include normal failed tool executions here.
- Auto-denials should count as rejected decisions when the blocked tool was edit-capable.
- Evidence should include the rejected tool name, path when available, decision reason, and session id.
- The coaching recommendation should explain how to reduce rejected edits: tighten scope, read the target file first, avoid broad writes, or ask before destructive changes.

### 4.2 Tool Failure Storm

**Goal:** Detect sessions where tool execution failure is high enough to hurt quality and momentum.

**Rule:**

```text
Warn:
failRate > 0.10
AND totalToolCalls >= 20

Praise:
failRate < 0.02
AND totalToolCalls >= 20
```

**Shown to user:**

```text
N of M tool calls failed
```

**Implementation notes:**

- Count assistant `tool_use` calls as total tool calls.
- Count matching `tool_result` blocks with `is_error: true` as failures.
- Where possible, group failures by tool name and error family.
- Do not count user-cancelled permission decisions as tool failures. Those belong to edit rejection rate.
- The coaching recommendation should name the dominant failure mode, such as missing paths, bad commands, permission denials, or repeated invalid arguments.

### 4.3 Cache Hit Ratio

**Goal:** Detect poor cache leverage on high-token workloads.

**Rule:**

```text
Warn:
cacheHitRatio < 0.60
AND inputTokens > 50K

Praise:
cacheHitRatio > 0.80
AND inputTokens > 50K
```

**Shown to user:**

```text
estimated ~$X potential cache savings
```

**Implementation notes:**

- Use assistant usage fields: input tokens, cache creation tokens, cache read tokens.
- `cacheHitRatio = cacheReadTokens / (inputTokens + cacheCreationTokens + cacheReadTokens)`.
- Savings should compare paid input/cache-write cost against cache-read cost using model pricing.
- Mark savings as estimated because cache behavior is influenced by session continuation, prompt structure, and model/provider cache policy.

### 4.4 Cost-Per-LOC Outlier

**Goal:** Detect when the user spent a lot for a small amount of code change.

**Rule:**

```text
Warn:
costPerLoc > 0.50
AND locChanged >= 10

Praise:
costPerLoc < 0.10
AND locChanged >= 10
```

**Shown to user:**

```text
estimated $X.XX per LOC changed
```

**Implementation notes:**

- Use total session cost over the selected period or per affected session, depending on evidence granularity.
- Estimate LOC from `Edit`, `Write`, and `MultiEdit` payloads when available.
- For `Edit`, compare line counts in `old_string` and `new_string`; count changed lines conservatively.
- For `Write`, count written content lines, but label the result estimated because new-file writes can overstate meaningful code change.
- Ignore non-code files unless the product explicitly wants documentation/design work included.
- This detector should avoid shaming legitimate architecture or debugging sessions. It should fire when low LOC change combines with high spend and enough evidence.

### 4.5 Long Turn Durations

**Goal:** Detect when the user's Claude Code workflow regularly waits on long turns.

**Rule:**

```text
Warn:
p95DurationMs > 60000
AND longTurnCount >= 5

Praise:
p95DurationMs < 20000
AND totalToolCalls >= 20
```

**Shown to user:**

```text
p95 turn duration Xs (N turns >60s)
```

**Implementation notes:**

- Use `system` events with subtype `turn_duration` where available.
- Fall back to turn start/end timestamps only when `turn_duration` is absent.
- `longTurnCount` should count turns over 60 seconds.
- Evidence should include the slowest sessions and whether the slow turns correlate with tool failures, high context, or many serial tool calls.
- The coaching recommendation should be concrete: split broad requests, compact context, narrow file scope, or fix repeated failing commands depending on evidence.

### 4.6 High-Context Duration Tax

**Goal:** Detect whether large context materially increases turn duration.

**Rule:**

```text
Warn:
highContextDurationRatio > 1.8
AND highContextTurns >= 5
AND lowContextTurns >= 5

Praise:
highContextDurationRatio < 1.2
AND highContextTurns >= 5
```

**Shown to user:**

```text
high-context turns were X.Xx slower
```

**Implementation notes:**

- `highContextTurns` are turns where effective input context is greater than 150K tokens.
- `lowContextTurns` are turns where effective input context is less than 50K tokens.
- Effective input context should include input, cache creation, and cache read tokens when using assistant usage as the source.
- `highContextDurationRatio = meanDuration(highContextTurns) / meanDuration(lowContextTurns)`.
- Use turn duration, not TTFT, unless result-level TTFT is later captured.
- Evidence should include high-context turn count, low-context turn count, mean durations, and compact boundary count when available.

## 5. Required Data Contract For AI Diagnostics

The AI should receive precomputed JSON. It should not scan raw session logs or infer unsupported metrics.

Minimum input:

```json
{
  "period": {
    "range": "7d",
    "spend": 248,
    "tokens": 20700000,
    "sessions": 47,
    "turns": 1248
  },
  "quick_wins": [
    {
      "pattern_id": "edit_rejection_rate",
      "status": "warn",
      "category": "quality",
      "confidence": "high",
      "impact": {
        "label": "Quality risk",
        "value": "3 of 12 proposed edits rejected"
      },
      "evidence": {
        "session_ids": ["..."],
        "files": ["..."],
        "counters": {
          "rejected_decisions": 3,
          "total_decisions": 12,
          "reject_rate": 0.25
        }
      },
      "recommendation": "Narrow edit scope and read the target file before proposing broad file changes."
    }
  ],
  "diagnostic_candidates": [
    {
      "id": "high_context_duration_tax",
      "category": "latency",
      "confidence": "high",
      "estimated_cost_usd": null,
      "estimated_time_seconds": 420,
      "evidence_summary": "High-context turns averaged 2.1x longer than low-context turns.",
      "session_ids": ["..."],
      "recommendation": "Compact or split the task once context crosses 150K tokens."
    }
  ],
  "unsupported_metrics": [
    {
      "name": "exact_loc_changed",
      "reason": "LOC changed is estimated from edit/write payloads and edited-file hooks."
    }
  ]
}
```

## 6. System Prompt

Use this prompt for the AI layer that generates `This week's diagnostics`.

```text
You are the Claude Code workflow coach for an Insights page.

Your job is to read precomputed weekly session metrics and produce 3-4 plain-language diagnostics that tell the user what behavior is costing time, money, or quality, and what to change this week.

You are not a dashboard narrator. Do not summarize charts. Do not explain metrics unless they are evidence for a specific behavior.

INPUTS YOU MAY RECEIVE
- period: date range, total spend, total tokens, session count, turn count
- sessions: session-level summaries with ids, project names, costs, models, timestamps, tool usage, errors, token usage, duration, compact events, and outcome signals
- quick_wins: deterministic rule results with pattern id, status, category, rule, impact estimate, confidence, evidence sessions, and evidence counters
- quality_signals: edit rejections, failed tool calls, retry loops, abandoned sessions, reverted edits, test failures, user corrections
- cost_signals: model mix, cache hit ratio, cache write/read tokens, cost per LOC, estimated LOC changed
- latency_signals: p95 turn duration, long turn count, high-context duration ratio, context size, compact runs
- evidence: specific sessions, files, commands, dollar amounts, token counts, timestamps, and detected patterns

STRICT RULES
1. Only use evidence present in the input.
2. Never invent dollar amounts, sessions, files, commands, models, timings, or causes.
3. If a metric is missing or marked unsupported, do not diagnose it.
4. Distinguish facts from inference.
5. Prefer high-confidence, actionable patterns over interesting but vague observations.
6. Do not expose internal rule names like "highContextDurationRatio" in user-facing copy.
7. Do not tell the user to look at charts.
8. Do not create more than 4 diagnostics.
9. Do not repeat the same root cause in multiple diagnostics.
10. Quick Wins are deterministic evidence. You may promote a Quick Win into a diagnostic if it has high impact and strong evidence.

RANKING
Rank diagnostics by:
1. user impact this week
2. confidence
3. actionability
4. recurrence across sessions
5. cost, quality, and latency overlap

VOICE
Be direct, specific, and practical.
Use plain English.
Write like a senior Claude Code coach, not an analytics dashboard.
Each diagnostic should answer:
- What is happening?
- What is it costing?
- Why is it happening?
- What should the user change this week?

OUTPUT FORMAT
Return valid JSON only.

{
  "headline": "Short weekly coaching headline.",
  "period_summary": {
    "range": "string",
    "spend": "string",
    "tokens": "string",
    "sessions": "string",
    "turns": "string"
  },
  "diagnostics": [
    {
      "id": "stable-slug",
      "rank": 1,
      "category": "workflow | quality | cost | latency | model | context",
      "severity": "high | medium | low | positive",
      "confidence": "high | medium | low",
      "title": "Short behavior-focused title",
      "summary": "1-2 sentences explaining the behavior and impact.",
      "impact_label": "Estimated cost | Time lost | Quality risk | Saved",
      "impact_value": "string",
      "impact_detail": "string",
      "change_this_week": "One concrete habit change.",
      "evidence_chips": [
        "short evidence chip",
        "short evidence chip"
      ],
      "evidence_session_ids": [
        "session-id"
      ],
      "why_flagged": [
        "Specific evidence-backed reason.",
        "Specific evidence-backed reason."
      ],
      "tell_me_more": {
        "what_happened": "Short explanation connecting the evidence.",
        "why_it_matters": "Explain the practical consequence.",
        "recommended_changes": [
          {
            "priority": 1,
            "change": "Concrete action.",
            "expected_effect": "Expected measurable improvement."
          },
          {
            "priority": 2,
            "change": "Concrete action.",
            "expected_effect": "Expected measurable improvement."
          },
          {
            "priority": 3,
            "change": "Concrete action.",
            "expected_effect": "Expected measurable improvement."
          }
        ]
      }
    }
  ],
  "quick_wins": [
    {
      "pattern_id": "string",
      "status": "warn | praise",
      "category": "quality | cost | latency",
      "title": "Short title",
      "impact": "User-facing impact string",
      "recommendation": "One sentence recommendation.",
      "confidence": "high | medium | low"
    }
  ],
  "omitted": [
    {
      "reason": "Metric unavailable, low confidence, duplicate root cause, or low impact.",
      "detail": "Short explanation."
    }
  ]
}

STYLE EXAMPLES
Good:
"Follow-up work is being split across new sessions. Related work on claude-devtools restarted across 9 sessions this week, forcing Claude to reload the same files before making progress."

Bad:
"Your cache hit rate is 42%, which indicates inefficient context reuse."

Good:
"Continue the existing session when follow-up work is on the same repo and task thread. Start fresh only when the task actually changes."

Bad:
"Improve cache utilization."

MISSING DATA BEHAVIOR
Do not say "TTFT" unless result-level TTFT exists in the input. Use "turn duration" for the high-context duration detector.
If cost attribution is approximate, say "estimated."
If LOC changed is estimated, say "estimated."
If no strong negative findings exist, produce positive diagnostics and one maintenance recommendation.
```

## 7. Implementation Guidance

Keep the architecture split clean:

- Rule engine computes Quick Wins and evidence.
- AI ranks and explains diagnostics.
- UI displays coaching first and evidence second.

Do not let the AI become the source of truth for metrics. The AI should receive facts and produce language, prioritization, and synthesis.

For the current data model, implement shared server-side helpers before adding the detectors:

- Tool use/result mapping for tool failure rate.
- Permission decision extraction for edit rejection rate.
- Token aggregation for cache hit ratio and high-context buckets.
- LOC estimation from `Edit`, `Write`, and `MultiEdit` payloads.
- Turn grouping with duration attribution for long-turn and high-context duration detectors.

The dashboard already has client-side turn grouping logic that can guide the server implementation, but detectors should not depend on browser-only utilities.

Use duration tax as the latency context signal for this iteration. TTFT can be added later if result-level `ttft_ms` is captured reliably.
