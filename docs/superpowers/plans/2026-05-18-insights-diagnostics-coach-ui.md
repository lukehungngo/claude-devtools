# Insights Diagnostics Coach UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old flat Efficiency Hints surface with a coach-first Insights experience powered by six deterministic Quick Win detectors, AI-written diagnostics, and evidence-first drilldowns.

**Architecture:** The server computes deterministic Quick Wins from session JSONL, converts them into a rich diagnostics contract, and streams deeper AI analysis using only precomputed evidence. The dashboard renders the mockup from `Claude DevTools Design System/ui_kits/insights.html`: compact period summary, ranked diagnostics, selected coaching analysis, Quick Wins, then existing charts as evidence.

**Tech Stack:** TypeScript, Express, Vitest, React 18, Vite, Tailwind `dt-*` tokens, lucide-react icons, existing Insights hooks, existing Claude Code SessionManager streaming path.

---

## Current Codebase Scan

Relevant server files:

- `server/src/analyzer/efficiency/types.ts` has the old 7-category `HintCategory` union and flat `PatternResult`.
- `server/src/analyzer/efficiency/index.ts` loads sessions and runs old detectors: retries, blind edits, fragmentation, cost waste, model overuse, cache misses, improving trend.
- `server/src/analyzer/tool-stats.ts` already maps `tool_use.id` to `tool_result.tool_use_id` and counts `is_error`.
- `server/src/analyzer/metrics.ts` already calculates token cost from model usage.
- `server/src/types.ts` contains the event shapes needed for assistant usage tokens, tool calls, tool results, system `turn_duration`, attachments, and permission-denied system events.
- `server/src/http/routes/efficiency-routes.ts` exposes `/api/efficiency/hints`, evidence, report streaming, and saved reports.

Relevant dashboard files:

- `dashboard/src/routes/InsightsPage.tsx` is still dashboard-first: stats, secondary stats, `EfficiencyHints`, then charts/evidence.
- `dashboard/src/components/insights/EfficiencyHints.tsx` fetches `/api/efficiency/hints` and renders old flat hint cards.
- `dashboard/src/components/insights/HintCard.tsx` and `HintEvidence.tsx` are too narrow for the new coach-card and analysis-panel model.
- `dashboard/scripts/check-no-inline-styles.mjs` blocks new inline static style usage outside its allowlist. New UI work must use Tailwind classes and `dt-*` tokens instead of inline static styles.

Relevant design source:

- `Claude DevTools Design System/ui_kits/insights.html` has the target layout:
  - `period-chip`
  - `coach-section`
  - 3-card `coach-grid`
  - primary `coach-card`
  - selected `analysis` panel
  - `quickwins-section`
  - evidence charts below

Important working-tree note:

- The worktree is already dirty. Before implementation, inspect diffs in these files and preserve user/designer changes:
  - `Claude DevTools Design System/ui_kits/insights.html`
  - `dashboard/src/routes/InsightsPage.tsx`
  - `dashboard/src/components/insights/HintCard.tsx`
  - `dashboard/src/components/insights/HintEvidence.tsx`
  - `server/src/analyzer/efficiency/index.ts`
  - `server/src/http/routes/efficiency-routes.ts`

---

## Target Detector Set

The six Quick Wins are the canonical deterministic detectors:

| Detector | Goal | Warn | Praise | User impact text |
|---|---|---|---|---|
| `edit_rejection_rate` | Quality | `rejectRate > 0.20 AND totalDecisions >= 5` | `rejectRate < 0.05 AND totalDecisions >= 5` | `N of M proposed edits rejected` |
| `tool_failure_storm` | Quality | `failRate > 0.10 AND totalToolCalls >= 20` | `failRate < 0.02 AND totalToolCalls >= 20` | `N of M tool calls failed` |
| `cache_hit_ratio` | Cost | `cacheHitRatio < 0.60 AND inputTokens > 50K` | `cacheHitRatio > 0.80 AND inputTokens > 50K` | `estimated ~$X potential cache savings` |
| `cost_per_loc_outlier` | Cost | `costPerLoc > 0.50 AND locChanged >= 10` | `costPerLoc < 0.10 AND locChanged >= 10` | `estimated $X.XX per LOC changed` |
| `long_turn_durations` | Latency | `p95DurationMs > 60000 AND longTurnCount >= 5` | `p95DurationMs < 20000 AND totalToolCalls >= 20` | `p95 turn duration Xs (N turns >60s)` |
| `high_context_duration_tax` | Latency | `highContextDurationRatio > 1.8 AND highContextTurns >= 5 AND lowContextTurns >= 5` | `highContextDurationRatio < 1.2 AND highContextTurns >= 5` | `high-context turns were X.Xx slower` |

---

## File Structure

Create or modify these files:

```text
server/src/analyzer/efficiency/
  types.ts
  index.ts
  hint-ranker.ts
  signal-extractors.ts
  edit-rejection-rate.ts
  tool-failure-storm.ts
  cache-hit-ratio.ts
  cost-per-loc-outlier.ts
  long-turn-durations.ts
  high-context-duration-tax.ts
  ai-diagnostics-prompt.ts
  __tests__/
    signal-extractors.test.ts
    edit-rejection-rate.test.ts
    tool-failure-storm.test.ts
    cache-hit-ratio.test.ts
    cost-per-loc-outlier.test.ts
    long-turn-durations.test.ts
    high-context-duration-tax.test.ts
    hint-ranker.test.ts
    index.test.ts

server/src/http/routes/
  efficiency-routes.ts

dashboard/src/lib/
  insightsDiagnosticsTypes.ts

dashboard/src/hooks/
  useEfficiencyDiagnostics.ts

dashboard/src/components/insights/
  DiagnosticsSection.tsx
  DiagnosticCard.tsx
  DiagnosticAnalysis.tsx
  QuickWinsList.tsx
  DiagnosticsStates.tsx
  EfficiencyHints.tsx
  __tests__/
    DiagnosticsSection.test.tsx
    DiagnosticCard.test.tsx
    DiagnosticAnalysis.test.tsx
    QuickWinsList.test.tsx

dashboard/src/routes/
  InsightsPage.tsx
  InsightsPage.test.tsx
```

Do not delete the old detector files in the first pass. Stop using them from `index.ts`, then remove them in a separate cleanup after no imports remain.

---

## Task 1: Define The New Efficiency Contract

**Files:**

- Modify: `server/src/analyzer/efficiency/types.ts`
- Test: `server/src/analyzer/efficiency/__tests__/hint-ranker.test.ts`

- [ ] **Step 1: Update the server types**

Replace the old category union and flat hint-only model with this shape while keeping `hints` as a compatibility alias for Quick Wins:

```typescript
export type EfficiencyRange = "24h" | "7d" | "30d" | "90d";

export type QuickWinCategory = "quality" | "cost" | "latency";
export type DiagnosticCategory = "quality" | "cost" | "latency" | "workflow" | "model" | "context";
export type SignalStatus = "warn" | "praise";
export type SignalSeverity = "high" | "medium" | "low" | "positive";
export type SignalConfidence = "high" | "medium" | "low";

export type QuickWinPattern =
  | "edit_rejection_rate"
  | "tool_failure_storm"
  | "cache_hit_ratio"
  | "cost_per_loc_outlier"
  | "long_turn_durations"
  | "high_context_duration_tax";

export interface PeriodSummary {
  range: EfficiencyRange;
  spend: number;
  tokens: number;
  sessions: number;
  turns: number;
}

export interface EvidenceSession {
  id: string;
  detail: string;
  cost: number;
  wastedCost?: number;
}

export interface QuickWinEvidence {
  sessions: EvidenceSession[];
  recommendation: string;
  stats: Record<string, number | string>;
  chips: string[];
}

export interface QuickWinResult {
  id: string;
  pattern: QuickWinPattern;
  status: SignalStatus;
  category: QuickWinCategory;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  detected: boolean;
  impact: number;
  title: string;
  punchline: string;
  impactLabel: string;
  impactValue: string;
  recommendation: string;
  rule: string;
  icon: string;
  evidence: QuickWinEvidence;
}

export interface DiagnosticResult {
  id: string;
  rank: number;
  sourcePattern: QuickWinPattern;
  category: DiagnosticCategory;
  severity: SignalSeverity;
  confidence: SignalConfidence;
  title: string;
  summary: string;
  impactLabel: string;
  impactValue: string;
  impactDetail: string;
  changeThisWeek: string;
  evidenceChips: string[];
  evidenceSessionIds: string[];
  whyFlagged: string[];
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

export interface Hint {
  id: string;
  category: QuickWinPattern;
  icon: string;
  punchline: string;
  impact: number;
  trend: "better" | "worse" | "stable" | "new";
  drilldownAvailable: boolean;
}

export interface HintsResponse {
  range: EfficiencyRange;
  period: PeriodSummary;
  diagnostics: DiagnosticResult[];
  quickWins: QuickWinResult[];
  hints: Hint[];
  sessionCount: number;
  totalCost: number;
}

export interface EvidenceResponse {
  hintId: string;
  category: QuickWinPattern;
  evidence: QuickWinEvidence;
}
```

- [ ] **Step 2: Run the focused type tests**

Run:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/hint-ranker.test.ts
```

Expected: existing tests fail because they still expect old categories and flat `PatternResult`.

- [ ] **Step 3: Commit**

```bash
git add server/src/analyzer/efficiency/types.ts server/src/analyzer/efficiency/__tests__/hint-ranker.test.ts
git commit -m "feat(insights): define diagnostics efficiency contract"
```

---

## Task 2: Build Shared Signal Extractors

**Files:**

- Create: `server/src/analyzer/efficiency/signal-extractors.ts`
- Create: `server/src/analyzer/efficiency/__tests__/signal-extractors.test.ts`

- [ ] **Step 1: Add tests for tool mapping, turn grouping, LOC, and permission denial extraction**

Test these cases:

```typescript
import { describe, expect, it } from "vitest";
import {
  collectToolSignals,
  estimateLocChanged,
  groupEfficiencyTurns,
  collectEditDecisions,
} from "../signal-extractors.js";
import type { AssistantEvent, SystemEvent, UserEvent } from "../../../types.js";

function assistantTool(id: string, name: string, input: Record<string, unknown>): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:01.000Z",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
      model: "claude-sonnet-4-6",
      id: `msg-${id}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 1000, output_tokens: 50 },
    },
  };
}

function toolResult(id: string, isError: boolean): UserEvent {
  return {
    type: "user",
    uuid: `u-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:02.000Z",
    userType: "internal",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content: "result", is_error: isError }],
    },
  };
}

describe("signal extractors", () => {
  it("maps failed tool results back to tool names", () => {
    const signals = collectToolSignals([
      assistantTool("t1", "Bash", { command: "bad-command" }),
      toolResult("t1", true),
    ]);
    expect(signals.totalToolCalls).toBe(1);
    expect(signals.failedToolCalls).toBe(1);
    expect(signals.failuresByTool.get("Bash")).toBe(1);
  });

  it("estimates LOC changed from Edit and Write inputs", () => {
    const edit = estimateLocChanged("Edit", { old_string: "a\nb", new_string: "a\nc\nd" });
    const write = estimateLocChanged("Write", { content: "one\ntwo\nthree" });
    expect(edit).toBe(3);
    expect(write).toBe(3);
  });

  it("groups turns using external user prompts and turn_duration events", () => {
    const start: UserEvent = {
      type: "user",
      uuid: "u-start",
      sessionId: "s1",
      timestamp: "2026-05-18T00:00:00.000Z",
      userType: "external",
      message: { role: "user", content: "fix tests" },
    };
    const duration: SystemEvent = {
      type: "system",
      subtype: "turn_duration",
      uuid: "sys-1",
      sessionId: "s1",
      timestamp: "2026-05-18T00:01:05.000Z",
      durationMs: 65000,
    };
    const turns = groupEfficiencyTurns([start, assistantTool("t1", "Read", { file_path: "/tmp/a.ts" }), duration]);
    expect(turns).toHaveLength(1);
    expect(turns[0].durationMs).toBe(65000);
    expect(turns[0].inputTokens).toBe(1000);
  });

  it("counts permission_denied system events for edit-capable tools", () => {
    const denied = {
      type: "system",
      subtype: "permission_denied",
      uuid: "sys-denied",
      sessionId: "s1",
      timestamp: "2026-05-18T00:00:03.000Z",
      tool_name: "Edit",
      tool_use_id: "t1",
      message: "Tool call blocked",
    } as SystemEvent & Record<string, unknown>;
    const decisions = collectEditDecisions([denied]);
    expect(decisions.totalDecisions).toBe(1);
    expect(decisions.rejectedDecisions).toBe(1);
  });
});
```

- [ ] **Step 2: Implement the extractor module**

Export these functions and types:

```typescript
export interface ToolSignals {
  totalToolCalls: number;
  failedToolCalls: number;
  failuresByTool: Map<string, number>;
}

export interface EfficiencyTurn {
  sessionId: string;
  index: number;
  startTime: string;
  endTime: string;
  durationMs: number | null;
  inputTokens: number;
  toolCalls: number;
}

export interface EditDecisionSignals {
  totalDecisions: number;
  rejectedDecisions: number;
  rejectedSessions: Map<string, number>;
}
```

Implementation rules:

- Use `normalizeContent` from `server/src/lib/normalizeContent.ts`.
- Count `assistant` content blocks with `type === "tool_use"` as tool calls.
- Count `user` content blocks with `type === "tool_result" && is_error === true` as failures.
- Treat `Edit`, `Write`, `MultiEdit`, and `NotebookEdit` as edit-capable tools.
- Treat `system.subtype === "permission_denied"` with an edit-capable `tool_name` as a rejected edit decision.
- Count approved edit decisions from edit-capable tool uses when no matching permission denial exists for the same `tool_use_id`.
- Group turns at external non-meta user prompts, excluding internal tool-result users.
- Attach `system.subtype === "turn_duration"` to the current turn.
- For turn input context, sum assistant usage `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.

- [ ] **Step 3: Run extractor tests**

Run:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/signal-extractors.test.ts
```

Expected: all extractor tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/analyzer/efficiency/signal-extractors.ts server/src/analyzer/efficiency/__tests__/signal-extractors.test.ts
git commit -m "feat(insights): add efficiency signal extractors"
```

---

## Task 3: Implement The Six Quick Win Detectors

**Files:**

- Create: `server/src/analyzer/efficiency/edit-rejection-rate.ts`
- Create: `server/src/analyzer/efficiency/tool-failure-storm.ts`
- Create: `server/src/analyzer/efficiency/cache-hit-ratio.ts`
- Create: `server/src/analyzer/efficiency/cost-per-loc-outlier.ts`
- Create: `server/src/analyzer/efficiency/long-turn-durations.ts`
- Create: `server/src/analyzer/efficiency/high-context-duration-tax.ts`
- Create tests for each detector under `server/src/analyzer/efficiency/__tests__/`

- [ ] **Step 1: Write detector tests**

Each detector test must cover warn, praise, and not-detected:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/edit-rejection-rate.test.ts
pnpm -C server test src/analyzer/efficiency/__tests__/tool-failure-storm.test.ts
pnpm -C server test src/analyzer/efficiency/__tests__/cache-hit-ratio.test.ts
pnpm -C server test src/analyzer/efficiency/__tests__/cost-per-loc-outlier.test.ts
pnpm -C server test src/analyzer/efficiency/__tests__/long-turn-durations.test.ts
pnpm -C server test src/analyzer/efficiency/__tests__/high-context-duration-tax.test.ts
```

Expected before implementation: each command fails because the detector module does not exist.

- [ ] **Step 2: Implement detector output consistently**

Each detector exports one function:

```typescript
export function detectEditRejectionRate(sessions: SessionWithEvents[]): QuickWinResult
export function detectToolFailureStorm(sessions: SessionWithEvents[]): QuickWinResult
export function detectCacheHitRatio(sessions: SessionWithEvents[]): QuickWinResult
export function detectCostPerLocOutlier(sessions: SessionWithEvents[]): QuickWinResult
export function detectLongTurnDurations(sessions: SessionWithEvents[]): QuickWinResult
export function detectHighContextDurationTax(sessions: SessionWithEvents[]): QuickWinResult
```

Use stable ids:

```typescript
"edit_rejection_rate"
"tool_failure_storm"
"cache_hit_ratio"
"cost_per_loc_outlier"
"long_turn_durations"
"high_context_duration_tax"
```

Use these icon names:

```typescript
"shield-x"
"wrench"
"database"
"code-2"
"timer"
"gauge"
```

- [ ] **Step 3: Cache savings calculation**

For `cache_hit_ratio`, calculate:

```typescript
const cacheableTokens = Math.max(0, inputTokens + cacheCreationTokens - cacheReadTokens);
const inputCost = calculateTokenCost(model, {
  inputTokens: cacheableTokens,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
});
const cacheReadCost = calculateTokenCost(model, {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: cacheableTokens,
});
const estimatedSavings = Math.max(0, inputCost - cacheReadCost);
```

When sessions use multiple models, calculate per assistant event and sum.

- [ ] **Step 4: Cost-per-LOC calculation**

Use:

```typescript
const costPerLoc = locChanged > 0 ? totalCost / locChanged : 0;
```

Only count code-like file extensions:

```text
.ts .tsx .js .jsx .mjs .cjs .py .go .rs .java .kt .swift .c .cc .cpp .h .hpp .cs .rb .php .sh .zsh .fish .sql .css .scss .html .vue .svelte
```

- [ ] **Step 5: Long-turn duration calculation**

Compute p95 with sorted durations:

```typescript
const sorted = durations.slice().sort((a, b) => a - b);
const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
```

Count `longTurnCount` as duration over `60_000`.

- [ ] **Step 6: High-context duration tax calculation**

Use:

```typescript
const high = turns.filter((t) => t.inputTokens > 150_000 && t.durationMs !== null);
const low = turns.filter((t) => t.inputTokens < 50_000 && t.durationMs !== null);
const ratio = mean(high.map((t) => t.durationMs)) / mean(low.map((t) => t.durationMs));
```

Do not mention TTFT in detector output.

- [ ] **Step 7: Run all detector tests**

Run:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/edit-rejection-rate.test.ts src/analyzer/efficiency/__tests__/tool-failure-storm.test.ts src/analyzer/efficiency/__tests__/cache-hit-ratio.test.ts src/analyzer/efficiency/__tests__/cost-per-loc-outlier.test.ts src/analyzer/efficiency/__tests__/long-turn-durations.test.ts src/analyzer/efficiency/__tests__/high-context-duration-tax.test.ts
```

Expected: all six detector test files pass.

- [ ] **Step 8: Commit**

```bash
git add server/src/analyzer/efficiency
git commit -m "feat(insights): add six quick win detectors"
```

---

## Task 4: Rank Quick Wins And Build Diagnostics

**Files:**

- Modify: `server/src/analyzer/efficiency/hint-ranker.ts`
- Modify: `server/src/analyzer/efficiency/index.ts`
- Modify: `server/src/analyzer/efficiency/__tests__/hint-ranker.test.ts`
- Modify: `server/src/analyzer/efficiency/__tests__/index.test.ts`

- [ ] **Step 1: Replace old ranking with two outputs**

`rankAndFormat` should return compatibility `Hint[]` from detected Quick Wins.

Add:

```typescript
export function rankQuickWins(results: QuickWinResult[]): QuickWinResult[] {
  return results
    .filter((r) => r.detected)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6);
}

export function buildDiagnostics(results: QuickWinResult[]): DiagnosticResult[] {
  return rankQuickWins(results)
    .slice(0, 3)
    .map((r, index) => ({
      id: `${r.pattern}-diagnostic`,
      rank: index + 1,
      sourcePattern: r.pattern,
      category: r.category,
      severity: r.severity,
      confidence: r.confidence,
      title: r.title,
      summary: r.punchline,
      impactLabel: r.impactLabel,
      impactValue: r.impactValue,
      impactDetail: r.status === "praise" ? "positive signal" : "this period",
      changeThisWeek: r.recommendation,
      evidenceChips: r.evidence.chips,
      evidenceSessionIds: r.evidence.sessions.map((s) => s.id),
      whyFlagged: Object.entries(r.evidence.stats).map(([key, value]) => `${key}: ${value}`),
      tellMeMore: {
        whatHappened: r.punchline,
        whyItMatters: r.status === "praise"
          ? "This behavior is working. Keep it stable while improving weaker areas."
          : "This pattern is recurring enough to affect cost, latency, or quality.",
        recommendedChanges: [
          { priority: 1, change: r.recommendation, expectedEffect: r.impactValue },
        ],
      },
    }));
}
```

- [ ] **Step 2: Update `computeHints` to run only the six detectors**

In `server/src/analyzer/efficiency/index.ts`, replace the old detector list with:

```typescript
const results = [
  detectEditRejectionRate(sessionsWithEvents),
  detectToolFailureStorm(sessionsWithEvents),
  detectCacheHitRatio(sessionsWithEvents),
  detectCostPerLocOutlier(sessionsWithEvents),
  detectLongTurnDurations(sessionsWithEvents),
  detectHighContextDurationTax(sessionsWithEvents),
];
```

Return:

```typescript
return {
  range,
  period,
  diagnostics: buildDiagnostics(results),
  quickWins: rankQuickWins(results),
  hints: rankAndFormat(results, range),
  sessionCount: ctx.sessions.length,
  totalCost,
};
```

- [ ] **Step 3: Keep evidence lookup compatible**

`getEvidence(hintId)` must support ids shaped like:

```text
cache_hit_ratio-7d
cache_hit_ratio-diagnostic
```

Use pattern matching against `QuickWinResult.pattern`, not the old `category`.

- [ ] **Step 4: Run server tests**

Run:

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/hint-ranker.test.ts src/analyzer/efficiency/__tests__/index.test.ts
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/analyzer/efficiency
git commit -m "feat(insights): rank quick wins into diagnostics"
```

---

## Task 5: Update The Efficiency API And AI Prompt

**Files:**

- Create: `server/src/analyzer/efficiency/ai-diagnostics-prompt.ts`
- Modify: `server/src/http/routes/efficiency-routes.ts`
- Modify: `server/src/http/routes-efficiency.test.ts`

- [ ] **Step 1: Extract the system prompt**

Move the prompt from `docs/specs/2026-05-18-insights-diagnostics-prompt.md` into:

```typescript
export const INSIGHTS_DIAGNOSTICS_SYSTEM_PROMPT = `You are the Claude Code workflow coach for an Insights page.

Your job is to read precomputed weekly session metrics and produce 3-4 plain-language diagnostics that tell the user what behavior is costing time, money, or quality, and what to change this week.

You are not a dashboard narrator. Do not summarize charts. Do not explain metrics unless they are evidence for a specific behavior.

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

Return valid JSON only.`;
`;
```

- [ ] **Step 2: Send structured JSON to the model**

In `POST /efficiency/report`, replace markdown issue blocks with:

```typescript
const payload = {
  period: hints.period,
  diagnostics: hints.diagnostics,
  quick_wins: hints.quickWins,
};
const userMessage = JSON.stringify(payload, null, 2);
```

- [ ] **Step 3: Keep SSE behavior unchanged**

Do not change the streaming protocol:

```text
data: {"text":"streamed text chunk"}

data: [DONE]
```

Existing `EfficiencyReport.tsx` depends on this stream shape.

- [ ] **Step 4: Update route tests**

Add expectations that `/efficiency/hints` includes:

```typescript
expect(res.body).toHaveProperty("period");
expect(res.body).toHaveProperty("diagnostics");
expect(res.body).toHaveProperty("quickWins");
expect(res.body).toHaveProperty("hints");
```

Add an SSE test that verifies `sendMessage` receives a prompt containing `"quick_wins"` and `"diagnostics"`.

- [ ] **Step 5: Run route tests**

Run:

```bash
pnpm -C server test src/http/routes-efficiency.test.ts
```

Expected: all efficiency route tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/analyzer/efficiency/ai-diagnostics-prompt.ts server/src/http/routes/efficiency-routes.ts server/src/http/routes-efficiency.test.ts
git commit -m "feat(insights): stream diagnostics report from structured evidence"
```

---

## Task 6: Add Dashboard Types And Data Hook

**Files:**

- Create: `dashboard/src/lib/insightsDiagnosticsTypes.ts`
- Create: `dashboard/src/hooks/useEfficiencyDiagnostics.ts`
- Create: `dashboard/src/hooks/useEfficiencyDiagnostics.test.ts`

- [ ] **Step 1: Mirror the API response types**

Create dashboard types matching the server response:

```typescript
export type SignalStatus = "warn" | "praise";
export type SignalSeverity = "high" | "medium" | "low" | "positive";
export type SignalConfidence = "high" | "medium" | "low";

export interface PeriodSummary {
  range: "24h" | "7d" | "30d" | "90d";
  spend: number;
  tokens: number;
  sessions: number;
  turns: number;
}

export interface QuickWinResult {
  id: string;
  pattern: string;
  status: SignalStatus;
  category: "quality" | "cost" | "latency";
  severity: SignalSeverity;
  confidence: SignalConfidence;
  title: string;
  punchline: string;
  impactLabel: string;
  impactValue: string;
  recommendation: string;
  rule: string;
  icon: string;
  evidence: {
    sessions: Array<{ id: string; detail: string; cost: number; wastedCost?: number }>;
    recommendation: string;
    stats: Record<string, number | string>;
    chips: string[];
  };
}

export interface DiagnosticResult {
  id: string;
  rank: number;
  sourcePattern: string;
  category: "quality" | "cost" | "latency" | "workflow" | "model" | "context";
  severity: SignalSeverity;
  confidence: SignalConfidence;
  title: string;
  summary: string;
  impactLabel: string;
  impactValue: string;
  impactDetail: string;
  changeThisWeek: string;
  evidenceChips: string[];
  evidenceSessionIds: string[];
  whyFlagged: string[];
  tellMeMore: {
    whatHappened: string;
    whyItMatters: string;
    recommendedChanges: Array<{ priority: number; change: string; expectedEffect: string }>;
  };
}

export interface EfficiencyDiagnosticsResponse {
  range: string;
  period: PeriodSummary;
  diagnostics: DiagnosticResult[];
  quickWins: QuickWinResult[];
  sessionCount: number;
  totalCost: number;
}
```

- [ ] **Step 2: Implement `useEfficiencyDiagnostics`**

The hook accepts:

```typescript
export function useEfficiencyDiagnostics(range: string, refreshCount: number)
```

It fetches:

```text
/api/efficiency/hints?range=${range}
```

It returns:

```typescript
{ data, loading, error, refetchKey: refreshCount }
```

- [ ] **Step 3: Run hook tests**

Run:

```bash
pnpm -C dashboard test src/hooks/useEfficiencyDiagnostics.test.ts
```

Expected: hook tests pass with mocked `fetch`.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/lib/insightsDiagnosticsTypes.ts dashboard/src/hooks/useEfficiencyDiagnostics.ts dashboard/src/hooks/useEfficiencyDiagnostics.test.ts
git commit -m "feat(insights): add diagnostics data hook"
```

---

## Task 7: Build Coach-First UI Components From The Mockup

**Files:**

- Create: `dashboard/src/components/insights/DiagnosticsSection.tsx`
- Create: `dashboard/src/components/insights/DiagnosticCard.tsx`
- Create: `dashboard/src/components/insights/DiagnosticAnalysis.tsx`
- Create: `dashboard/src/components/insights/QuickWinsList.tsx`
- Create: `dashboard/src/components/insights/DiagnosticsStates.tsx`
- Create tests under `dashboard/src/components/insights/__tests__/`

- [ ] **Step 1: Map mockup classes to React component responsibilities**

Use the mockup as the visual source:

```text
period-chip      -> InsightsPage compact summary row
coach-section   -> DiagnosticsSection
coach-grid      -> DiagnosticsSection
coach-card      -> DiagnosticCard
analysis        -> DiagnosticAnalysis
quickwins-section -> QuickWinsList
coach-state     -> DiagnosticsStates
```

- [ ] **Step 2: Component visual rules**

Implement these rules:

- First diagnostic is expanded and visually primary.
- Secondary diagnostics are compact but still include title, summary, impact, confidence, and chips.
- Category left border colors:
  - quality: red
  - cost: amber
  - latency: teal
  - context: sky
  - workflow: purple
  - model: accent
- Use lucide icons where available: `ShieldX`, `Wrench`, `Database`, `Code2`, `Timer`, `Gauge`, `ChevronRight`, `X`, `ThumbsUp`, `ThumbsDown`.
- Use no inline static style objects in new components.
- Use restrained dashboard density: no hero, no marketing copy, no nested cards.

- [ ] **Step 3: Add component tests**

Tests should assert:

```typescript
expect(screen.getByText("This week's diagnostics")).toBeTruthy();
expect(screen.getByText("3 patterns ranked by impact")).toBeTruthy();
expect(screen.getByTestId("diagnostic-card-primary")).toBeTruthy();
expect(screen.getByTestId("diagnostic-analysis")).toBeTruthy();
expect(screen.getByText("Quick wins")).toBeTruthy();
```

Add tests for loading, empty, and error states.

- [ ] **Step 4: Run component tests**

Run:

```bash
pnpm -C dashboard test src/components/insights/__tests__/DiagnosticsSection.test.tsx src/components/insights/__tests__/DiagnosticCard.test.tsx src/components/insights/__tests__/DiagnosticAnalysis.test.tsx src/components/insights/__tests__/QuickWinsList.test.tsx
```

Expected: all new component tests pass.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/insights dashboard/src/lib/insightsDiagnosticsTypes.ts
git commit -m "feat(insights): add coach-first diagnostics components"
```

---

## Task 8: Reorder InsightsPage Around Coaching First

**Files:**

- Modify: `dashboard/src/routes/InsightsPage.tsx`
- Modify: `dashboard/src/routes/InsightsPage.test.tsx`
- Keep: `dashboard/src/components/insights/EfficiencyHints.tsx` as a compatibility wrapper or remove its usage from the page.

- [ ] **Step 1: Move coaching before charts**

The top of the page should render in this order:

```text
1. Scope bar
2. Compact period chip
3. This week's diagnostics
4. Selected coaching analysis
5. Quick wins
6. Evidence section containing existing charts and tables
```

- [ ] **Step 2: Keep existing evidence sections**

Do not delete:

- token trend
- activity heatmap
- model mix
- top repos
- top sessions
- top tools
- commands, agents, skills

Move them below a visible evidence heading:

```text
Evidence
Charts and tables supporting the selected diagnostic.
```

- [ ] **Step 3: Remove static inline styles from touched top sections**

Replace static inline styles in the top coaching/stat area with Tailwind classes. Examples:

```tsx
className="bg-dt-bg1 border border-dt-border rounded-dt px-4 py-3"
className="text-xl font-semibold text-dt-text0 tracking-normal"
className="grid grid-cols-2 gap-3 lg:grid-cols-5"
```

Dynamic chart/table styles that remain in legacy evidence sections should be moved into follow-up cleanup or refactored during the same pass if they block `pnpm lint`.

- [ ] **Step 4: Update page tests**

Add assertions:

```typescript
expect(screen.getByTestId("section-diagnostics")).toBeTruthy();
expect(screen.getByTestId("section-quick-wins")).toBeTruthy();
expect(screen.getByTestId("section-evidence")).toBeTruthy();
```

Assert ordering by DOM position:

```typescript
const diagnostics = screen.getByTestId("section-diagnostics");
const evidence = screen.getByTestId("section-evidence");
expect(diagnostics.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

- [ ] **Step 5: Run page tests**

Run:

```bash
pnpm -C dashboard test src/routes/InsightsPage.test.tsx
```

Expected: Insights page tests pass.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/routes/InsightsPage.tsx dashboard/src/routes/InsightsPage.test.tsx dashboard/src/components/insights/EfficiencyHints.tsx
git commit -m "feat(insights): make insights coach first"
```

---

## Task 9: Final Verification And UI Review

**Files:**

- No planned source edits unless verification exposes defects.

- [ ] **Step 1: Run server efficiency tests**

Run:

```bash
pnpm -C server test src/analyzer/efficiency
```

Expected: all efficiency analyzer tests pass.

- [ ] **Step 2: Run route tests**

Run:

```bash
pnpm -C server test src/http/routes-efficiency.test.ts
```

Expected: all efficiency route tests pass.

- [ ] **Step 3: Run dashboard tests**

Run:

```bash
pnpm -C dashboard test src/components/insights src/routes/InsightsPage.test.tsx
```

Expected: all Insights component and page tests pass.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: ESLint passes and the inline-style guard passes.

- [ ] **Step 5: Run build**

Run:

```bash
pnpm -C dashboard build
pnpm -C server build
```

Expected: both builds complete without TypeScript or bundling errors.

- [ ] **Step 6: Manual UI acceptance**

Start the app using the repo's normal dev workflow, open Insights, and verify:

- First viewport shows diagnostics before charts.
- Period summary is compact.
- Primary diagnostic is visually dominant.
- Secondary diagnostics are scannable and do not wrap awkwardly.
- Analysis panel shows what happened, why it matters, recommendations, detection signals, impact stats, and affected sessions.
- Quick Wins remain below coaching and above evidence.
- Evidence charts still render.
- Mobile width stacks cards cleanly without text overlap.
- The page does not look like a landing page or marketing screen.

---

## Self-Review

Spec coverage:

- Six detectors are covered by Tasks 2-4.
- AI prompt and structured evidence are covered by Task 5.
- Coach-first UI and mockup mapping are covered by Tasks 6-8.
- Quick Wins remain deterministic and separate from AI narrative.
- Charts remain as evidence below coaching.

Known execution risks:

- Edit rejection rate depends on permission-denied events and live permission request records. If historical approved edit decisions are not fully represented, count edit-capable tool uses as total decisions and permission denials as rejections.
- Cost-per-LOC is estimated. The UI and detector copy must say estimated.
- Existing `InsightsPage.tsx` has inline styles. The final implementation must either remove them from touched areas or finish the broader inline-style cleanup so `pnpm lint` passes.
- The working tree is dirty. The executor must inspect diffs before editing and must not revert user/designer changes.

Execution recommendation:

Use subagent-driven development with disjoint write ownership:

- Worker 1: server signal extractors and six detectors.
- Worker 2: server response contract, ranking, route, and AI prompt.
- Worker 3: dashboard hook and coach-first components.
- Worker 4: InsightsPage integration, visual polish, and verification.
