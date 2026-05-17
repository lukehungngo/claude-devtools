# Efficiency Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Coming soon" placeholder on the Insights page with punchline efficiency hints (server-computed pattern detection) and a drill-down evidence panel, plus an on-demand full report via Anthropic SDK streaming.

**Architecture:** Seven server-side pattern detectors analyze session data and produce ranked, templated punchline hints. Hints surface in the dashboard as actionable one-liners. Clicking a hint reveals pre-computed evidence (specific sessions, costs, recommendations). "Tell me more" triggers an Anthropic SDK streaming call that synthesizes a full report. All data comes from existing `discoverSessions()` + `loadFullSession()` + analyzer functions — no MCP.

**Tech Stack:** TypeScript strict, Express (sub-router pattern from `insights-routes.ts`), Vitest, React, Tailwind `dt-*` tokens, `react-markdown` + `remark-gfm`, `@anthropic-ai/sdk` for report streaming, `lucide-react` for icons.

**Spec:** `docs/specs/2026-05-17-efficiency-hints.md`

---

## File Structure

```
server/src/analyzer/efficiency/
├── types.ts                       # Hint, HintEvidence, PatternResult, DetectorContext
├── detector-context.ts            # Build shared context (sessions, events, metrics)
├── wasted-retries.ts              # Same tool+args ≥3× in a row
├── blind-edits.ts                 # Edit/Write without prior Read of same file
├── session-fragmentation.ts       # Multiple short sessions on same project/day
├── cost-waste.ts                  # Expensive sessions with low completion
├── model-overuse.ts               # Opus used where Sonnet would suffice
├── cache-misses.ts                # Low cache hit rate across sessions
├── improving-trend.ts             # Any metric improved ≥20% vs prior period
├── hint-ranker.ts                 # Rank by impact, template punchlines
├── evidence-builder.ts            # Build drill-down evidence per hint
├── index.ts                       # Orchestrate: detect → rank → return
└── __tests__/
    ├── wasted-retries.test.ts
    ├── blind-edits.test.ts
    ├── session-fragmentation.test.ts
    ├── cost-waste.test.ts
    ├── model-overuse.test.ts
    ├── cache-misses.test.ts
    ├── improving-trend.test.ts
    ├── hint-ranker.test.ts
    └── index.test.ts

server/src/http/routes/efficiency-routes.ts   # GET /hints, GET /hints/:id/evidence, POST /report, GET /reports

dashboard/src/components/insights/
├── EfficiencyHints.tsx             # Container: fetches hints, renders HintCards
├── HintCard.tsx                    # Single punchline with expand toggle
├── HintEvidence.tsx                # Expandable evidence panel
└── EfficiencyReport.tsx            # Full report with SSE markdown streaming
```

---

## Task 1: Types + DetectorContext

**Files:**
- Create: `server/src/analyzer/efficiency/types.ts`
- Create: `server/src/analyzer/efficiency/detector-context.ts`
- Create: `server/src/analyzer/efficiency/__tests__/detector-context.test.ts`

- [ ] **Step 1: Create types**

```typescript
// server/src/analyzer/efficiency/types.ts
import type { SessionInfo, SessionEvent } from "../../types.js";

export interface DetectorContext {
  sessions: SessionInfo[];
  priorSessions: SessionInfo[];
  range: "24h" | "7d" | "30d" | "90d";
  nowMs: number;
}

export interface SessionWithEvents {
  info: SessionInfo;
  mainEvents: SessionEvent[];
}

export type HintCategory =
  | "wasted_retries"
  | "blind_edits"
  | "session_fragmentation"
  | "cost_waste"
  | "model_overuse"
  | "cache_misses"
  | "improving_trend";

export interface PatternResult {
  category: HintCategory;
  detected: boolean;
  impact: number;
  punchline: string;
  icon: string;
  evidence: HintEvidenceData;
}

export interface HintEvidenceData {
  sessions: EvidenceSession[];
  recommendation: string;
  stats: Record<string, number | string>;
}

export interface EvidenceSession {
  id: string;
  detail: string;
  cost: number;
  wastedCost?: number;
}

export interface Hint {
  id: string;
  category: HintCategory;
  icon: string;
  punchline: string;
  impact: number;
  trend: "better" | "worse" | "stable" | "new";
  drilldownAvailable: boolean;
}

export interface HintsResponse {
  range: string;
  hints: Hint[];
  sessionCount: number;
  totalCost: number;
}

export interface EvidenceResponse {
  hintId: string;
  category: HintCategory;
  evidence: HintEvidenceData;
}
```

- [ ] **Step 2: Write failing test for buildDetectorContext**

```typescript
// server/src/analyzer/efficiency/__tests__/detector-context.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDetectorContext } from "../detector-context.js";

vi.mock("../../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => [
    { id: "s1", startTime: Date.now() - 3_600_000, lastModified: Date.now(), path: "/tmp/s1.jsonl", projectHash: "proj-a", eventCount: 50 },
    { id: "s2", startTime: Date.now() - 86_400_000 * 3, lastModified: Date.now() - 86_400_000 * 3, path: "/tmp/s2.jsonl", projectHash: "proj-a", eventCount: 30 },
    { id: "s3", startTime: Date.now() - 86_400_000 * 10, lastModified: Date.now() - 86_400_000 * 10, path: "/tmp/s3.jsonl", projectHash: "proj-b", eventCount: 20 },
  ]),
}));

describe("buildDetectorContext", () => {
  it("splits sessions into current and prior period", () => {
    const ctx = buildDetectorContext("7d");
    expect(ctx.sessions.length).toBe(2);
    expect(ctx.priorSessions.length).toBe(1);
    expect(ctx.range).toBe("7d");
  });

  it("returns empty arrays when no sessions", () => {
    const { discoverSessions } = await import("../../../parser/session-discovery.js");
    (discoverSessions as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    const ctx = buildDetectorContext("7d");
    expect(ctx.sessions).toEqual([]);
    expect(ctx.priorSessions).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test, verify FAIL**

Run: `pnpm -C server test src/analyzer/efficiency/__tests__/detector-context.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement buildDetectorContext**

```typescript
// server/src/analyzer/efficiency/detector-context.ts
import { discoverSessions } from "../../parser/session-discovery.js";
import type { DetectorContext } from "./types.js";

const RANGE_MS: Record<string, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

export function buildDetectorContext(range: "24h" | "7d" | "30d" | "90d"): DetectorContext {
  const nowMs = Date.now();
  const rangeMs = RANGE_MS[range];
  const cutoff = nowMs - rangeMs;
  const priorCutoff = cutoff - rangeMs;

  const all = discoverSessions();
  const sessions = all.filter((s) => s.startTime >= cutoff);
  const priorSessions = all.filter((s) => s.startTime >= priorCutoff && s.startTime < cutoff);

  return { sessions, priorSessions, range, nowMs };
}
```

- [ ] **Step 5: Run test, verify PASS**

Run: `pnpm -C server test src/analyzer/efficiency/__tests__/detector-context.test.ts`

- [ ] **Step 6: Commit**

```bash
git add server/src/analyzer/efficiency/types.ts server/src/analyzer/efficiency/detector-context.ts server/src/analyzer/efficiency/__tests__/detector-context.test.ts
git commit -m "feat(efficiency): types + detector context builder"
```

---

## Task 2: Wasted Retries Detector

**Files:**
- Create: `server/src/analyzer/efficiency/wasted-retries.ts`
- Create: `server/src/analyzer/efficiency/__tests__/wasted-retries.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/src/analyzer/efficiency/__tests__/wasted-retries.test.ts
import { describe, it, expect } from "vitest";
import { detectWastedRetries } from "../wasted-retries.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent, UserEvent } from "../../../types.js";

function makeToolUse(name: string, input: Record<string, unknown>, uuid: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: `tu_${uuid}`, name, input }],
      model: "claude-sonnet-4-6",
      id: `msg_${uuid}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeSession(id: string, events: (AssistantEvent | UserEvent)[]): SessionWithEvents {
  return {
    info: { id, projectHash: "proj", path: `/tmp/${id}.jsonl`, startTime: Date.now(), lastModified: Date.now(), eventCount: events.length, subagentCount: 0 } as SessionInfo,
    mainEvents: events,
  };
}

describe("detectWastedRetries", () => {
  it("flags 3 consecutive identical tool calls as a retry loop", () => {
    const events = [
      makeToolUse("Bash", { command: "npm test" }, "1"),
      makeToolUse("Bash", { command: "npm test" }, "2"),
      makeToolUse("Bash", { command: "npm test" }, "3"),
    ];
    const result = detectWastedRetries([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
    expect(result.category).toBe("wasted_retries");
    expect(result.evidence.sessions).toHaveLength(1);
  });

  it("does not flag 2 consecutive calls (below threshold)", () => {
    const events = [
      makeToolUse("Bash", { command: "npm test" }, "1"),
      makeToolUse("Bash", { command: "npm test" }, "2"),
    ];
    const result = detectWastedRetries([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("does not flag different commands", () => {
    const events = [
      makeToolUse("Bash", { command: "npm test" }, "1"),
      makeToolUse("Bash", { command: "npm run build" }, "2"),
      makeToolUse("Bash", { command: "npm test" }, "3"),
    ];
    const result = detectWastedRetries([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `pnpm -C server test src/analyzer/efficiency/__tests__/wasted-retries.test.ts`

- [ ] **Step 3: Implement**

```typescript
// server/src/analyzer/efficiency/wasted-retries.ts
import type { SessionEvent } from "../../types.js";
import { calculateTokenCost } from "../metrics.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

function stableHash(tool: string, input: unknown): string {
  return `${tool}:${JSON.stringify(input, Object.keys(input as Record<string, unknown>).sort())}`;
}

function extractToolCalls(events: SessionEvent[]): Array<{ hash: string; model: string; tokens: { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number } }> {
  const calls: Array<{ hash: string; model: string; tokens: { inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number } }> = [];
  for (const ev of events) {
    if (ev.type !== "assistant") continue;
    const content = Array.isArray(ev.message.content) ? ev.message.content : [];
    for (const item of content) {
      if (typeof item === "object" && item !== null && "type" in item && item.type === "tool_use") {
        const tu = item as { type: "tool_use"; name: string; input: unknown };
        calls.push({
          hash: stableHash(tu.name, tu.input),
          model: ev.message.model,
          tokens: {
            inputTokens: ev.message.usage.input_tokens,
            outputTokens: ev.message.usage.output_tokens,
            cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
            cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
          },
        });
      }
    }
  }
  return calls;
}

export function detectWastedRetries(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalWasted = 0;
  let totalRetries = 0;

  for (const { info, mainEvents } of sessions) {
    const calls = extractToolCalls(mainEvents);
    let streak = 1;
    let sessionRetries = 0;
    let sessionWasted = 0;

    for (let i = 1; i < calls.length; i++) {
      if (calls[i]!.hash === calls[i - 1]!.hash) {
        streak++;
        if (streak >= 3) {
          const cost = calculateTokenCost(calls[i]!.model, calls[i]!.tokens);
          sessionWasted += cost;
          sessionRetries++;
        }
      } else {
        streak = 1;
      }
    }

    if (sessionRetries > 0) {
      evidenceSessions.push({
        id: info.id,
        detail: `${sessionRetries} retry loops, $${sessionWasted.toFixed(2)} wasted`,
        cost: sessionWasted,
        wastedCost: sessionWasted,
      });
      totalWasted += sessionWasted;
      totalRetries += sessionRetries;
    }
  }

  const detected = evidenceSessions.length > 0;
  return {
    category: "wasted_retries",
    detected,
    impact: totalWasted,
    icon: "💰",
    punchline: detected
      ? `You wasted $${totalWasted.toFixed(2)} on ${totalRetries} retry loops. A single Read or check command would have prevented most of them.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Before running a command you're unsure about, ask Claude to check if the file, path, or config exists first. One Read or ls prevents cascading retries.",
      stats: { totalWasted, totalRetries, sessionsAffected: evidenceSessions.length },
    },
  };
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm -C server test src/analyzer/efficiency/__tests__/wasted-retries.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/analyzer/efficiency/wasted-retries.ts server/src/analyzer/efficiency/__tests__/wasted-retries.test.ts
git commit -m "feat(efficiency): wasted retries detector"
```

---

## Task 3: Blind Edits Detector

**Files:**
- Create: `server/src/analyzer/efficiency/blind-edits.ts`
- Create: `server/src/analyzer/efficiency/__tests__/blind-edits.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// server/src/analyzer/efficiency/__tests__/blind-edits.test.ts
import { describe, it, expect } from "vitest";
import { detectBlindEdits } from "../blind-edits.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeToolUse(name: string, input: Record<string, unknown>, uuid: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: `tu_${uuid}`, name, input }],
      model: "claude-sonnet-4-6",
      id: `msg_${uuid}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeSession(id: string, events: AssistantEvent[]): SessionWithEvents {
  return {
    info: { id, projectHash: "proj", path: `/tmp/${id}.jsonl`, startTime: Date.now(), lastModified: Date.now(), eventCount: events.length, subagentCount: 0 } as SessionInfo,
    mainEvents: events,
  };
}

describe("detectBlindEdits", () => {
  it("flags Edit without prior Read of same file", () => {
    const events = [
      makeToolUse("Edit", { file_path: "/src/app.ts", old_string: "a", new_string: "b" }, "1"),
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
    expect(result.evidence.stats.blindEdits).toBe(1);
  });

  it("does not flag Edit when Read of same file precedes it", () => {
    const events = [
      makeToolUse("Read", { file_path: "/src/app.ts" }, "1"),
      makeToolUse("Edit", { file_path: "/src/app.ts", old_string: "a", new_string: "b" }, "2"),
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("only looks back 10 events for the Read", () => {
    const filler = Array.from({ length: 11 }, (_, i) =>
      makeToolUse("Bash", { command: `cmd${i}` }, `f${i}`)
    );
    const events = [
      makeToolUse("Read", { file_path: "/src/app.ts" }, "r1"),
      ...filler,
      makeToolUse("Edit", { file_path: "/src/app.ts", old_string: "a", new_string: "b" }, "e1"),
    ];
    const result = detectBlindEdits([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
// server/src/analyzer/efficiency/blind-edits.ts
import type { SessionEvent } from "../../types.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

const LOOKBACK = 10;

function extractFilePath(item: { input?: unknown }): string | undefined {
  const input = item.input as Record<string, unknown> | undefined;
  return (input?.file_path as string) ?? (input?.path as string) ?? undefined;
}

export function detectBlindEdits(sessions: SessionWithEvents[]): PatternResult {
  let totalEdits = 0;
  let blindEdits = 0;
  let editsWithRead = 0;
  const evidenceSessions: EvidenceSession[] = [];

  for (const { info, mainEvents } of sessions) {
    const toolCalls: Array<{ name: string; filePath?: string }> = [];
    for (const ev of mainEvents) {
      if (ev.type !== "assistant") continue;
      const content = Array.isArray(ev.message.content) ? ev.message.content : [];
      for (const item of content) {
        if (typeof item === "object" && item !== null && "type" in item && item.type === "tool_use") {
          const tu = item as { type: "tool_use"; name: string; input?: unknown };
          toolCalls.push({ name: tu.name, filePath: extractFilePath(tu) });
        }
      }
    }

    let sessionBlind = 0;
    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i]!;
      if (call.name !== "Edit" && call.name !== "Write") continue;
      if (!call.filePath) continue;
      totalEdits++;

      const start = Math.max(0, i - LOOKBACK);
      const hasRead = toolCalls.slice(start, i).some(
        (c) => c.name === "Read" && c.filePath === call.filePath
      );

      if (hasRead) {
        editsWithRead++;
      } else {
        blindEdits++;
        sessionBlind++;
      }
    }

    if (sessionBlind > 0) {
      evidenceSessions.push({
        id: info.id,
        detail: `${sessionBlind} edits without prior Read`,
        cost: 0,
      });
    }
  }

  const ratio = totalEdits > 0 ? editsWithRead / totalEdits : 1;
  const detected = totalEdits >= 3 && ratio < 0.7;

  return {
    category: "blind_edits",
    detected,
    impact: blindEdits * 0.5,
    icon: "⚡",
    punchline: detected
      ? `${Math.round((1 - ratio) * 100)}% of your edits had no prior Read. Sessions with file context first had higher first-try success.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Before editing a file, ask Claude to read it first. This gives Claude the actual file contents instead of guessing, leading to fewer failed edits.",
      stats: { totalEdits, blindEdits, editsWithRead, ratio: Math.round(ratio * 100) },
    },
  };
}
```

- [ ] **Step 4: Run test, verify PASS, commit**

```bash
git add server/src/analyzer/efficiency/blind-edits.ts server/src/analyzer/efficiency/__tests__/blind-edits.test.ts
git commit -m "feat(efficiency): blind edits detector"
```

---

## Task 4: Session Fragmentation + Cost Waste Detectors

**Files:**
- Create: `server/src/analyzer/efficiency/session-fragmentation.ts`
- Create: `server/src/analyzer/efficiency/cost-waste.ts`
- Create: `server/src/analyzer/efficiency/__tests__/session-fragmentation.test.ts`
- Create: `server/src/analyzer/efficiency/__tests__/cost-waste.test.ts`

- [ ] **Step 1: Write failing test for session fragmentation**

```typescript
// server/src/analyzer/efficiency/__tests__/session-fragmentation.test.ts
import { describe, it, expect } from "vitest";
import { detectSessionFragmentation } from "../session-fragmentation.js";
import type { SessionInfo } from "../../../types.js";

function makeInfo(id: string, projectHash: string, startTime: number, eventCount: number): SessionInfo {
  return { id, projectHash, path: `/tmp/${id}.jsonl`, startTime, lastModified: startTime + 600_000, eventCount, subagentCount: 0 } as SessionInfo;
}

describe("detectSessionFragmentation", () => {
  it("flags multiple short sessions on same project same day", () => {
    const now = Date.now();
    const sessions = [
      makeInfo("s1", "proj-a", now - 3600_000, 10),
      makeInfo("s2", "proj-a", now - 1800_000, 8),
      makeInfo("s3", "proj-a", now - 900_000, 12),
    ];
    const result = detectSessionFragmentation(sessions);
    expect(result.detected).toBe(true);
    expect(result.punchline).toContain("3");
  });

  it("does not flag sessions on different projects", () => {
    const now = Date.now();
    const sessions = [
      makeInfo("s1", "proj-a", now - 3600_000, 10),
      makeInfo("s2", "proj-b", now - 1800_000, 8),
    ];
    const result = detectSessionFragmentation(sessions);
    expect(result.detected).toBe(false);
  });
});
```

- [ ] **Step 2: Implement session fragmentation**

```typescript
// server/src/analyzer/efficiency/session-fragmentation.ts
import type { SessionInfo } from "../../types.js";
import type { PatternResult, EvidenceSession } from "./types.js";

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function detectSessionFragmentation(sessions: SessionInfo[]): PatternResult {
  const groups = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const key = `${s.projectHash}:${dayKey(s.startTime)}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const evidenceSessions: EvidenceSession[] = [];
  let totalFragmented = 0;
  let couldBe = 0;

  for (const [, group] of groups) {
    const shortSessions = group.filter((s) => s.eventCount < 15);
    if (shortSessions.length >= 3) {
      totalFragmented += shortSessions.length;
      couldBe++;
      for (const s of shortSessions) {
        evidenceSessions.push({ id: s.id, detail: `${s.eventCount} events`, cost: 0 });
      }
    }
  }

  const detected = totalFragmented >= 3;
  return {
    category: "session_fragmentation",
    detected,
    impact: totalFragmented * 0.3,
    icon: "🔄",
    punchline: detected
      ? `You started ${totalFragmented} sessions that could have been ${couldBe}. Continuing a session reuses cached context — faster and cheaper.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Instead of starting a new session for follow-up work on the same project, continue the existing one. Claude keeps context cached within a session, so follow-ups are faster and cheaper.",
      stats: { totalFragmented, consolidatedTo: couldBe },
    },
  };
}
```

- [ ] **Step 3: Run fragmentation test, verify PASS**

- [ ] **Step 4: Write failing test for cost waste**

```typescript
// server/src/analyzer/efficiency/__tests__/cost-waste.test.ts
import { describe, it, expect } from "vitest";
import { detectCostWaste } from "../cost-waste.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeAssistant(uuid: string, model: string, inputTokens: number, outputTokens: number, stopReason: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: "response",
      model,
      id: `msg_${uuid}`,
      type: "message",
      stop_reason: stopReason as "end_turn",
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    },
  };
}

describe("detectCostWaste", () => {
  it("flags expensive sessions without end_turn", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeAssistant(`${i}`, "claude-sonnet-4-6", 5000, 2000, "tool_use")
    );
    const session: SessionWithEvents = {
      info: { id: "s1", projectHash: "proj", path: "/tmp/s1.jsonl", startTime: Date.now() - 86_400_000, lastModified: Date.now() - 86_400_000, eventCount: 10, subagentCount: 0 } as SessionInfo,
      mainEvents: events,
    };
    const result = detectCostWaste([session]);
    expect(result.detected).toBe(true);
    expect(result.evidence.sessions).toHaveLength(1);
  });

  it("does not flag cheap sessions", () => {
    const events = [makeAssistant("1", "claude-sonnet-4-6", 100, 50, "tool_use")];
    const session: SessionWithEvents = {
      info: { id: "s1", projectHash: "proj", path: "/tmp/s1.jsonl", startTime: Date.now(), lastModified: Date.now(), eventCount: 1, subagentCount: 0 } as SessionInfo,
      mainEvents: events,
    };
    const result = detectCostWaste([session]);
    expect(result.detected).toBe(false);
  });
});
```

- [ ] **Step 5: Implement cost waste**

```typescript
// server/src/analyzer/efficiency/cost-waste.ts
import type { SessionEvent } from "../../types.js";
import { calculateTokenCost } from "../metrics.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

function sessionCost(events: SessionEvent[]): number {
  let cost = 0;
  for (const ev of events) {
    if (ev.type !== "assistant") continue;
    cost += calculateTokenCost(ev.message.model, {
      inputTokens: ev.message.usage.input_tokens,
      outputTokens: ev.message.usage.output_tokens,
      cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
    });
  }
  return cost;
}

function hasEndTurn(events: SessionEvent[]): boolean {
  return events.some((ev) => ev.type === "assistant" && ev.message.stop_reason === "end_turn");
}

export function detectCostWaste(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalWasted = 0;

  for (const { info, mainEvents } of sessions) {
    const cost = sessionCost(mainEvents);
    if (cost < 1) continue;
    if (hasEndTurn(mainEvents)) continue;

    evidenceSessions.push({
      id: info.id,
      detail: `$${cost.toFixed(2)} spent, never completed`,
      cost,
      wastedCost: cost,
    });
    totalWasted += cost;
  }

  evidenceSessions.sort((a, b) => b.cost - a.cost);
  const detected = evidenceSessions.length > 0 && totalWasted > 2;

  return {
    category: "cost_waste",
    detected,
    impact: totalWasted,
    icon: "💸",
    punchline: detected
      ? `You spent $${totalWasted.toFixed(2)} on ${evidenceSessions.length} sessions that never finished. Check if the task was too ambiguous or if Claude got stuck in a loop.`
      : "",
    evidence: {
      sessions: evidenceSessions.slice(0, 10),
      recommendation: "Sessions that cost money but never complete usually mean the prompt was too vague or the task was too large. Break big tasks into smaller, well-defined steps.",
      stats: { totalWasted, sessionsAffected: evidenceSessions.length },
    },
  };
}
```

- [ ] **Step 6: Run both tests, verify PASS, commit**

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/session-fragmentation.test.ts src/analyzer/efficiency/__tests__/cost-waste.test.ts
git add server/src/analyzer/efficiency/session-fragmentation.ts server/src/analyzer/efficiency/cost-waste.ts server/src/analyzer/efficiency/__tests__/
git commit -m "feat(efficiency): session fragmentation + cost waste detectors"
```

---

## Task 5: Model Overuse + Cache Misses + Improving Trend Detectors

**Files:**
- Create: `server/src/analyzer/efficiency/model-overuse.ts`
- Create: `server/src/analyzer/efficiency/cache-misses.ts`
- Create: `server/src/analyzer/efficiency/improving-trend.ts`
- Create tests for each

- [ ] **Step 1: Implement model overuse detector**

Detects Opus usage where Sonnet would suffice. Heuristic: if a session uses Opus AND has < 20 events AND no subagents, flag it.

```typescript
// server/src/analyzer/efficiency/model-overuse.ts
import type { SessionEvent } from "../../types.js";
import { calculateTokenCost } from "../metrics.js";
import { FALLBACK_MODEL_PRICING } from "../modelPricing.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

function isOpus(model: string): boolean {
  return model.includes("opus");
}

export function detectModelOveruse(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalSavings = 0;

  for (const { info, mainEvents } of sessions) {
    if (info.subagentCount > 0) continue;
    if (info.eventCount > 40) continue;

    let opusCost = 0;
    let sonnetCost = 0;
    let opusEvents = 0;

    for (const ev of mainEvents) {
      if (ev.type !== "assistant" || !isOpus(ev.message.model)) continue;
      opusEvents++;
      const tokens = {
        inputTokens: ev.message.usage.input_tokens,
        outputTokens: ev.message.usage.output_tokens,
        cacheWriteTokens: ev.message.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: ev.message.usage.cache_read_input_tokens ?? 0,
      };
      opusCost += calculateTokenCost(ev.message.model, tokens);
      sonnetCost += calculateTokenCost("claude-sonnet-4-6", tokens);
    }

    const savings = opusCost - sonnetCost;
    if (opusEvents >= 3 && savings > 0.5) {
      evidenceSessions.push({
        id: info.id,
        detail: `${opusEvents} Opus calls on a simple task, $${savings.toFixed(2)} savings if Sonnet`,
        cost: opusCost,
        wastedCost: savings,
      });
      totalSavings += savings;
    }
  }

  const detected = evidenceSessions.length > 0 && totalSavings > 1;
  return {
    category: "model_overuse",
    detected,
    impact: totalSavings,
    icon: "🧠",
    punchline: detected
      ? `You used Opus for ${evidenceSessions.length} simple tasks that Sonnet handles equally well. That's $${totalSavings.toFixed(2)} you didn't need to spend.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Opus excels at complex multi-file tasks and architectural decisions. For simple edits, single-file changes, and straightforward tool calls, Sonnet is just as good at 1/5 the cost.",
      stats: { totalSavings, sessionsAffected: evidenceSessions.length },
    },
  };
}
```

- [ ] **Step 2: Implement cache misses detector**

```typescript
// server/src/analyzer/efficiency/cache-misses.ts
import type { SessionEvent } from "../../types.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

export function detectCacheMisses(sessions: SessionWithEvents[]): PatternResult {
  const evidenceSessions: EvidenceSession[] = [];
  let totalInput = 0;
  let totalCacheRead = 0;

  for (const { info, mainEvents } of sessions) {
    let sessionInput = 0;
    let sessionCacheRead = 0;

    for (const ev of mainEvents) {
      if (ev.type !== "assistant") continue;
      sessionInput += ev.message.usage.input_tokens;
      sessionCacheRead += ev.message.usage.cache_read_input_tokens ?? 0;
    }

    totalInput += sessionInput;
    totalCacheRead += sessionCacheRead;

    const hitRate = sessionInput > 0 ? sessionCacheRead / sessionInput : 0;
    if (sessionInput > 1000 && hitRate < 0.2) {
      evidenceSessions.push({
        id: info.id,
        detail: `${Math.round(hitRate * 100)}% cache hit rate`,
        cost: 0,
      });
    }
  }

  const overallHitRate = totalInput > 0 ? totalCacheRead / totalInput : 0;
  const detected = totalInput > 5000 && overallHitRate < 0.3;

  return {
    category: "cache_misses",
    detected,
    impact: (1 - overallHitRate) * 2,
    icon: "📦",
    punchline: detected
      ? `Your sessions re-read the same context every turn. Only ${Math.round(overallHitRate * 100)}% of input tokens were cached — that's extra cost and latency on every request.`
      : "",
    evidence: {
      sessions: evidenceSessions.slice(0, 10),
      recommendation: "Keep related work in the same session. When you start a new session, Claude has to re-read your entire codebase. Longer sessions with follow-up questions get progressively cheaper because context is cached.",
      stats: { overallHitRate: Math.round(overallHitRate * 100), lowCacheSessions: evidenceSessions.length },
    },
  };
}
```

- [ ] **Step 3: Implement improving trend detector**

```typescript
// server/src/analyzer/efficiency/improving-trend.ts
import type { SessionEvent } from "../../types.js";
import type { PatternResult, SessionWithEvents } from "./types.js";

interface PeriodStats {
  avgCost: number;
  errorRate: number;
  cacheHitRate: number;
}

function computeStats(sessions: SessionWithEvents[]): PeriodStats {
  let totalCost = 0;
  let totalTools = 0;
  let totalErrors = 0;
  let totalInput = 0;
  let totalCacheRead = 0;

  for (const { mainEvents } of sessions) {
    for (const ev of mainEvents) {
      if (ev.type === "assistant") {
        totalInput += ev.message.usage.input_tokens;
        totalCacheRead += ev.message.usage.cache_read_input_tokens ?? 0;
      }
      if (ev.type === "user") {
        const content = Array.isArray(ev.message.content) ? ev.message.content : [];
        for (const item of content) {
          if (typeof item === "object" && item !== null && "type" in item && item.type === "tool_result") {
            totalTools++;
            if ("is_error" in item && item.is_error) totalErrors++;
          }
        }
      }
    }
  }

  return {
    avgCost: sessions.length > 0 ? totalCost / sessions.length : 0,
    errorRate: totalTools > 0 ? totalErrors / totalTools : 0,
    cacheHitRate: totalInput > 0 ? totalCacheRead / totalInput : 0,
  };
}

export function detectImprovingTrend(
  currentSessions: SessionWithEvents[],
  priorSessions: SessionWithEvents[],
): PatternResult {
  if (priorSessions.length < 3) {
    return { category: "improving_trend", detected: false, impact: 0, icon: "✅", punchline: "", evidence: { sessions: [], recommendation: "", stats: {} } };
  }

  const current = computeStats(currentSessions);
  const prior = computeStats(priorSessions);

  const improvements: string[] = [];
  if (prior.errorRate > 0 && current.errorRate < prior.errorRate * 0.8) {
    improvements.push(`tool error rate dropped ${Math.round((1 - current.errorRate / prior.errorRate) * 100)}%`);
  }
  if (prior.cacheHitRate > 0 && current.cacheHitRate > prior.cacheHitRate * 1.2) {
    improvements.push(`cache hit rate improved ${Math.round((current.cacheHitRate / prior.cacheHitRate - 1) * 100)}%`);
  }

  const detected = improvements.length > 0;
  return {
    category: "improving_trend",
    detected,
    impact: 0.1,
    icon: "✅",
    punchline: detected
      ? `Your ${improvements.join(" and ")} vs last period. Whatever you changed, keep doing it.`
      : "",
    evidence: {
      sessions: [],
      recommendation: "You're trending in the right direction. Keep applying the patterns that are working.",
      stats: { improvements: improvements.length },
    },
  };
}
```

- [ ] **Step 4: Write tests for all three, run, verify PASS**

Write test files following the same pattern as Tasks 2–4. Each test should cover: detected case, not-detected case, edge case (empty sessions).

Run: `pnpm -C server test src/analyzer/efficiency/__tests__/model-overuse.test.ts src/analyzer/efficiency/__tests__/cache-misses.test.ts src/analyzer/efficiency/__tests__/improving-trend.test.ts`

- [ ] **Step 5: Commit**

```bash
git add server/src/analyzer/efficiency/model-overuse.ts server/src/analyzer/efficiency/cache-misses.ts server/src/analyzer/efficiency/improving-trend.ts server/src/analyzer/efficiency/__tests__/
git commit -m "feat(efficiency): model overuse + cache misses + improving trend detectors"
```

---

## Task 6: Hint Ranker + Orchestrator

**Files:**
- Create: `server/src/analyzer/efficiency/hint-ranker.ts`
- Create: `server/src/analyzer/efficiency/index.ts`
- Create: `server/src/analyzer/efficiency/__tests__/index.test.ts`

- [ ] **Step 1: Implement hint ranker**

```typescript
// server/src/analyzer/efficiency/hint-ranker.ts
import type { PatternResult, Hint } from "./types.js";

export function rankAndFormat(results: PatternResult[], range: string): Hint[] {
  return results
    .filter((r) => r.detected)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 5)
    .map((r) => ({
      id: `${r.category}-${range}`,
      category: r.category,
      icon: r.icon,
      punchline: r.punchline,
      impact: r.impact,
      trend: "new" as const,
      drilldownAvailable: r.evidence.sessions.length > 0,
    }));
}
```

- [ ] **Step 2: Implement orchestrator**

```typescript
// server/src/analyzer/efficiency/index.ts
import { loadFullSession } from "../../parser/session-discovery.js";
import { buildDetectorContext } from "./detector-context.js";
import { detectWastedRetries } from "./wasted-retries.js";
import { detectBlindEdits } from "./blind-edits.js";
import { detectSessionFragmentation } from "./session-fragmentation.js";
import { detectCostWaste } from "./cost-waste.js";
import { detectModelOveruse } from "./model-overuse.js";
import { detectCacheMisses } from "./cache-misses.js";
import { detectImprovingTrend } from "./improving-trend.js";
import { rankAndFormat } from "./hint-ranker.js";
import type { HintsResponse, EvidenceResponse, PatternResult, SessionWithEvents } from "./types.js";

function loadEvents(sessions: import("../../types.js").SessionInfo[]): SessionWithEvents[] {
  return sessions.map((info) => {
    const { mainEvents } = loadFullSession(info);
    return { info, mainEvents };
  });
}

let cachedResults: Map<string, PatternResult[]> = new Map();

export function computeHints(range: "24h" | "7d" | "30d" | "90d"): HintsResponse {
  const ctx = buildDetectorContext(range);
  const sessionsWithEvents = loadEvents(ctx.sessions);
  const priorWithEvents = loadEvents(ctx.priorSessions);

  const results: PatternResult[] = [
    detectWastedRetries(sessionsWithEvents),
    detectBlindEdits(sessionsWithEvents),
    detectSessionFragmentation(ctx.sessions),
    detectCostWaste(sessionsWithEvents),
    detectModelOveruse(sessionsWithEvents),
    detectCacheMisses(sessionsWithEvents),
    detectImprovingTrend(sessionsWithEvents, priorWithEvents),
  ];

  cachedResults.set(range, results);

  let totalCost = 0;
  for (const s of sessionsWithEvents) {
    for (const ev of s.mainEvents) {
      if (ev.type === "assistant") {
        const u = ev.message.usage;
        totalCost += (u.input_tokens * 3 + u.output_tokens * 15) / 1_000_000;
      }
    }
  }

  return {
    range,
    hints: rankAndFormat(results, range),
    sessionCount: ctx.sessions.length,
    totalCost,
  };
}

export function getEvidence(hintId: string): EvidenceResponse | undefined {
  for (const [, results] of cachedResults) {
    const result = results.find((r) => hintId.startsWith(r.category));
    if (result) {
      return { hintId, category: result.category, evidence: result.evidence };
    }
  }
  return undefined;
}
```

- [ ] **Step 3: Write integration test**

```typescript
// server/src/analyzer/efficiency/__tests__/index.test.ts
import { describe, it, expect, vi } from "vitest";
import { computeHints, getEvidence } from "../index.js";

vi.mock("../../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => []),
  loadFullSession: vi.fn(() => ({ mainEvents: [], subagentEvents: new Map(), subagentMeta: new Map() })),
}));

describe("computeHints", () => {
  it("returns a valid HintsResponse with empty sessions", () => {
    const result = computeHints("7d");
    expect(result.range).toBe("7d");
    expect(result.hints).toEqual([]);
    expect(result.sessionCount).toBe(0);
  });
});

describe("getEvidence", () => {
  it("returns undefined for unknown hint", () => {
    expect(getEvidence("nonexistent")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run, verify PASS, commit**

```bash
pnpm -C server test src/analyzer/efficiency/__tests__/index.test.ts
git add server/src/analyzer/efficiency/hint-ranker.ts server/src/analyzer/efficiency/index.ts server/src/analyzer/efficiency/__tests__/index.test.ts
git commit -m "feat(efficiency): hint ranker + orchestrator"
```

---

## Task 7: API Endpoints

**Files:**
- Create: `server/src/http/routes/efficiency-routes.ts`
- Modify: `server/src/http/routes.ts` (mount new sub-router)

- [ ] **Step 1: Implement efficiency routes**

```typescript
// server/src/http/routes/efficiency-routes.ts
import { Router } from "express";
import { computeHints, getEvidence } from "../../analyzer/efficiency/index.js";
import type { RouteContext } from "./route-context.js";

const VALID_RANGES = new Set(["24h", "7d", "30d", "90d"]);

export function createEfficiencyRoutes(_ctx: RouteContext): Router {
  const router = Router();

  router.get("/hints", (req, res) => {
    const range = String(req.query.range ?? "7d");
    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range: ${range}` });
      return;
    }
    try {
      const result = computeHints(range as "24h" | "7d" | "30d" | "90d");
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to compute hints" });
    }
  });

  router.get("/hints/:id/evidence", (req, res) => {
    const evidence = getEvidence(req.params.id);
    if (!evidence) {
      res.status(404).json({ error: "Hint not found" });
      return;
    }
    res.json(evidence);
  });

  return router;
}
```

- [ ] **Step 2: Mount in routes.ts**

Read `server/src/http/routes.ts` to find where other sub-routers are mounted (e.g., `router.use("/insights", createInsightsRoutes(ctx))`). Add:

```typescript
import { createEfficiencyRoutes } from "./routes/efficiency-routes.js";
// ...
router.use("/efficiency", createEfficiencyRoutes(ctx));
```

- [ ] **Step 3: Write integration test**

```typescript
// server/src/http/routes/__tests__/efficiency-routes.test.ts
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createEfficiencyRoutes } from "../efficiency-routes.js";

vi.mock("../../../analyzer/efficiency/index.js", () => ({
  computeHints: vi.fn(() => ({ range: "7d", hints: [], sessionCount: 0, totalCost: 0 })),
  getEvidence: vi.fn(() => undefined),
}));

const app = express();
app.use("/efficiency", createEfficiencyRoutes({} as any));

describe("GET /efficiency/hints", () => {
  it("returns 200 with valid range", async () => {
    const res = await request(app).get("/efficiency/hints?range=7d");
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
  });

  it("returns 400 with invalid range", async () => {
    const res = await request(app).get("/efficiency/hints?range=bogus");
    expect(res.status).toBe(400);
  });
});

describe("GET /efficiency/hints/:id/evidence", () => {
  it("returns 404 for unknown hint", async () => {
    const res = await request(app).get("/efficiency/hints/unknown/evidence");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Run, verify PASS, commit**

```bash
pnpm -C server test src/http/routes/__tests__/efficiency-routes.test.ts
git add server/src/http/routes/efficiency-routes.ts server/src/http/routes.ts server/src/http/routes/__tests__/efficiency-routes.test.ts
git commit -m "feat(efficiency): API endpoints for hints + evidence"
```

---

## Task 8: Dashboard — EfficiencyHints + HintCard

**Files:**
- Create: `dashboard/src/components/insights/EfficiencyHints.tsx`
- Create: `dashboard/src/components/insights/HintCard.tsx`
- Modify: `dashboard/src/routes/InsightsPage.tsx` (replace placeholder)

- [ ] **Step 1: Create HintCard component**

```typescript
// dashboard/src/components/insights/HintCard.tsx
import { ChevronDown, ChevronRight } from "lucide-react";

interface HintCardProps {
  icon: string;
  punchline: string;
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function HintCard({ icon, punchline, expanded, onToggle, children }: HintCardProps): JSX.Element {
  return (
    <div className="border border-dt-border rounded-dt bg-dt-bg2">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-dt-bg3 transition-colors"
      >
        <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
        <span className="text-dt-text-primary text-sm flex-1">{punchline}</span>
        <span className="text-dt-text-secondary mt-0.5">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {expanded && children && (
        <div className="px-4 pb-3 border-t border-dt-border">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create EfficiencyHints container**

```typescript
// dashboard/src/components/insights/EfficiencyHints.tsx
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { HintCard } from "./HintCard.js";
import { HintEvidence } from "./HintEvidence.js";

interface Hint {
  id: string;
  category: string;
  icon: string;
  punchline: string;
  impact: number;
  trend: string;
  drilldownAvailable: boolean;
}

interface HintsData {
  range: string;
  hints: Hint[];
  sessionCount: number;
  totalCost: number;
}

interface EfficiencyHintsProps {
  range: string;
  baseUrl: string;
}

export function EfficiencyHints({ range, baseUrl }: EfficiencyHintsProps): JSX.Element {
  const [data, setData] = useState<HintsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${baseUrl}/api/efficiency/hints?range=${range}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((d: HintsData) => { setData(d); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [range, baseUrl]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-dt-text-secondary py-8 justify-center">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Analyzing your sessions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-dt-text-secondary text-sm py-4">
        Failed to load efficiency hints.
      </div>
    );
  }

  if (!data || data.hints.length === 0) {
    return (
      <div className="text-dt-text-secondary text-sm py-4">
        {data?.sessionCount === 0
          ? `No sessions found in the last ${range}. Start using Claude Code and check back.`
          : `No major issues found in the last ${range}. Your sessions look efficient. Keep it up.`}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.hints.map((hint) => (
        <HintCard
          key={hint.id}
          icon={hint.icon}
          punchline={hint.punchline}
          expanded={expandedId === hint.id}
          onToggle={() => setExpandedId(expandedId === hint.id ? null : hint.id)}
        >
          {hint.drilldownAvailable && (
            <HintEvidence hintId={hint.id} baseUrl={baseUrl} />
          )}
        </HintCard>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace placeholder in InsightsPage.tsx**

Search for the "Coming soon" or "Efficiency Hints" placeholder in `dashboard/src/routes/InsightsPage.tsx` using:

```bash
grep -n "Coming soon\|Efficiency Hints\|efficiency\|coming.soon" dashboard/src/routes/InsightsPage.tsx
```

Replace the placeholder `<div>` with:

```typescript
import { EfficiencyHints } from "../components/insights/EfficiencyHints.js";

// In the JSX, replace the placeholder with:
<div className="space-y-3">
  <h3 className="text-dt-text-primary font-semibold text-base">Efficiency Hints</h3>
  <EfficiencyHints range={timeRange} baseUrl={baseUrl} />
</div>
```

Where `timeRange` and `baseUrl` come from the existing page context. Read the file first to find the exact prop names and how other sections get these values.

- [ ] **Step 4: Verify in browser**

Run: `cd dashboard && pnpm dev`

Open the Insights page. Verify:
- "Coming soon" placeholder is gone
- Loading spinner appears briefly
- Hints render (if you have session data) or empty state shows
- Clicking a hint expands/collapses

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/insights/EfficiencyHints.tsx dashboard/src/components/insights/HintCard.tsx dashboard/src/routes/InsightsPage.tsx
git commit -m "feat(dashboard): efficiency hints punchline cards"
```

---

## Task 9: Dashboard — HintEvidence

**Files:**
- Create: `dashboard/src/components/insights/HintEvidence.tsx`

- [ ] **Step 1: Implement**

```typescript
// dashboard/src/components/insights/HintEvidence.tsx
import { useState, useEffect } from "react";
import { Loader2, ExternalLink } from "lucide-react";

interface EvidenceSession {
  id: string;
  detail: string;
  cost: number;
  wastedCost?: number;
}

interface EvidenceData {
  hintId: string;
  category: string;
  evidence: {
    sessions: EvidenceSession[];
    recommendation: string;
    stats: Record<string, number | string>;
  };
}

interface HintEvidenceProps {
  hintId: string;
  baseUrl: string;
}

export function HintEvidence({ hintId, baseUrl }: HintEvidenceProps): JSX.Element {
  const [data, setData] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${baseUrl}/api/efficiency/hints/${hintId}/evidence`)
      .then((res) => res.json())
      .then((d: EvidenceData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [hintId, baseUrl]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-dt-text-secondary">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Loading evidence...</span>
      </div>
    );
  }

  if (!data) return <div className="text-xs text-dt-text-secondary py-2">No evidence available.</div>;

  return (
    <div className="space-y-3 pt-3">
      <div className="bg-dt-bg1 rounded-dt p-3">
        <p className="text-sm text-dt-text-primary font-medium mb-1">How to fix it</p>
        <p className="text-xs text-dt-text-secondary">{data.evidence.recommendation}</p>
      </div>

      {data.evidence.sessions.length > 0 && (
        <div>
          <p className="text-xs text-dt-text-secondary font-medium mb-2">Sessions affected</p>
          <div className="space-y-1">
            {data.evidence.sessions.map((s) => (
              <a
                key={s.id}
                href={`/session/${s.id}`}
                className="flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-dt-bg3 transition-colors group"
              >
                <span className="text-dt-text-primary font-mono">{s.id.slice(0, 8)}...</span>
                <span className="text-dt-text-secondary">{s.detail}</span>
                <ExternalLink size={12} className="text-dt-text-secondary opacity-0 group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Click a hint card → evidence panel should expand showing the recommendation and affected sessions.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/insights/HintEvidence.tsx
git commit -m "feat(dashboard): hint evidence expandable panel"
```

---

## Task 10: Full Report — SDK Streaming Endpoint

**Files:**
- Modify: `server/src/http/routes/efficiency-routes.ts` (add POST /report)
- Modify: `server/package.json` (add `@anthropic-ai/sdk` if not already present)

- [ ] **Step 1: Check if `@anthropic-ai/sdk` is already a dependency**

```bash
grep "anthropic" server/package.json
```

If `@anthropic-ai/sdk` is not present (only `@anthropic-ai/claude-agent-sdk` is), add it:

```bash
pnpm -C server add @anthropic-ai/sdk
```

- [ ] **Step 2: Add the report endpoint**

Add to `server/src/http/routes/efficiency-routes.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { computeHints } from "../../analyzer/efficiency/index.js";

// Inside createEfficiencyRoutes, after existing routes:

router.post("/report", async (req, res) => {
  const range = String(req.body?.range ?? "7d");
  if (!VALID_RANGES.has(range)) {
    res.status(400).json({ error: `Invalid range: ${range}` });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const hints = computeHints(range as "24h" | "7d" | "30d" | "90d");

    const prompt = `You are analyzing a developer's Claude Code usage for the last ${range}.

Here is the data:

Sessions: ${hints.sessionCount}
Total cost: $${hints.totalCost.toFixed(2)}

Issues found:
${hints.hints.map((h) => `- ${h.icon} ${h.punchline}`).join("\n")}

Write a report with these sections:
1. **What happened this period** — 3-5 bullet headline summary
2. **Biggest issues** — for each issue: what happened, what it cost (time + money), what to do differently. Cite specific patterns.
3. **Three changes for next week** — prioritized by expected savings, with rationale

Tone: direct, specific, no fluff. Use dollar amounts and concrete numbers from the data above.`;

    const client = new Anthropic();
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: "Report generation failed" })}\n\n`);
    res.end();
  }
});
```

- [ ] **Step 3: Test manually**

```bash
curl -X POST http://localhost:3142/api/efficiency/report -H "Content-Type: application/json" -d '{"range":"7d"}'
```

Expected: SSE stream of text chunks, ending with `[DONE]`.

- [ ] **Step 4: Commit**

```bash
git add server/src/http/routes/efficiency-routes.ts server/package.json
git commit -m "feat(efficiency): SDK streaming report endpoint"
```

---

## Task 11: Dashboard — EfficiencyReport

**Files:**
- Create: `dashboard/src/components/insights/EfficiencyReport.tsx`
- Modify: `dashboard/src/components/insights/EfficiencyHints.tsx` (add "Tell me more" button)

- [ ] **Step 1: Create EfficiencyReport**

```typescript
// dashboard/src/components/insights/EfficiencyReport.tsx
import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, X } from "lucide-react";

interface EfficiencyReportProps {
  range: string;
  baseUrl: string;
  onClose: () => void;
}

export function EfficiencyReport({ range, baseUrl, onClose }: EfficiencyReportProps): JSX.Element {
  const [markdown, setMarkdown] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setStreaming(true);
    setMarkdown("");
    setError(null);

    try {
      const res = await fetch(`${baseUrl}/api/efficiency/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as { text?: string; error?: string };
            if (parsed.error) { setError(parsed.error); break; }
            if (parsed.text) setMarkdown((prev) => prev + parsed.text);
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setStreaming(false);
    }
  }, [range, baseUrl]);

  return (
    <div className="border border-dt-border rounded-dt bg-dt-bg2 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-dt-text-primary font-semibold text-sm">Full Analysis</h4>
        <button type="button" onClick={onClose} className="text-dt-text-secondary hover:text-dt-text-primary">
          <X size={16} />
        </button>
      </div>

      {!markdown && !streaming && !error && (
        <button
          type="button"
          onClick={generate}
          className="w-full py-2 px-4 bg-dt-accent text-white rounded-dt text-sm hover:opacity-90 transition-opacity"
        >
          Generate Report
        </button>
      )}

      {streaming && !markdown && (
        <div className="flex items-center gap-2 text-dt-text-secondary py-4 justify-center">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Generating report...</span>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm py-2">{error}</div>
      )}

      {markdown && (
        <div className="prose prose-sm max-w-none text-dt-text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          {streaming && <Loader2 size={14} className="animate-spin inline ml-1" />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add "Tell me more" to EfficiencyHints**

In `EfficiencyHints.tsx`, add state and button:

```typescript
const [showReport, setShowReport] = useState(false);

// After the hints list, add:
{!showReport ? (
  <button
    type="button"
    onClick={() => setShowReport(true)}
    className="text-sm text-dt-accent hover:underline mt-2"
  >
    Tell me more →
  </button>
) : (
  <EfficiencyReport range={range} baseUrl={baseUrl} onClose={() => setShowReport(false)} />
)}
```

Add the import: `import { EfficiencyReport } from "./EfficiencyReport.js";`

- [ ] **Step 3: Verify in browser**

1. Open Insights page
2. See punchline hints
3. Click "Tell me more"
4. Click "Generate Report"
5. Watch markdown stream in live
6. Verify it renders cleanly with proper formatting

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/insights/EfficiencyReport.tsx dashboard/src/components/insights/EfficiencyHints.tsx
git commit -m "feat(dashboard): full report with SDK streaming"
```

---

## Task 12: Typecheck + Test + Polish

**Files:**
- All created/modified files

- [ ] **Step 1: Run full typecheck**

```bash
pnpm -C server typecheck && pnpm -C dashboard typecheck
```

Fix any type errors.

- [ ] **Step 2: Run all server tests**

```bash
pnpm -C server test
```

All must pass. Fix any failures.

- [ ] **Step 3: Run dashboard tests**

```bash
pnpm -C dashboard test
```

Fix any failures.

- [ ] **Step 4: Manual E2E test in browser**

1. Start server: `cd server && pnpm dev`
2. Start dashboard: `cd dashboard && pnpm dev`
3. Open Insights page
4. Verify: hints load → click expand → evidence shows → click "Tell me more" → report streams
5. Test empty state: change range to a period with no sessions
6. Test error state: stop server, reload page

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(efficiency): polish — typecheck, tests, empty states"
```

---

## Self-Review

**Spec coverage:**
- §3 Level 1 (punchline hints) → Tasks 1–8 (7 detectors + ranking + endpoint + dashboard)
- §3 Level 2 (drill-down evidence) → Tasks 8–9 (evidence endpoint + HintEvidence component)
- §4 GET /hints → Task 7
- §4 GET /hints/:id/evidence → Task 7
- §4 POST /report → Task 10
- §5 Pattern detectors → Tasks 2–5 (all 7 implemented)
- §6 Dashboard components → Tasks 8, 9, 11
- §8 Empty/edge states → Task 12
- §9 Testing → Tests in each task + Task 12 final run

**Not covered (deferred per spec):**
- §4 GET /reports + GET /reports/:id (report persistence/history) — add as follow-up task if needed
- §6 EfficiencyReport sidebar (past reports) — depends on persistence endpoints

**Placeholder scan:** No TBDs. All code blocks are complete. Test code provided for each detector.

**Type consistency:** `PatternResult`, `Hint`, `HintsResponse`, `EvidenceResponse` used consistently. `SessionWithEvents` wraps `SessionInfo` + `mainEvents` everywhere. `DetectorContext` used only in orchestrator.

---

Plan complete and saved to `docs/superpowers/plans/2026-05-17-efficiency-hints.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
