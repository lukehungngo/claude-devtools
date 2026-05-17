# Efficiency Hints — Design Spec

**Date:** 2026-05-17
**Status:** Draft
**Scope:** Dashboard Insights page — replace "Coming soon" placeholder

## 1. Goal

Show users what they're doing wrong with Claude Code and tell them exactly how to fix it. Two levels: punchline hints (always visible, server-computed) and drill-down evidence (on-demand, SDK-session-synthesized).

The user optimizes for three things:
- **Time** — finish tasks faster, fewer retries, less idle
- **Cost** — spend less per task, stop wasting tokens
- **Efficiency** — higher quality output, less rework, first-try success

## 2. Non-goals

- MCP server (deferred — value too thin when dashboard has all data + SDK)
- Real-time in-session coaching
- Multi-user / team comparisons
- Scores, percentages, or metrics as the primary display — numbers only appear when they punch

## 3. Design

### Level 1 — Punchline Hints (always visible, server-computed)

3-5 short hints. Each one is: **what you did wrong** + **what it cost you** + **what to do instead.** One or two sentences max. No scores, no bars, no dashboards.

```
┌─────────────────────────────────────────────────────┐
│  Efficiency Hints                     This week  ▾  │
│                                                     │
│  💰 You overspent $18 on retries that a single     │
│     Read command would have prevented.              │
│                                                     │
│  ⚡ 38% of your edits needed a follow-up fix.      │
│     Sessions with file context upfront had 90%      │
│     first-try success.                              │
│                                                     │
│  🔄 You started 8 sessions that should have been 3.│
│     Continuing a session reuses cached context —    │
│     faster AND cheaper.                             │
│                                                     │
│  ✅ Your tool error rate dropped 40% vs last week.  │
│     Whatever you changed, keep doing it.            │
│                                                     │
│  [Tell me more →]                                   │
└─────────────────────────────────────────────────────┘
```

Hints are generated server-side from pattern detection. No AI call needed — they're templated sentences with computed values inserted.

**Hint categories** (server picks the most relevant 3-5):

| Category | Trigger condition | Punchline template |
|---|---|---|
| Wasted retries | retry_loops detected (same tool+args ≥3×) | "You wasted ${cost} on {count} retry loops. {worst_tool} failed {n}× in a row — try being more specific upfront." |
| Blind edits | edit_without_read_ratio < 0.7 | "{pct}% of your edits had no prior Read. Sessions with file context first had {success_rate}% first-try success." |
| Session fragmentation | many short sessions on same project | "You started {n} sessions that could have been {m}. Continuing reuses cached context — faster and cheaper." |
| Cost waste | high-cost sessions with low completion | "You spent ${cost} on {n} sessions that never finished. {top_reason}." |
| Model overuse | Opus used where Sonnet would suffice | "You used Opus for {n} tasks that Sonnet handles equally well. That's ${savings} you didn't need to spend." |
| Improving trend | any dimension improved ≥20% vs prior period | "{dimension} improved {delta}% vs last week. Whatever you changed, keep doing it." |
| Cache misses | cache_hit_rate < 0.3 across sessions | "Your sessions re-read the same context every turn. ${wasted} went to re-processing files Claude already saw." |

**Ranking:** hints are sorted by impact (estimated $ or time saved). Show top 3-5. If everything is good, show one positive hint ("You're doing great — no major issues this week").

**Range selector:** 24h | 7d | 30d (top-right dropdown, matches existing Insights).

### Level 2 — Drill-Down (on-demand, SDK-session-synthesized)

User clicks "Tell me more" or clicks any specific hint → opens a detailed evidence panel.

**Option A: Click a specific hint** → drill-down for THAT issue:
- The exact sessions where it happened (with links to session view)
- The specific events (tool calls, retries, failures)
- Numbers: how much time/cost was wasted
- "How to fix it": concrete workflow changes with before/after examples

**Option B: Click "Tell me more"** → full analysis report streamed via SDK:
- All issues ranked by impact
- Per-issue evidence + prescription
- Trend comparison vs prior period
- 3 priority actions for next week

**Drill-down flow:**
1. Dashboard calls `POST /api/efficiency/drilldown` with `{ hint_id, range }` or `{ full_report: true, range }`
2. For single-hint drill-down: server returns pre-computed evidence (no AI needed — just the raw data behind the hint)
3. For full report: server computes all metrics, creates SDK session, streams synthesis
4. Dashboard renders in an expandable panel below the hints

## 4. Server API

### `GET /api/efficiency/hints?range=7d`

Returns the punchline hints:
```json
{
  "range": "7d",
  "hints": [
    {
      "id": "wasted-retries-2026-w20",
      "category": "wasted_retries",
      "icon": "💰",
      "punchline": "You overspent $18 on retries that a single Read command would have prevented.",
      "impact": { "cost": 18.00, "sessions": 5, "retries": 23 },
      "trend": "worse",
      "drilldownAvailable": true
    },
    {
      "id": "blind-edits-2026-w20",
      "category": "blind_edits",
      "icon": "⚡",
      "punchline": "38% of your edits needed a follow-up fix. Sessions with file context upfront had 90% first-try success.",
      "impact": { "failedEdits": 12, "totalEdits": 32, "successRateWithContext": 0.90 },
      "trend": "stable",
      "drilldownAvailable": true
    }
  ],
  "sessionCount": 23,
  "totalCost": 47.20,
  "priorPeriodCost": 52.10
}
```

Compute: `discoverSessions()` → filter by range → run all pattern detectors → rank by impact → template into punchlines. Pure server-side, no AI.

### `GET /api/efficiency/hints/:id/evidence?range=7d`

Returns evidence for a single hint (no AI needed):
```json
{
  "hint_id": "wasted-retries-2026-w20",
  "category": "wasted_retries",
  "evidence": {
    "sessions": [
      { "id": "abc-123", "retryCount": 7, "wastedCost": 8.50, "tool": "Bash", "pattern": "npm test repeated with same failing config" },
      { "id": "def-456", "retryCount": 5, "wastedCost": 4.20, "tool": "Edit", "pattern": "edited file without reading it, then fixed 3×" }
    ],
    "totalWastedCost": 18.00,
    "totalRetries": 23,
    "worstTool": "Bash",
    "recommendation": "Before running a command you're unsure about, ask Claude to check if the file/path/config exists first. In the 5 sessions above, a single Read or ls would have prevented all retries."
  }
}
```

Recommendations are templated per category (not AI-generated). Each category has a fixed "how to fix it" template with data-specific values inserted.

### `POST /api/efficiency/report`

Body: `{ range: "7d" | "30d" }`

Returns: SSE stream of markdown (full "Tell me more" report, SDK-session-synthesized).

Server flow:
1. Compute all hints + evidence for the range
2. Build prompt with pre-computed data (metrics, anti-patterns, session details)
3. Call Anthropic API via SDK, stream the synthesis
4. Save completed report to `~/.claude/devtools/reports/{date}.md`

Prompt instructs Claude to:
- Lead with the 3 highest-impact issues
- For each: what happened, what it cost (time + money), what to do differently
- End with "3 changes for next week" prioritized by expected savings
- Cite specific session IDs so user can click through
- Tone: direct, specific, no fluff

### `GET /api/efficiency/reports`

Returns list of past reports:
```json
{
  "reports": [
    { "id": "2026-05-17", "date": "2026-05-17", "range": "7d", "hintCount": 4, "topIssue": "wasted_retries" }
  ]
}
```

### `GET /api/efficiency/reports/:id`

Returns saved report markdown.

## 5. Pattern Detectors

Each detector runs over sessions in the range and returns structured findings. All server-side, no AI.

### Wasted Retries
Walk events per session. If tool_use has same `(tool, args_hash)` appearing ≥3× consecutively, flag it. Cost = sum of token costs for the retry events. Group by tool.

### Blind Edits
For each Edit/Write tool_use, check if same file was Read within the prior 10 events. Track success: did a subsequent Edit on the same file follow (indicating the first edit failed)? Compute first-try success rate for edits-with-Read vs edits-without-Read.

### Session Fragmentation
Group sessions by project + day. If multiple short sessions (<15 events) exist for the same project on the same day, flag them. Estimate: tokens wasted on re-reading context = sum of input_tokens for the first 3 events of each fragmented session.

### Cost Waste
Find sessions where cost > $3 AND (no end_turn OR error_rate > 25%). These are expensive sessions that didn't produce results. Surface the top reason (high error rate, abandoned, loop detected).

### Model Overuse
For sessions using Opus: if avg turn complexity is low (short prompts, simple tool calls, no multi-file edits), flag as "Sonnet would suffice." Estimate savings using Sonnet pricing.

### Cache Misses
Per session: `cache_read_tokens / (cache_read + cache_creation + input_tokens)`. If < 0.3 across multiple sessions, flag. Estimate: extra cost = `(input_tokens - cache_read_tokens) × price_delta`.

### Improving Trend
Compare each metric vs prior period. If any improved ≥20%, generate a positive hint.

## 6. Dashboard Components

### `EfficiencyHints.tsx`
- Replaces the "Coming soon" placeholder
- Fetches `GET /api/efficiency/hints?range=7d`
- Renders 3-5 hint cards with icon + punchline
- Range dropdown (24h / 7d / 30d)
- "Tell me more" button → opens EfficiencyReport
- Click any hint → expands inline evidence panel

### `HintEvidence.tsx`
- Expandable panel below a hint
- Fetches `GET /api/efficiency/hints/:id/evidence`
- Shows: session list with links, numbers, recommendation
- Session IDs link to the session detail page

### `EfficiencyReport.tsx`
- Full report view (from "Tell me more")
- Calls `POST /api/efficiency/report`, renders SSE markdown stream
- react-markdown + remark-gfm for rendering
- Shows loading state with progress
- Past reports list in sidebar

## 7. Data Flow

```
Dashboard loads Insights page
  → GET /api/efficiency/hints?range=7d
  → Server: discoverSessions() → run 7 pattern detectors → rank → template
  → Dashboard renders EfficiencyHints (3-5 punchlines)

User clicks a hint
  → GET /api/efficiency/hints/:id/evidence
  → Server: return pre-computed evidence for that pattern
  → Dashboard expands HintEvidence inline

User clicks "Tell me more"
  → POST /api/efficiency/report { range: "7d" }
  → Server: compute all data → build prompt → Anthropic SDK stream
  → SSE chunks → Dashboard renders markdown live in EfficiencyReport
  → On complete: save to ~/.claude/devtools/reports/
```

## 8. Empty / Edge States

- **No sessions in range:** "No Claude Code sessions found in the last {range}. Start using Claude Code and check back."
- **Everything is good:** "No major issues this week. Your sessions are efficient, costs are reasonable, and error rates are low. Keep it up."
- **Not enough data for comparison:** Show hints without trend arrows. "Not enough history for trend comparison yet."
- **SDK session fails:** "Couldn't generate the full report. Here's what we found:" → fall back to showing all hints with evidence inline.

## 9. Testing

- Unit: each pattern detector with fixture sessions containing known patterns
- Unit: hint ranking (highest impact first)
- Unit: punchline templating (correct values inserted)
- Unit: evidence endpoint returns correct sessions for each hint type
- Integration: `/api/efficiency/hints` returns valid hint array
- Integration: `/api/efficiency/report` streams valid SSE
- Dashboard: EfficiencyHints renders loading → hints → empty states
- Dashboard: HintEvidence expands/collapses correctly
- Dashboard: EfficiencyReport streams and renders markdown
- Coverage: 80%

## 10. Implementation Order

1. Server: 7 pattern detectors (pure compute, no endpoints yet)
2. Server: hint ranking + punchline templating
3. Server: `GET /api/efficiency/hints` endpoint
4. Dashboard: `EfficiencyHints` component replacing placeholder
5. Server: evidence computation per hint
6. Server: `GET /api/efficiency/hints/:id/evidence` endpoint
7. Dashboard: `HintEvidence` expandable panel
8. Server: `POST /api/efficiency/report` with SDK streaming
9. Dashboard: `EfficiencyReport` with SSE markdown rendering
10. Server: report persistence + history endpoints
11. Dashboard: report history in EfficiencyReport sidebar
12. Polish: empty states, error handling, loading animations
