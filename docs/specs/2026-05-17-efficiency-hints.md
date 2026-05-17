# Efficiency Hints — Design Spec

**Date:** 2026-05-17
**Status:** Draft
**Scope:** Dashboard Insights page — replace "Coming soon" placeholder

## 1. Problem

The Insights page already shows **visualization** (charts, heatmaps, trends) and **aggregation** (token totals, cost summaries). What it doesn't do is **think**.

A developer looks at their token chart and sees a spike. So what? They see $47 total spend. Is that good or bad? They see 33 sessions. Should it have been 10? The data is there but the intelligence isn't.

The gap: **nobody is connecting the developer's habits to their outcomes.** They can't see that their $8 session cost $8 because they edited a file without reading it first, which caused 4 retries, which reprocessed the same context 4 times. They can't see that 6 of their sessions should have been 2. They can't see that Opus was overkill for half their tasks.

Charts show what happened. Intelligence tells you **why it happened and what to do about it.**

## 2. Goal

Add an intelligence layer to the Insights page that **diagnoses workflow problems** and **prescribes specific fixes** — like a code reviewer for your Claude Code habits instead of your code.

The feature reasons about developer behavior across four dimensions:

| Dimension | Question it answers |
|---|---|
| **Cost** | Are you wasting money? Where? Why? |
| **Efficiency** | Are you using the right tools in the right order? |
| **Quality** | Does Claude get it right the first try? How often do you rework? |
| **Latency** | Are sessions taking longer than they should? What's slowing them down? |

Two levels of intelligence:

**Level 1 — Pattern Detection (rule-based, server-side):** 7 detectors scan session data and produce punchline diagnoses. No AI call. Fast, always fresh, computed on every page load. This is the always-visible surface.

**Level 2 — AI Synthesis (on-demand, SDK-streamed):** User clicks "Tell me more" → the server feeds all detector evidence into Claude via the Anthropic SDK → Claude reasons across all four dimensions, connects patterns, and produces a structured report with root-cause analysis and prioritized prescriptions. This is the deep-dive.

The distinction matters: Level 1 detects **what** is wrong (pattern matching). Level 2 explains **why** it's wrong and **how** to fix it (reasoning).

## 3. Non-goals

- MCP server (deferred — value too thin when dashboard has all data + SDK)
- Real-time in-session coaching
- Multi-user / team comparisons
- Scores, percentages, or metrics as the primary display — numbers only appear when they punch
- Visualization — charts and graphs are already handled by the existing Insights page

## 4. Design

### Level 1 — Punchline Hints (always visible, server-computed)

3-5 short hints. Each one is: **what you did wrong** + **what it cost you** + **what to do instead.** One or two sentences max. No scores, no bars, no dashboards.

```
┌─────────────────────────────────────────────────────┐
│  Efficiency Hints                     This week  ▾  │
│                                                     │
│  [repeat] You wasted $18 on 5 retry loops. A       │
│     single Read or check command would have         │
│     prevented most of them.                         │
│                                                     │
│  [eye-off] 38% of your edits had no prior Read.    │
│     Edits with a prior Read succeeded 90% of the   │
│     time vs 62% without.                            │
│                                                     │
│  [layers] You started 8 sessions that could have   │
│     been 3. Continuing a session reuses cached      │
│     context — faster and cheaper.                   │
│                                                     │
│  [trending-up] Your tool error rate dropped 40%    │
│     vs last period. Whatever you changed, keep      │
│     doing it.                                       │
│                                                     │
│  [Tell me more →]                                   │
└─────────────────────────────────────────────────────┘
```

Icons are Lucide icon name strings. The dashboard's `HintCard` component maps them via an `ICON_MAP`:
- `"repeat"` → wasted retries
- `"eye-off"` → blind edits
- `"layers"` → session fragmentation
- `"dollar-sign"` → cost waste
- `"brain"` → model overuse
- `"database"` → cache misses
- `"trending-up"` → improving trend

Hints are generated server-side from pattern detection. No AI call needed — they're templated sentences with computed values inserted.

**Hint categories** (server picks the most relevant 3-5):

| Category | Dimension | Trigger condition | Punchline template |
|---|---|---|---|
| Wasted retries | Cost + Quality | retry_loops detected (same tool+args ≥3×) | "You wasted $X on Y retry loops. A single Read or check command would have prevented most of them." |
| Blind edits | Quality + Efficiency | edit_without_read_ratio < 0.7 | "{pct}% of your edits had no prior Read. Edits with file context had {success_rate}% first-try success vs {no_context_rate}% without." |
| Session fragmentation | Cost + Latency | many short sessions on same project | "You started {n} sessions that could have been {m}. Continuing reuses cached context — faster and cheaper." |
| Cost waste | Cost | high-cost sessions with low completion | "You spent ${cost} on {n} sessions that never finished. {top_reason}." |
| Model overuse | Cost | Opus used where Sonnet would suffice | "You used Opus for {n} simple tasks that Sonnet handles equally well. That's ${savings} you didn't need to spend." |
| Cache misses | Cost + Latency | cache_hit_rate < 0.3 across sessions | "Your sessions re-read the same context every turn. ${wasted} went to re-processing files Claude already saw." |
| Improving trend | (any) | any dimension improved ≥20% vs prior period | "{dimension} improved {delta}% vs last week. Whatever you changed, keep doing it." |

**Ranking:** hints are sorted by impact (estimated $ or time saved). Show top 3-5. If everything is good, show one positive hint ("No major issues — your sessions look efficient. Keep it up.").

**Range selector:** 24h | 7d | 30d | 90d (top-right dropdown, matches existing Insights). Note: InsightsPage maps the "all" time range to "90d" when passing to EfficiencyHints.

### Level 2 — Drill-Down (on-demand)

Two paths:

**Click a specific hint** → evidence panel expands (no AI needed):
- The exact sessions where it happened (with links to session view)
- The specific events (tool calls, retries, failures)
- Numbers: how much time/cost was wasted
- "How to fix it": concrete workflow changes

**Click "Tell me more"** → full AI-synthesized report streamed via SDK:

The AI acts as a **usage advisor**. It receives all detector evidence (sessions, costs, stats, recommendations) and reasons across the four dimensions to produce:

1. **Diagnosis** — what's wrong, backed by specific sessions and dollar amounts
2. **Root cause** — why it's happening (habits, patterns, misuse) — this is what Level 1 can't do
3. **Prescription** — exactly what to change, with expected impact

The AI prompt is structured as:

**System prompt** defines the advisor role and the four-dimension analysis framework:
- **Cost analysis** — where money is wasted, which sessions burned cash and why, model selection efficiency
- **Efficiency analysis** — tool usage order (Read before Edit), session management (fragmentation vs continuation), cache leverage
- **Quality analysis** — first-try success rate, retry patterns, edit failure patterns, root causes of failures
- **Latency analysis** — session duration, time wasted on retries, sessions that ran long relative to complexity

The system prompt also defines:
- Report format (exact sections, what each must contain)
- Rules (cite data, no filler, skip empty dimensions, specific over generic)
- Tone (direct, data-backed, prescriptive)

**User message** contains only the pre-computed evidence from all 7 detectors — session IDs, costs, stats, patterns. The AI reasons about this data; it doesn't compute it.

**Report output format:**

```markdown
### This period at a glance
3-5 bullets. Lead with the most important finding.

### Cost analysis
Where money is wasted. Dollar amounts. Specific sessions.

### Efficiency & quality
Tool usage patterns, retry loops, blind edits, fragmentation.
Compare "what they did" vs "what would have been better."

### What to change this week
3 recommendations, each with:
- What to do (imperative, one sentence)
- Why (evidence from their data)
- Expected impact (estimated savings)
```

## 5. Server API

### `GET /api/efficiency/hints?range=7d`

Valid ranges: `24h`, `7d`, `30d`, `90d`.

Returns the punchline hints:
```json
{
  "range": "7d",
  "hints": [
    {
      "id": "wasted_retries-7d",
      "category": "wasted_retries",
      "icon": "repeat",
      "punchline": "You wasted $18.00 on 5 retry loops. A single Read or check command would have prevented most of them.",
      "impact": 18.0,
      "trend": "new",
      "drilldownAvailable": true
    }
  ],
  "sessionCount": 23,
  "totalCost": 47.20
}
```

Notes:
- `impact` is a single number (estimated $ or effort weight), not a structured object.
- `trend` is currently hardcoded to `"new"` for all hints (trend comparison not yet implemented in `rankAndFormat()`).
- No `priorPeriodCost` is returned.

Compute: `buildDetectorContext()` → `loadEvents()` → run all 7 pattern detectors → `rankAndFormat()` (filter detected, sort by impact, take top 5) → return. Pure server-side, no AI.

**In-memory cache:** `computeHints()` stores results in a `Map<range, PatternResult[]>`. The evidence endpoint reads from this cache. A cold evidence request (without a prior `computeHints()` call for that range) returns 404.

### `GET /api/efficiency/hints/:id/evidence`

Returns evidence for a single hint (no AI needed). The `:id` is the hint's `id` field (e.g. `wasted_retries-7d`). Evidence is read from the in-memory cache populated by the last `computeHints()` call. Returns 404 if the hint is not in cache.

```json
{
  "hintId": "wasted_retries-7d",
  "category": "wasted_retries",
  "evidence": {
    "sessions": [
      { "id": "abc-123", "detail": "3 retry loops, $8.50 wasted", "cost": 8.50, "wastedCost": 8.50 },
      { "id": "def-456", "detail": "2 retry loops, $4.20 wasted", "cost": 4.20, "wastedCost": 4.20 }
    ],
    "recommendation": "Before running a command you're unsure about, ask Claude to check if the file, path, or config exists first. One Read or ls prevents cascading retries.",
    "stats": { "totalWasted": 18.0, "totalRetries": 23, "sessionsAffected": 5 }
  }
}
```

Notes:
- Response uses `hintId` (camelCase), not `hint_id`.
- Session objects are generic: `{ id, detail, cost, wastedCost? }`. The `detail` field is a human-readable string describing what happened. No structured fields like `retryCount` or `tool`.
- `stats` is `Record<string, number | string>` — each detector populates different keys. No fixed schema.

### `POST /api/efficiency/report`

Body: `{ range: "24h" | "7d" | "30d" | "90d" }`

Returns: SSE stream of markdown chunks (`data: {"text": "..."}\n\n`) terminated by `data: [DONE]\n\n`.

Server flow:
1. Compute all hints + evidence for the range
2. Build system prompt (advisor role + 4-dimension framework + report format + rules)
3. Build user message (pre-computed detector evidence — sessions, costs, stats)
4. Stream AI synthesis to client
5. Save completed report to `~/.claude/devtools/reports/{date}-{range}.md`

**AI client selection (SessionManager-first with API key fallback):**
- Primary: uses `ctx.state.sessionManager` (Claude Code's SessionManager), which inherits the user's Claude Code authentication seamlessly — no API key needed. Creates a temporary session, sends the prompt, streams text deltas.
- Fallback: if no SessionManager is available, imports `@anthropic-ai/sdk` and reads `ANTHROPIC_API_KEY` from the environment. Uses `client.messages.stream()` directly.

### `GET /api/efficiency/reports`

Returns a bare JSON array of past reports (not wrapped in `{ "reports": [...] }`):
```json
[
  { "id": "2026-05-17-7d", "date": "2026-05-17", "range": "7d", "filename": "2026-05-17-7d.md" }
]
```

Note: includes a `filename` field. Sorted by date descending.

### `GET /api/efficiency/reports/:id`

Returns the saved report as JSON with a `markdown` field:
```json
{
  "markdown": "### This period at a glance\n..."
}
```

## 6. Pattern Detectors

Each detector runs over sessions in the range and returns structured findings. All server-side, no AI. Each detector maps to one or more of the four dimensions (Cost, Efficiency, Quality, Latency).

### Wasted Retries (Cost + Quality)
Walk events per session. If tool_use has same `(tool, args_hash)` appearing ≥3× consecutively, flag it. Cost = sum of token costs for the retry events. Group by tool.

### Blind Edits (Quality + Efficiency)
For each Edit/Write tool_use, check if same file was Read within the prior 10 events. Track success: did a subsequent Edit on the same file follow within 5 events (indicating the first edit failed)? Compute first-try success rate for edits-with-Read vs edits-without-Read. Minimum gate: `totalEdits >= 3` before reporting as detected.

### Session Fragmentation (Cost + Latency)
Group sessions by project + day. Per group: filter to short sessions (`eventCount < 15`). Only flag groups with **>= 3 short sessions**. Global gate: `totalFragmented >= 3` (sum of all short sessions across all flagged groups) before reporting as detected. Impact formula: `totalFragmented * 0.3` (not a token-sum estimate).

### Cost Waste (Cost)
Find sessions where cost > $3 AND (no end_turn OR error_rate > 25%). These are expensive sessions that didn't produce results. Surface the top reason (high error rate, abandoned, loop detected). Global gate: `totalWasted > 2` (sum of wasted cost across flagged sessions) before reporting as detected.

### Model Overuse (Cost)
For sessions using Opus: a session is considered "simple" if `subagentCount === 0 AND eventCount <= 40`. For such sessions, if there are >= 3 Opus calls and Sonnet savings > $0.50, flag as "Sonnet would suffice." Estimate savings by repricing all Opus events at Sonnet rates.

### Cache Misses (Cost + Latency)
Per session: `hitRate = cache_read_tokens / (cache_read + cache_creation + input_tokens)`. Per-session gate: only include sessions where `totalInput > 1000 AND hitRate < 0.2`. Global gate: `totalInput > 5000` (sum across all sessions) AND `overallHitRate < 0.3`. Impact: `(1 - overallHitRate) * 2`.

### Improving Trend (any dimension)
Only two metrics are tracked: `errorRate` and `cacheHitRate`. Requires `priorSessions.length >= 3` — returns not-detected if insufficient history. Compare each metric vs prior period: errorRate improved if `current < prior * 0.8`; cacheHitRate improved if `current > prior * 1.2`. If either improved, generate a positive hint.

## 7. Dashboard Components

### `EfficiencyHints.tsx`
- Replaces the "Coming soon" placeholder
- Receives `range` as a prop from parent InsightsPage (not an internal dropdown)
- Fetches `GET /api/efficiency/hints?range={range}`
- Renders 3-5 hint cards with icon + punchline
- "Tell me more" button → opens EfficiencyReport
- Click any hint → expands inline evidence panel

### `HintCard.tsx`
- Single hint with icon + punchline text
- Expandable — click to show/hide evidence
- Text at least `text-base` for readability

### `HintEvidence.tsx`
- Expandable panel below a hint
- Fetches `GET /api/efficiency/hints/:id/evidence`
- Shows: "How to fix it" recommendation, session list with links
- Session IDs link to the session detail page
- Note: the `stats` field is fetched but not currently rendered in the UI (future enhancement)

### `EfficiencyReport.tsx`
- Full report view (from "Tell me more")
- Calls `POST /api/efficiency/report`, renders SSE markdown stream
- react-markdown + remark-gfm for rendering
- Shows loading state with progress
- On SDK failure: falls back to showing all hints with evidence expanded inline

## 8. Data Flow

```
Visualization (existing)     Aggregation (existing)      Intelligence (NEW)
├── Token charts             ├── Total cost              ├── Pattern detection
├── Heatmaps                 ├── Session counts          ├── Root-cause analysis
├── Hourly bars              ├── Model distribution      ├── Diagnosis + prescription
└── Trend lines              └── Avg cost/turn           └── AI-synthesized report
```

```
Dashboard loads Insights page
  → GET /api/efficiency/hints?range=7d
  → Server: discoverSessions() → run 7 detectors → rank → template
  → Dashboard renders punchline hints

User clicks a hint
  → GET /api/efficiency/hints/:id/evidence
  → Server: return pre-computed evidence (no AI)
  → Dashboard expands evidence panel

User clicks "Tell me more"
  → POST /api/efficiency/report { range: "7d" }
  → Server: compute all evidence → system prompt (advisor + 4 dimensions) → user message (data)
  → AI streaming (SessionManager-first, SDK fallback):
    1. If ctx.state.sessionManager exists: use Claude Code auth (seamless, no API key needed)
    2. Else: import @anthropic-ai/sdk, read ANTHROPIC_API_KEY from env
  → Dashboard renders markdown live via SSE
  → Server saves to ~/.claude/devtools/reports/
```

## 9. Empty / Edge States

- **No sessions in range:** "No Claude Code sessions found in the last {range}. Start using Claude Code and check back."
- **Everything is good:** "No major issues this week. Your sessions are efficient, costs are reasonable, and error rates are low. Keep it up."
- **Not enough data for comparison:** Show hints without trend arrows. "Not enough history for trend comparison yet."
- **SDK failure:** "Couldn't generate the full report. Here's what we found:" → fall back to showing all hints with evidence inline.

## 10. Testing

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

## 11. Implementation Order

1. Server: 7 pattern detectors (pure compute, no endpoints yet)
2. Server: hint ranking + punchline templating
3. Server: `GET /api/efficiency/hints` endpoint
4. Dashboard: `EfficiencyHints` component replacing placeholder
5. Server: evidence computation per hint
6. Server: `GET /api/efficiency/hints/:id/evidence` endpoint
7. Dashboard: `HintEvidence` expandable panel
8. Server: `POST /api/efficiency/report` with system prompt + SDK streaming
9. Dashboard: `EfficiencyReport` with SSE markdown rendering
10. Server: report persistence + history endpoints
11. Dashboard: report history in EfficiencyReport sidebar
12. Polish: empty states, error handling, loading animations
