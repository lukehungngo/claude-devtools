# Hybrid AI Coaching Diagnostics

## Goal

Insights should feel like a coach, not a dashboard. It should tell users how to build better with Claude Code using recent session data, while keeping every user-facing claim traceable to evidence.

## Mental Model

```text
Deterministic detectors prove measurable patterns.
AI finds and explains softer workflow patterns.
Server validates, ranks, and merges.
UI presents concise coaching with evidence on demand.
```

The detectors are the product brain. AI is the voice and pattern explainer. The server decides what is safe to ship.

## Insight Types

### Proven Diagnostics

Rule-backed diagnostics produced from deterministic detectors.

Examples:
- tool failure storm
- edit rejection rate
- cache reuse problem
- long turn durations
- high-context slowdown
- cost-per-LOC outlier

Rules:
- Server owns rank, IDs, pattern, category, severity, confidence, impact, sessions, evidence, and stats.
- AI may rewrite coaching copy only.
- Confident wording is allowed because the pattern is proven by rules.

### AI Coaching Observations

Behavioral observations mined from structured session summaries or selected transcript excerpts.

Examples:
- requests start too broad
- the user changes direction mid-session
- the same correction repeats across turns
- Claude explores unrelated files before narrowing
- sessions end after confusion
- large bundled requests cause rework

Rules:
- Must be labeled as observational.
- Must cite concrete sessions or turns.
- Must use softer wording such as "may", "looks like", or "in these examples".
- Must not include exact dollars, minutes, token counts, or savings unless computed by deterministic code.
- Must pass server validation before display.

## Server Ownership

Server-owned fields:
- `id`
- `kind`
- `rank`
- `sourcePattern`
- `category`
- `severity`
- `confidence`
- `impactLabel`
- `impactValue`
- `impactDetail`
- `evidenceChips`
- `evidenceSessions`
- `evidenceSessionIds`
- `whyFlagged`

AI-owned copy fields:
- `title`
- `summary`
- `changeThisWeek`
- `tellMeMore.whatHappened`
- `tellMeMore.whyItMatters`
- `tellMeMore.recommendedChanges`

If AI fails, the server returns deterministic fallback copy.

## Data Contract

```ts
type InsightKind = "proven" | "observation";

interface DiagnosticResult {
  id: string;
  kind: InsightKind;
  rank: number;
  sourcePattern: string;
  category: "quality" | "cost" | "latency" | "workflow" | "model" | "context";
  severity: "high" | "medium" | "low" | "positive";
  confidence: "high" | "medium" | "low";
  title: string;
  summary: string;
  impactLabel: string;
  impactValue: string;
  impactDetail: string;
  changeThisWeek: string;
  evidenceChips: string[];
  evidenceSessions?: EvidenceSession[];
  evidenceSessionIds: string[];
  whyFlagged: string[];
  aiGeneratedFields: string[];
  tellMeMore: {
    whatHappened: string;
    whyItMatters: string;
    recommendedChanges: Array<{
      priority: number;
      change: string;
      expectedEffect: string;
    }>;
  };
}
```

## Ranking

Ranking order:
1. Proven high-impact diagnostics.
2. Proven medium-impact diagnostics.
3. AI observations with strong evidence.
4. Positive habits worth preserving.
5. Weak observations only if fewer than 3 useful insights exist.

Display count:
- Minimum 3 if evidence supports 3.
- Up to 5 if confidence is strong enough.
- Never pad with weak filler.

## UI

Headline:

```text
Build better with AI
Based on your last 7 days, these are the 4 patterns that slowed you down most.
```

The UI has three abstraction levels:
1. Concise diagnosis.
2. Expanded coaching.
3. Evidence.

Proven diagnostics render as normal coaching cards. Observations render with a subtle `Observed pattern` label.

## AI Prompt Strategy

Use two separate prompts.

### Proven Copy Rewrite Prompt

Input: deterministic diagnostics.

Output: copy fields only, keyed by diagnostic `id`.

Purpose: improve title, summary, change recommendation, and explanation without changing facts.

### Observation Mining Prompt

Input: structured session summaries and selected excerpts.

Output: candidate observations with citations.

Purpose: find high-value behavioral patterns that are not cleanly detected with math.

The server rejects any observation without citations or with invented impact values.

## Acceptance Criteria

- Proven diagnostics work without AI.
- AI cannot change rank, category, severity, confidence, evidence, sessions, impact, or stats.
- AI copy is merged only through a server-side allowlist.
- Invalid AI output is discarded without blocking Insights.
- Observational insights are clearly distinguishable from proven diagnostics.
- Observational insights require cited sessions or turns.
- The dashboard never displays unsupported exact savings or timings.
- Report snapshots still save independently when regenerated.
