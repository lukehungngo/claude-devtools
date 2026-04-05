# Benchmark Critical Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add performance benchmarks for every critical operation in server and dashboard, with regression-safe assertions tied to the architecture invariant budgets (SSE <50ms, session load <100ms, O(1) per event).

**Architecture:** Vitest `bench` mode for server-side unit benchmarks (pure function timing). Playwright E2E timing for API endpoints and full-stack paths. Dashboard Vitest for client-side data-processing functions. Each benchmark file lives alongside the module it tests (`*.bench.ts`). A new `test:bench` npm script runs all benchmarks.

**Tech Stack:** Vitest bench API (`bench()`, `describe()`), `performance.now()` for Playwright E2E, existing Vitest configs extended with `benchmark` include.

---

## Tasks

### TASK-001: Add benchmark infrastructure to server

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/server/package.json`
  - Modify: `/Users/soh/working/ai/claude-devtools/server/vitest.config.ts`
  - Create: `/Users/soh/working/ai/claude-devtools/server/src/test-utils/generate-events.ts`
- **Approach:** Add `"test:bench": "vitest bench"` script to server package.json. Vitest already supports `bench` mode — just add the script. Create a shared test-data generator `generate-events.ts` that produces synthetic `SessionEvent[]` arrays of configurable sizes (100, 1K, 10K events) with realistic assistant/user/tool_use event mixes. This generator will be reused by all server benchmarks.
- **Tests:** N/A (infrastructure)
- **Verify:** `cd server && pnpm test:bench --run 2>&1 | head -5` (should exit cleanly even with 0 bench files)

**generate-events.ts contents:**

```typescript
import type { SessionEvent, AssistantEvent } from "../types.js";

export function generateEvents(count: number): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 3 === 0) {
      // User event
      events.push({
        type: "user",
        uuid: `uuid-u-${i}`,
        timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        sessionId: "bench-session",
        userType: i % 6 === 0 ? "external" : "internal",
        message: {
          role: "user",
          content: i % 6 === 0
            ? `User prompt ${i}`
            : [{ type: "tool_result", tool_use_id: `t-${i - 1}`, content: "ok" }],
        },
      } as SessionEvent);
    } else {
      // Assistant event with tool_use
      events.push({
        type: "assistant",
        uuid: `uuid-a-${i}`,
        timestamp: new Date(1700000000000 + i * 1000).toISOString(),
        sessionId: "bench-session",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: `Response text ${i}` },
            ...(i % 2 === 0
              ? [{ type: "tool_use", id: `t-${i}`, name: "Read", input: { file_path: `/src/file-${i}.ts` } }]
              : []),
          ],
          model: i % 5 === 0 ? "claude-opus-4-6" : "claude-sonnet-4-6",
          id: `msg-${i}`,
          type: "message",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 100 + (i % 500),
            output_tokens: 50 + (i % 200),
            cache_creation_input_tokens: i % 10 === 0 ? 1000 : 0,
            cache_read_input_tokens: i % 3 === 0 ? 500 : 0,
          },
        },
      } as unknown as SessionEvent);
    }
  }
  return events;
}

export function generateSubagentData(agentCount: number) {
  const subagentEvents = new Map<string, SessionEvent[]>();
  const subagentMeta = new Map<string, { agentType: string; description: string }>();
  const types = ["Explore", "Engineer", "Reviewer", "Bug-Fixer", "Researcher"];

  for (let i = 0; i < agentCount; i++) {
    subagentEvents.set(`agent-${i}`, generateEvents(20));
    subagentMeta.set(`agent-${i}`, {
      agentType: types[i % types.length],
      description: `task-${i}: ${types[i % types.length].toLowerCase()} work`,
    });
  }
  return { subagentEvents, subagentMeta };
}
```

- [ ] **Step 1:** Add `"test:bench": "vitest bench"` to server/package.json scripts
- [ ] **Step 2:** Create `server/src/test-utils/generate-events.ts` with the generator above
- [ ] **Step 3:** Verify with `cd server && pnpm test:bench --run`
- [ ] **Step 4:** Commit

---

### TASK-002: Benchmark computeMetrics (server)

- **Agent:** engineer
- **Files:**
  - Create: `/Users/soh/working/ai/claude-devtools/server/src/analyzer/metrics.bench.ts`
- **Approach:** Benchmark `computeMetrics()` from `metrics.ts` with 100, 1K, and 10K events, plus 0, 5, and 20 subagents. Use `generateEvents` and `generateSubagentData` from TASK-001. This is the critical path for session detail page load — architecture invariant says <100ms for 1000-event session.
- **Tests:** Benchmark assertions
- **Verify:** `cd server && pnpm test:bench --run src/analyzer/metrics.bench.ts`
- **Depends on:** TASK-001

```typescript
import { bench, describe } from "vitest";
import { computeMetrics } from "./metrics.js";
import { generateEvents, generateSubagentData } from "../test-utils/generate-events.js";
import type { SessionInfo } from "../types.js";

const stubSessionInfo: SessionInfo = {
  id: "bench-session",
  projectHash: "abc123",
  path: "/tmp/fake.jsonl",
  lastActive: new Date().toISOString(),
  cwd: "/tmp",
  model: "claude-sonnet-4-6",
};

describe("computeMetrics", () => {
  const events100 = generateEvents(100);
  const events1k = generateEvents(1_000);
  const events10k = generateEvents(10_000);
  const noAgents = { subagentEvents: new Map(), subagentMeta: new Map() };
  const agents5 = generateSubagentData(5);
  const agents20 = generateSubagentData(20);

  bench("100 events, 0 agents", () => {
    computeMetrics(stubSessionInfo, events100, noAgents.subagentEvents, noAgents.subagentMeta);
  });

  bench("1K events, 5 agents", () => {
    computeMetrics(stubSessionInfo, events1k, agents5.subagentEvents, agents5.subagentMeta);
  });

  bench("10K events, 20 agents", () => {
    computeMetrics(stubSessionInfo, events10k, agents20.subagentEvents, agents20.subagentMeta);
  });
});
```

- [ ] **Step 1:** Create `server/src/analyzer/metrics.bench.ts` with the code above
- [ ] **Step 2:** Run benchmark: `cd server && pnpm test:bench --run src/analyzer/metrics.bench.ts`
- [ ] **Step 3:** Verify results show timing for all 3 scenarios
- [ ] **Step 4:** Commit

---

### TASK-003: Benchmark buildAgentDAG (server)

- **Agent:** engineer
- **Files:**
  - Create: `/Users/soh/working/ai/claude-devtools/server/src/analyzer/dag-builder.bench.ts`
- **Approach:** Benchmark `buildAgentDAG()` with 5, 20, 50, 100 subagents. Each main event has an Agent tool_use matching a subagent description (the O(1) map lookup path). This validates the P0 lesson about single-pass optimization.
- **Tests:** Benchmark assertions
- **Verify:** `cd server && pnpm test:bench --run src/analyzer/dag-builder.bench.ts`
- **Depends on:** TASK-001

```typescript
import { bench, describe } from "vitest";
import { buildAgentDAG } from "./dag-builder.js";
import { generateEvents, generateSubagentData } from "../test-utils/generate-events.js";
import type { SessionEvent, AssistantEvent } from "../types.js";

function makeMainEventsWithAgentCalls(agentCount: number): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let i = 0; i < agentCount; i++) {
    events.push({
      type: "assistant",
      uuid: `uuid-main-${i}`,
      timestamp: new Date(1700000000000 + i * 1000).toISOString(),
      sessionId: "bench-session",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: `t-${i}`, name: "Agent", input: { description: `task-${i}: engineer work` } },
        ],
        model: "claude-sonnet-4-6",
        id: `msg-${i}`,
        type: "message",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    } as unknown as SessionEvent);
  }
  return events;
}

describe("buildAgentDAG", () => {
  for (const count of [5, 20, 50, 100]) {
    const mainEvents = makeMainEventsWithAgentCalls(count);
    const { subagentEvents, subagentMeta } = generateSubagentData(count);

    bench(`${count} agents`, () => {
      buildAgentDAG(mainEvents, subagentEvents, subagentMeta);
    });
  }
});
```

- [ ] **Step 1:** Create `server/src/analyzer/dag-builder.bench.ts`
- [ ] **Step 2:** Run: `cd server && pnpm test:bench --run src/analyzer/dag-builder.bench.ts`
- [ ] **Step 3:** Commit

---

### TASK-004: Benchmark JSONL parsing (server)

- **Agent:** engineer
- **Files:**
  - Create: `/Users/soh/working/ai/claude-devtools/server/src/parser/jsonl-reader.bench.ts`
- **Approach:** Benchmark `parseJsonlFile()` and `parseJsonlIncremental()` with generated JSONL files of 100KB, 1MB, and 5MB. Write temp files in `beforeAll`, clean up in `afterAll`. For incremental parsing, benchmark reading the last 10% of bytes (simulating a watcher update). This validates invariant #2 (byte-offset reads).
- **Tests:** Benchmark assertions
- **Verify:** `cd server && pnpm test:bench --run src/parser/jsonl-reader.bench.ts`
- **Depends on:** TASK-001

```typescript
import { bench, describe, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJsonlFile, parseJsonlIncremental } from "./jsonl-reader.js";

const tmpFiles: string[] = [];

function generateJsonlFile(lineCount: number): string {
  const path = join(tmpdir(), `bench-${lineCount}-${Date.now()}.jsonl`);
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(JSON.stringify({
      type: i % 3 === 0 ? "user" : "assistant",
      uuid: `uuid-${i}`,
      timestamp: new Date(1700000000000 + i * 1000).toISOString(),
      sessionId: "bench",
      ...(i % 3 !== 0 ? {
        message: {
          role: "assistant",
          content: [{ type: "text", text: `Response ${i} with some realistic content to pad the size a bit more.` }],
          model: "claude-sonnet-4-6",
          id: `msg-${i}`,
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        },
      } : {
        userType: "external",
        message: { role: "user", content: `User message ${i}` },
      }),
    }));
  }
  writeFileSync(path, lines.join("\n") + "\n");
  tmpFiles.push(path);
  return path;
}

describe("JSONL parsing", () => {
  let small: string; // ~100KB (~500 lines)
  let medium: string; // ~1MB (~5000 lines)
  let large: string; // ~5MB (~25000 lines)

  beforeAll(() => {
    small = generateJsonlFile(500);
    medium = generateJsonlFile(5_000);
    large = generateJsonlFile(25_000);
  });

  afterAll(() => {
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch {}
    }
  });

  bench("parseJsonlFile — 500 lines (~100KB)", () => {
    parseJsonlFile(small);
  });

  bench("parseJsonlFile — 5K lines (~1MB)", () => {
    parseJsonlFile(medium);
  });

  bench("parseJsonlFile — 25K lines (~5MB)", () => {
    parseJsonlFile(large);
  });

  bench("parseJsonlIncremental — last 10% of 5K file", () => {
    const size = statSync(medium).size;
    const offset = Math.floor(size * 0.9);
    parseJsonlIncremental(medium, offset);
  });

  bench("parseJsonlIncremental — last 10% of 25K file", () => {
    const size = statSync(large).size;
    const offset = Math.floor(size * 0.9);
    parseJsonlIncremental(large, offset);
  });
});
```

- [ ] **Step 1:** Create `server/src/parser/jsonl-reader.bench.ts`
- [ ] **Step 2:** Run: `cd server && pnpm test:bench --run src/parser/jsonl-reader.bench.ts`
- [ ] **Step 3:** Commit

---

### TASK-005: Benchmark buildToolStats (server)

- **Agent:** engineer
- **Files:**
  - Create: `/Users/soh/working/ai/claude-devtools/server/src/analyzer/tool-stats.bench.ts`
- **Approach:** Benchmark `buildToolStats()` with 100, 1K, 10K events. This is O(E) single-pass — verify it scales linearly.
- **Tests:** Benchmark assertions
- **Verify:** `cd server && pnpm test:bench --run src/analyzer/tool-stats.bench.ts`
- **Depends on:** TASK-001

```typescript
import { bench, describe } from "vitest";
import { buildToolStats } from "./tool-stats.js";
import { generateEvents } from "../test-utils/generate-events.js";

describe("buildToolStats", () => {
  const events100 = generateEvents(100);
  const events1k = generateEvents(1_000);
  const events10k = generateEvents(10_000);

  bench("100 events", () => { buildToolStats(events100); });
  bench("1K events", () => { buildToolStats(events1k); });
  bench("10K events", () => { buildToolStats(events10k); });
});
```

- [ ] **Step 1:** Create `server/src/analyzer/tool-stats.bench.ts`
- [ ] **Step 2:** Run and verify
- [ ] **Step 3:** Commit

---

### TASK-006: Add benchmark infrastructure to dashboard

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/dashboard/package.json`
  - Create: `/Users/soh/working/ai/claude-devtools/dashboard/src/test-utils/generate-events.ts`
- **Approach:** Add `"test:bench": "vitest bench"` to dashboard package.json. Create a dashboard-side event generator (similar to server but using dashboard's `SessionEvent` type from `src/lib/types.ts`). The dashboard types may differ slightly from server types, so the generator should use the dashboard import path.
- **Tests:** N/A (infrastructure)
- **Verify:** `cd dashboard && pnpm test:bench --run 2>&1 | head -5`
- **Depends on:** none (parallel safe with TASK-001)

- [ ] **Step 1:** Add script to dashboard/package.json
- [ ] **Step 2:** Create dashboard event generator
- [ ] **Step 3:** Verify
- [ ] **Step 4:** Commit

---

### TASK-007: Benchmark groupEventsIntoTurns (dashboard)

- **Agent:** engineer
- **Files:**
  - Create: `/Users/soh/working/ai/claude-devtools/dashboard/src/lib/turnSnapshot.bench.ts`
- **Approach:** Benchmark `groupEventsIntoTurns()` and `groupEventsIntoTurnsIncremental()` with 100, 1K, 5K events. The incremental variant should be significantly faster than full rebuild — measure both to prove it. This is the critical path for every WS event (P0 lesson: allEvents cascade).
- **Tests:** Benchmark assertions
- **Verify:** `cd dashboard && pnpm test:bench --run src/lib/turnSnapshot.bench.ts`
- **Depends on:** TASK-006

```typescript
import { bench, describe } from "vitest";
import { groupEventsIntoTurns, groupEventsIntoTurnsIncremental } from "./turnSnapshot";
import { generateEvents } from "../test-utils/generate-events";

describe("groupEventsIntoTurns", () => {
  const events100 = generateEvents(100);
  const events1k = generateEvents(1_000);
  const events5k = generateEvents(5_000);

  bench("100 events — full", () => { groupEventsIntoTurns(events100); });
  bench("1K events — full", () => { groupEventsIntoTurns(events1k); });
  bench("5K events — full", () => { groupEventsIntoTurns(events5k); });

  // Incremental: simulate 10 new events appended to 1K
  const base1k = groupEventsIntoTurns(events1k);
  const events1k_plus10 = [...events1k, ...generateEvents(10)];

  bench("1K+10 events — incremental", () => {
    groupEventsIntoTurnsIncremental(base1k, events1k_plus10, 10);
  });

  // Incremental: simulate 10 new events appended to 5K
  const base5k = groupEventsIntoTurns(events5k);
  const events5k_plus10 = [...events5k, ...generateEvents(10)];

  bench("5K+10 events — incremental", () => {
    groupEventsIntoTurnsIncremental(base5k, events5k_plus10, 10);
  });
});
```

- [ ] **Step 1:** Create `dashboard/src/lib/turnSnapshot.bench.ts`
- [ ] **Step 2:** Run and verify incremental is faster than full
- [ ] **Step 3:** Commit

---

### TASK-008: Benchmark searchIndex (dashboard)

- **Agent:** engineer
- **Files:**
  - Create: `/Users/soh/working/ai/claude-devtools/dashboard/src/lib/searchIndex.bench.ts`
- **Approach:** Benchmark `buildSearchIndex()`, `updateSearchIndex()`, and `filterTurnsByQuery()` with 100, 500, 1K turns. Search performance directly affects UI responsiveness (user types in search box → filter runs).
- **Tests:** Benchmark assertions
- **Verify:** `cd dashboard && pnpm test:bench --run src/lib/searchIndex.bench.ts`
- **Depends on:** TASK-006

```typescript
import { bench, describe } from "vitest";
import { buildSearchIndex, updateSearchIndex, filterTurnsByQuery } from "./searchIndex";
import { groupEventsIntoTurns } from "./turnSnapshot";
import { generateEvents } from "../test-utils/generate-events";

describe("searchIndex", () => {
  const events500 = generateEvents(500);
  const turns500 = groupEventsIntoTurns(events500);
  const events2k = generateEvents(2_000);
  const turns2k = groupEventsIntoTurns(events2k);

  bench("buildSearchIndex — 500 events", () => {
    buildSearchIndex(turns500, events500);
  });

  bench("buildSearchIndex — 2K events", () => {
    buildSearchIndex(turns2k, events2k);
  });

  const index500 = buildSearchIndex(turns500, events500);
  const index2k = buildSearchIndex(turns2k, events2k);

  bench("filterTurnsByQuery — 500 events, simple query", () => {
    filterTurnsByQuery(turns500, index500, "Response");
  });

  bench("filterTurnsByQuery — 2K events, simple query", () => {
    filterTurnsByQuery(turns2k, index2k, "Response");
  });

  bench("updateSearchIndex — 10 changed turns (2K base)", () => {
    updateSearchIndex(index2k, turns2k.slice(-10), events2k);
  });
});
```

- [ ] **Step 1:** Create `dashboard/src/lib/searchIndex.bench.ts`
- [ ] **Step 2:** Run and verify
- [ ] **Step 3:** Commit

---

### TASK-009: Benchmark phaseGrouping (dashboard)

- **Agent:** engineer
- **Files:**
  - Create: `/Users/soh/working/ai/claude-devtools/dashboard/src/lib/phaseGrouping.bench.ts`
- **Approach:** Benchmark `groupIntoPhases()` with 10, 50, 100 turns. This function runs per-turn in ConversationView rendering — needs to be fast.
- **Tests:** Benchmark assertions
- **Verify:** `cd dashboard && pnpm test:bench --run src/lib/phaseGrouping.bench.ts`
- **Depends on:** TASK-006

- [ ] **Step 1:** Create benchmark file
- [ ] **Step 2:** Run and verify
- [ ] **Step 3:** Commit

---

### TASK-010: E2E API endpoint benchmarks (Playwright)

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/dashboard/e2e/performance.spec.ts`
- **Approach:** Extend the existing `performance.spec.ts` to benchmark critical API endpoints with timing assertions. Use `page.request.get()` with `Date.now()` timing. Fix the existing broken test (uses `a[href*='/session/']` selector — should use REST API navigation from helpers.ts). Add benchmarks for: `GET /api/sessions` (<500ms), `GET /api/sessions/:projectHash/:sessionId` (<1s), `GET /api/repos` (<500ms), `GET /api/commands` (<500ms).
- **Tests:** E2E timing assertions
- **Verify:** `cd dashboard && npx playwright test e2e/performance.spec.ts --reporter=list`
- **Depends on:** none (parallel safe)

```typescript
import { test, expect } from "@playwright/test";
import { navigateToFirstSession } from "./helpers";

test.describe("Performance", () => {
  test("homepage loads within 3 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto("/");
    await expect(page.locator("text=Claude DevTools")).toBeVisible();
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(3000);
  });

  test("no console errors on homepage", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForTimeout(2000);
    const realErrors = errors.filter(
      (e) => !e.includes("ERR_CONNECTION_REFUSED") && !e.includes("Failed to fetch"),
    );
    expect(realErrors).toEqual([]);
  });

  test("session page loads within 5 seconds", async ({ page }) => {
    const start = Date.now();
    const hasSession = await navigateToFirstSession(page);
    if (!hasSession) {
      test.skip(true, "No sessions available");
      return;
    }
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(5000);
  });

  // ── API Endpoint Benchmarks ──

  test("GET /api/sessions responds within 500ms", async ({ page }) => {
    const start = Date.now();
    const resp = await page.request.get("http://localhost:3142/api/sessions");
    const elapsed = Date.now() - start;
    expect(resp.ok()).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  test("GET /api/repos responds within 500ms", async ({ page }) => {
    const start = Date.now();
    const resp = await page.request.get("http://localhost:3142/api/repos");
    const elapsed = Date.now() - start;
    expect(resp.ok()).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  test("GET /api/commands responds within 500ms", async ({ page }) => {
    const start = Date.now();
    const resp = await page.request.get("http://localhost:3142/api/commands");
    const elapsed = Date.now() - start;
    expect(resp.ok()).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  test("GET session detail responds within 1 second", async ({ page }) => {
    // Find a session first
    const sessResp = await page.request.get("http://localhost:3142/api/sessions");
    if (!sessResp.ok()) { test.skip(true, "No server"); return; }
    const data = await sessResp.json() as { sessions: { id: string; projectHash: string }[] };
    if (!data.sessions?.length) { test.skip(true, "No sessions"); return; }

    const s = data.sessions[0];
    const start = Date.now();
    const resp = await page.request.get(
      `http://localhost:3142/api/sessions/${s.projectHash}/${s.id}`
    );
    const elapsed = Date.now() - start;
    expect(resp.ok()).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  test("GET /api/doctor responds within 1 second", async ({ page }) => {
    const start = Date.now();
    const resp = await page.request.get("http://localhost:3142/api/doctor");
    const elapsed = Date.now() - start;
    expect(resp.ok()).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });

  test("GET /api/stats responds within 1 second", async ({ page }) => {
    const start = Date.now();
    const resp = await page.request.get("http://localhost:3142/api/stats");
    const elapsed = Date.now() - start;
    expect(resp.ok()).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  });
});
```

- [ ] **Step 1:** Rewrite `dashboard/e2e/performance.spec.ts` with the code above
- [ ] **Step 2:** Run: `cd dashboard && npx playwright test e2e/performance.spec.ts --reporter=list`
- [ ] **Step 3:** Verify all pass
- [ ] **Step 4:** Commit

---

### TASK-011: Add Makefile targets

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/Makefile`
- **Approach:** Add `bench-server`, `bench-dashboard`, and `bench` (runs both) targets to the Makefile. Also add `bench-all` that runs both unit benchmarks AND E2E performance tests.
- **Tests:** N/A
- **Verify:** `make bench 2>&1 | tail -5`
- **Depends on:** TASK-001, TASK-006

```makefile
bench-server:
	cd $(ROOT_DIR)/server && pnpm test:bench --run

bench-dashboard:
	cd $(ROOT_DIR)/dashboard && pnpm test:bench --run

bench: bench-server bench-dashboard

bench-all: bench test-e2e
```

- [ ] **Step 1:** Add targets to Makefile
- [ ] **Step 2:** Run `make bench`
- [ ] **Step 3:** Commit

---

## Dependency Graph

```
TASK-001 (server infra) → TASK-002 (metrics bench)
                        → TASK-003 (DAG bench)
                        → TASK-004 (JSONL bench)
                        → TASK-005 (tool-stats bench)

TASK-006 (dashboard infra) → TASK-007 (turn grouping bench)
                           → TASK-008 (search index bench)
                           → TASK-009 (phase grouping bench)

TASK-010 (E2E API bench) — independent

TASK-001 + TASK-006 → TASK-011 (Makefile targets)
```

Parallel-safe groups:
- **Group A (parallel):** TASK-001, TASK-006, TASK-010
- **Group B (after TASK-001):** TASK-002, TASK-003, TASK-004, TASK-005
- **Group C (after TASK-006):** TASK-007, TASK-008, TASK-009
- **Group D (after A):** TASK-011

## Risk Assessment

- **Vitest bench mode availability:** Vitest has built-in `bench` support since v0.23. If the installed version is too old, upgrade with `pnpm add -D vitest@latest`. Mitigation: check version first in TASK-001.
- **Synthetic data realism:** Generated events may not perfectly match real JSONL format, causing benchmarks to skip code paths. Mitigation: generator includes realistic field shapes (tool_use, usage, model) matching actual SessionEvent types.
- **Flaky E2E timing tests:** API benchmarks depend on server load, disk I/O, etc. Mitigation: use generous budgets (500ms for listing, 1s for detail) — these are safety nets, not tight bounds.
- **Dashboard bench in jsdom:** Vitest bench runs in jsdom for dashboard — some Node.js APIs may not be available. Mitigation: benchmarks only test pure data-processing functions, no DOM.

## Budget Reference (from architecture invariants)

| Operation | Budget | Benchmark Task |
|-----------|--------|----------------|
| SSE event latency | <50ms SDK→dashboard | TASK-010 (indirect) |
| Session load (cached) | <100ms for 1K events | TASK-002, TASK-010 |
| Live event processing | O(1) per event | TASK-007 (incremental) |
| Turn rendering | Only visible turns | N/A (virtualization) |
| DAG layout | Recompute on structure change only | TASK-003 |
