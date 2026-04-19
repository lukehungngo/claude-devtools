# Token Cache/Non-Cache Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `cost-aggregator.ts` token undercounting bug and update all session viewer displays to show cached and non-cached tokens as distinct, separated values.

**Architecture:** The server's `AggregatedTokens` type already separates `inputTokens` (bare), `cacheReadTokens`, and `cacheWriteTokens` — the data is correct. `CostSummary` (used by PromptInput analytics) is missing cache fields entirely, and the UI (CostStrip, TopBar, AgentNodeCard) only renders `inputTokens` without showing cache. We fix the aggregation bug first, extend `CostSummary` with cache fields, then update all three display components.

**Tech Stack:** TypeScript 5, Vitest, React 18, Tailwind with `dt-*` tokens, `dashboard/src/lib/types.ts` mirrors `server/src/types.ts`.

---

## File Structure

Files modified (in dependency order — types first, then logic, then UI):

| File | Change |
|------|--------|
| `server/src/types.ts` | Add `cacheRead24h/7d`, `cacheWrite24h/7d` to `CostSummary` |
| `dashboard/src/lib/types.ts` | Mirror same fields (dashboard has its own copy of `CostSummary`) |
| `server/src/analyzer/cost-aggregator.ts` | Fix `inTok` formula; add `cacheRead`/`cacheWrite` to `SessionCostData`; populate new `CostSummary` fields |
| `server/src/analyzer/__tests__/cost-aggregator.test.ts` | New test file — verifies token accounting and cache field population |
| `dashboard/src/components/viewer/CostStrip.tsx` | Show `In: 5K · CR: 200K · CW: 50K · Out: 150K` |
| `dashboard/src/components/TopBar.tsx` | Show total in/out = raw + all cache types |
| `dashboard/src/components/AgentNodeCard.tsx` | Add cache lines to hover tooltip |
| `dashboard/src/lib/commandFormatters.ts` | Update `/analytics` to show cache breakdown if present |
| `dashboard/src/lib/commandFormatters.test.ts` | Update test fixtures to include new `CostSummary` fields |
| `dashboard/src/components/conversation/PromptInput.test.tsx` | Update `CostSummary` fixtures to include new fields |

---

### Task 1: Extend CostSummary type in server and dashboard

**Files:**
- Modify: `server/src/types.ts:260-269`
- Modify: `dashboard/src/lib/types.ts:260-269`

- [ ] **Step 1: Update server CostSummary type**

In `server/src/types.ts`, replace the `CostSummary` interface (lines 260-269) with:

```typescript
export interface CostSummary {
  cost24h: number;
  cost7d: number;
  sessionCount24h: number;
  sessionCount7d: number;
  tokenIn24h: number;
  tokenOut24h: number;
  tokenIn7d: number;
  tokenOut7d: number;
  cacheRead24h: number;
  cacheWrite24h: number;
  cacheRead7d: number;
  cacheWrite7d: number;
}
```

- [ ] **Step 2: Mirror the same change in dashboard types**

In `dashboard/src/lib/types.ts`, replace the `CostSummary` interface (lines 260-269) with the same updated interface:

```typescript
export interface CostSummary {
  cost24h: number;
  cost7d: number;
  sessionCount24h: number;
  sessionCount7d: number;
  tokenIn24h: number;
  tokenOut24h: number;
  tokenIn7d: number;
  tokenOut7d: number;
  cacheRead24h: number;
  cacheWrite24h: number;
  cacheRead7d: number;
  cacheWrite7d: number;
}
```

- [ ] **Step 3: Verify type check passes**

Run: `cd server && npx tsc --noEmit 2>&1 | head -20`
Expected: Type errors about `CostSummary` missing new fields (we haven't updated the aggregator yet — that's Task 2).

- [ ] **Step 4: Commit type changes**

```bash
git add server/src/types.ts dashboard/src/lib/types.ts
git commit -m "feat: add cacheRead/Write fields to CostSummary type"
```

---

### Task 2: Fix cost-aggregator.ts and add tests

**Files:**
- Modify: `server/src/analyzer/cost-aggregator.ts`
- Create: `server/src/analyzer/__tests__/cost-aggregator.test.ts`

- [ ] **Step 1: Write a failing test**

Create `server/src/analyzer/__tests__/cost-aggregator.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { statSync } from "node:fs";
import { aggregateCosts } from "../cost-aggregator.js";
import type { SessionInfo } from "../../types.js";

vi.mock("node:fs", () => ({
  statSync: vi.fn(),
}));

vi.mock("../../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(),
}));

import { parseJsonlIncremental } from "../../parser/jsonl-reader.js";

function makeSession(id: string, ageMs: number): SessionInfo {
  const now = Date.now();
  const ts = new Date(now - ageMs).toISOString();
  return {
    id,
    path: `/tmp/${id}.jsonl`,
    startTime: ts,
    lastModified: ts,
    projectHash: "proj",
    cwd: "/tmp",
    eventCount: 1,
    isRunning: false,
    subagentCount: 0,
  };
}

function makeAssistantEvent(inputTokens: number, cacheRead: number, cacheWrite: number, outputTokens: number) {
  return {
    type: "assistant" as const,
    timestamp: new Date().toISOString(),
    message: {
      model: "claude-sonnet-4-6",
      usage: {
        input_tokens: inputTokens,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheWrite,
        output_tokens: outputTokens,
      },
    },
  };
}

describe("aggregateCosts — token accounting", () => {
  beforeEach(() => {
    vi.mocked(statSync).mockReturnValue({ size: 1234 } as ReturnType<typeof statSync>);
    vi.mocked(parseJsonlIncremental).mockReturnValue({
      events: [makeAssistantEvent(5000, 200000, 50000, 150000)] as never,
      newOffset: 1234,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset internal cache between tests
    vi.resetModules();
  });

  it("tokenIn24h includes bare input + cache_read + cache_creation", () => {
    const session = makeSession("s1", 1000); // 1 second old → within 24h
    const result = aggregateCosts([session]);
    // 5000 + 200000 + 50000 = 255000
    expect(result.tokenIn24h).toBe(255000);
  });

  it("tokenOut24h is only output_tokens", () => {
    const session = makeSession("s1", 1000);
    const result = aggregateCosts([session]);
    expect(result.tokenOut24h).toBe(150000);
  });

  it("cacheRead24h equals cache_read_input_tokens", () => {
    const session = makeSession("s1", 1000);
    const result = aggregateCosts([session]);
    expect(result.cacheRead24h).toBe(200000);
  });

  it("cacheWrite24h equals cache_creation_input_tokens", () => {
    const session = makeSession("s1", 1000);
    const result = aggregateCosts([session]);
    expect(result.cacheWrite24h).toBe(50000);
  });

  it("sessions older than 24h are in 7d but not 24h", () => {
    const old = makeSession("s2", 25 * 3600 * 1000); // 25 hours old
    const result = aggregateCosts([old]);
    expect(result.tokenIn24h).toBe(0);
    expect(result.tokenIn7d).toBe(255000);
    expect(result.cacheRead24h).toBe(0);
    expect(result.cacheRead7d).toBe(200000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/analyzer/__tests__/cost-aggregator.test.ts 2>&1 | tail -20`
Expected: FAIL — either `tokenIn24h` is 5000 (not 255000) due to the bug, or fields don't exist yet.

- [ ] **Step 3: Fix cost-aggregator.ts**

Replace the entire `server/src/analyzer/cost-aggregator.ts` with:

```typescript
import { statSync } from "node:fs";
import type { SessionInfo, CostSummary } from "../types.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { calculateTokenCost } from "./metrics.js";

interface SessionCostData {
  /** File size at last computation — used for cache key (grows monotonically). */
  fileSize: number;
  /** Byte offset up to which we have already computed costs. */
  offset: number;
  cost: number;
  tokenIn: number;
  tokenOut: number;
  cacheRead: number;
  cacheWrite: number;
}

const sessionCostCache = new Map<string, SessionCostData>();

/** Exposed only for test isolation — clears module-level cache between tests. */
export function _resetCostCacheForTesting(): void {
  sessionCostCache.clear();
}

function computeSessionCost(session: SessionInfo): SessionCostData {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return { fileSize: 0, offset: 0, cost: 0, tokenIn: 0, tokenOut: 0, cacheRead: 0, cacheWrite: 0 };
  }

  const cached = sessionCostCache.get(session.id);

  // Full cache hit — file has not changed
  if (cached && cached.fileSize === stat.size) {
    return cached;
  }

  // Incremental update — read only new bytes from where we left off
  const fromOffset = cached ? cached.offset : 0;
  let totalCost = cached ? cached.cost : 0;
  let tokenIn = cached ? cached.tokenIn : 0;
  let tokenOut = cached ? cached.tokenOut : 0;
  let cacheRead = cached ? cached.cacheRead : 0;
  let cacheWrite = cached ? cached.cacheWrite : 0;

  try {
    const { events, newOffset } = parseJsonlIncremental(session.path, fromOffset);
    for (const event of events) {
      if (event.type !== "assistant") continue;
      const usage = event.message.usage;
      const model = event.message.model || "claude-sonnet-4-6";
      if (!usage) continue;

      const bare = usage.input_tokens || 0;
      const cr = usage.cache_read_input_tokens || 0;
      const cw = usage.cache_creation_input_tokens || 0;
      const outTok = usage.output_tokens || 0;

      tokenIn += bare + cr + cw;
      tokenOut += outTok;
      cacheRead += cr;
      cacheWrite += cw;

      totalCost += calculateTokenCost(model, {
        inputTokens: bare,
        outputTokens: outTok,
        cacheWriteTokens: cw,
        cacheReadTokens: cr,
      });
    }

    const data: SessionCostData = {
      fileSize: stat.size,
      offset: newOffset,
      cost: totalCost,
      tokenIn,
      tokenOut,
      cacheRead,
      cacheWrite,
    };
    sessionCostCache.set(session.id, data);
    return data;
  } catch {
    // skip unreadable sessions
    return { fileSize: 0, offset: 0, cost: totalCost, tokenIn, tokenOut, cacheRead, cacheWrite };
  }
}

export function aggregateCosts(sessions: SessionInfo[]): CostSummary {
  const now = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * 24 * 60 * 60 * 1000;

  let cost24h = 0;
  let cost7d = 0;
  let sessionCount24h = 0;
  let sessionCount7d = 0;
  let tokenIn24h = 0;
  let tokenOut24h = 0;
  let tokenIn7d = 0;
  let tokenOut7d = 0;
  let cacheRead24h = 0;
  let cacheWrite24h = 0;
  let cacheRead7d = 0;
  let cacheWrite7d = 0;

  for (const session of sessions) {
    const age = now - new Date(session.lastModified).getTime();

    if (age <= ms7d) {
      const data = computeSessionCost(session);
      cost7d += data.cost;
      tokenIn7d += data.tokenIn;
      tokenOut7d += data.tokenOut;
      cacheRead7d += data.cacheRead;
      cacheWrite7d += data.cacheWrite;
      sessionCount7d++;

      if (age <= ms24h) {
        cost24h += data.cost;
        tokenIn24h += data.tokenIn;
        tokenOut24h += data.tokenOut;
        cacheRead24h += data.cacheRead;
        cacheWrite24h += data.cacheWrite;
        sessionCount24h++;
      }
    }
  }

  return {
    cost24h,
    cost7d,
    sessionCount24h,
    sessionCount7d,
    tokenIn24h,
    tokenOut24h,
    tokenIn7d,
    tokenOut7d,
    cacheRead24h,
    cacheWrite24h,
    cacheRead7d,
    cacheWrite7d,
  };
}
```

- [ ] **Step 4: Update test to use `_resetCostCacheForTesting`**

Update `server/src/analyzer/__tests__/cost-aggregator.test.ts` — replace the `afterEach` block:

```typescript
import { aggregateCosts, _resetCostCacheForTesting } from "../cost-aggregator.js";

// ... (rest of imports unchanged)

afterEach(() => {
  vi.clearAllMocks();
  _resetCostCacheForTesting();
});
```

Remove `vi.resetModules()` from `afterEach`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run src/analyzer/__tests__/cost-aggregator.test.ts 2>&1 | tail -20`
Expected: All 5 tests PASS.

- [ ] **Step 6: Run full server test suite — confirm only pre-existing failures**

Run: `cd server && npx vitest run 2>&1 | tail -15`
Expected: Same failures as baseline (routes-debug, routes-lifecycle-storage). No new failures.

- [ ] **Step 7: Commit**

```bash
git add server/src/analyzer/cost-aggregator.ts server/src/analyzer/__tests__/cost-aggregator.test.ts
git commit -m "fix: include cache tokens in cost-aggregator tokenIn; add cacheRead/Write fields"
```

---

### Task 3: Update test fixtures that use CostSummary

**Files:**
- Modify: `dashboard/src/lib/commandFormatters.test.ts`
- Modify: `dashboard/src/components/conversation/PromptInput.test.tsx`
- Modify: `dashboard/src/hooks/useCosts.test.ts`

The `CostSummary` type now has 4 extra fields. All test fixtures that construct `CostSummary` literals must include the new fields to avoid TypeScript errors.

- [ ] **Step 1: Update commandFormatters.test.ts fixtures**

In `dashboard/src/lib/commandFormatters.test.ts`, find every `CostSummary` object literal (around lines 391 and 413) and add the 4 new fields:

```typescript
// First fixture (line ~391):
const costs: CostSummary = {
  cost24h: 5.25,
  cost7d: 18.50,
  sessionCount24h: 10,
  sessionCount7d: 35,
  tokenIn24h: 500000,
  tokenOut24h: 100000,
  tokenIn7d: 2000000,
  tokenOut7d: 400000,
  cacheRead24h: 0,
  cacheWrite24h: 0,
  cacheRead7d: 0,
  cacheWrite7d: 0,
};

// Second fixture (line ~413):
const costs: CostSummary = {
  cost24h: 0,
  cost7d: 5.0,
  sessionCount24h: 0,
  sessionCount7d: 5,
  tokenIn24h: 0,
  tokenOut24h: 0,
  tokenIn7d: 1000000,
  tokenOut7d: 200000,
  cacheRead24h: 0,
  cacheWrite24h: 0,
  cacheRead7d: 0,
  cacheWrite7d: 0,
};
```

- [ ] **Step 2: Update PromptInput.test.tsx fixture**

In `dashboard/src/components/conversation/PromptInput.test.tsx`, find the `CostSummary` object literal (around line 1485) and add the 4 new fields:

```typescript
const costs: CostSummary = {
  cost24h: 5.25,
  cost7d: 18.50,
  sessionCount24h: 10,
  sessionCount7d: 35,
  tokenIn24h: 500000,
  tokenOut24h: 100000,
  tokenIn7d: 2000000,
  tokenOut7d: 400000,
  cacheRead24h: 0,
  cacheWrite24h: 0,
  cacheRead7d: 0,
  cacheWrite7d: 0,
};
```

- [ ] **Step 3: Update useCosts.test.ts fixture**

In `dashboard/src/hooks/useCosts.test.ts`, find the `CostSummary` object literal (line ~11) and add the 4 new fields:

```typescript
tokenIn24h: 100000,
tokenOut24h: 50000,
// Add:
cacheRead24h: 0,
cacheWrite24h: 0,
cacheRead7d: 0,
cacheWrite7d: 0,
```

- [ ] **Step 4: Verify dashboard typecheck passes**

Run: `cd dashboard && npx tsc --noEmit 2>&1 | head -20`
Expected: Zero errors.

- [ ] **Step 5: Run dashboard tests**

Run: `cd dashboard && npx vitest run 2>&1 | tail -15`
Expected: Same pass/fail ratio as baseline. No new failures from type changes.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/commandFormatters.test.ts dashboard/src/components/conversation/PromptInput.test.tsx dashboard/src/hooks/useCosts.test.ts
git commit -m "fix: update CostSummary test fixtures with new cache fields"
```

---

### Task 4: Update CostStrip to show cache breakdown

**Files:**
- Modify: `dashboard/src/components/viewer/CostStrip.tsx`

Display format: `In: 5K · CR: 200K · CW: 50K · Out: 150K` (cache-read and cache-write only shown when non-zero).

- [ ] **Step 1: Update CostStrip.tsx**

Replace `dashboard/src/components/viewer/CostStrip.tsx` with:

```typescript
import type { SessionMetrics } from "../../lib/types";
import { formatCost, formatTokens, formatDuration } from "../../lib/cost";

interface CostStripProps {
  metrics: SessionMetrics | null;
}

export function CostStrip({ metrics }: CostStripProps) {
  if (!metrics) return null;

  const sessionHash = metrics.session.id.slice(0, 8);
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalCost } = metrics.tokens;
  const hasCacheRead = cacheReadTokens > 0;
  const hasCacheWrite = cacheWriteTokens > 0;

  return (
    <div className="text-base text-dt-text2 flex gap-3 px-4 py-1.5 border-t border-dt-border bg-dt-bg2 font-mono shrink-0">
      <div className="flex items-center gap-1.5">
        <span>Tokens:</span>
        <span className="text-dt-text1">
          In: {formatTokens(inputTokens)}
        </span>
        {hasCacheRead && (
          <>
            <span>{"\u00B7"}</span>
            <span className="text-dt-text1">
              CR: {formatTokens(cacheReadTokens)}
            </span>
          </>
        )}
        {hasCacheWrite && (
          <>
            <span>{"\u00B7"}</span>
            <span className="text-dt-text1">
              CW: {formatTokens(cacheWriteTokens)}
            </span>
          </>
        )}
        <span>{"\u00B7"}</span>
        <span className="text-dt-text1">
          Out: {formatTokens(outputTokens)}
        </span>
      </div>
      <div>
        Cost:{" "}
        <span className="text-dt-text1">
          {formatCost(totalCost)}
        </span>
      </div>
      <div>
        Duration:{" "}
        <span className="text-dt-text1">
          {formatDuration(metrics.duration)}
        </span>
      </div>
      <div className="ml-auto">
        Session:{" "}
        <span className="text-dt-purple">{sessionHash}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `cd dashboard && npx tsc --noEmit 2>&1 | head -20`
Expected: Zero errors. `AggregatedTokens` already has `cacheReadTokens` and `cacheWriteTokens`.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/viewer/CostStrip.tsx
git commit -m "feat: show cache-read and cache-write tokens separately in CostStrip"
```

---

### Task 5: Update TopBar token display to show total

**Files:**
- Modify: `dashboard/src/components/TopBar.tsx`

The "In" HudMetric currently shows only `inputTokens` (bare). Change to show total: `inputTokens + cacheReadTokens + cacheWriteTokens`. This is honest — the total represents all tokens that affected the context window.

- [ ] **Step 1: Update TopBar.tsx**

In `dashboard/src/components/TopBar.tsx`, change lines 38-39:

```typescript
// Before:
const tIn = metrics?.tokens.inputTokens ?? 0;
const tOut = metrics?.tokens.outputTokens ?? 0;

// After:
const tIn = (metrics?.tokens.inputTokens ?? 0)
  + (metrics?.tokens.cacheReadTokens ?? 0)
  + (metrics?.tokens.cacheWriteTokens ?? 0);
const tOut = metrics?.tokens.outputTokens ?? 0;
```

- [ ] **Step 2: Verify typecheck**

Run: `cd dashboard && npx tsc --noEmit 2>&1 | head -20`
Expected: Zero errors.

- [ ] **Step 3: Run TopBar tests**

Run: `cd dashboard && npx vitest run src/components/__tests__/TopBar.test.tsx 2>&1 | tail -15`
Expected: All pass (the test stub has `cacheReadTokens: 0, cacheWriteTokens: 0` so token values don't change).

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/TopBar.tsx
git commit -m "fix: TopBar In shows total tokens (raw + cache_read + cache_write)"
```

---

### Task 6: Update AgentNodeCard tooltip to show cache breakdown

**Files:**
- Modify: `dashboard/src/components/AgentNodeCard.tsx`

The hover tooltip shows `In: X / Out: Y`. Change to show cache breakdown as separate lines: `In: 5K / CR: 200K / CW: 50K / Out: 150K`.

- [ ] **Step 1: Update AgentNodeCard.tsx tooltip**

In `dashboard/src/components/AgentNodeCard.tsx`, replace line 63:

```typescript
// Before:
<div>In: {formatTokens(node.tokenUsage.inputTokens)} / Out: {formatTokens(node.tokenUsage.outputTokens)}</div>

// After:
<div>In: {formatTokens(node.tokenUsage.inputTokens)}{node.tokenUsage.cacheReadTokens > 0 ? ` / CR: ${formatTokens(node.tokenUsage.cacheReadTokens)}` : ""}{node.tokenUsage.cacheWriteTokens > 0 ? ` / CW: ${formatTokens(node.tokenUsage.cacheWriteTokens)}` : ""} / Out: {formatTokens(node.tokenUsage.outputTokens)}</div>
```

- [ ] **Step 2: Verify typecheck**

Run: `cd dashboard && npx tsc --noEmit 2>&1 | head -20`
Expected: Zero errors.

- [ ] **Step 3: Run AgentNodeCard tests**

Run: `cd dashboard && npx vitest run src/components/AgentNodeCard.test.tsx 2>&1 | tail -15`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/AgentNodeCard.tsx
git commit -m "feat: show cache-read and cache-write tokens in AgentNodeCard tooltip"
```

---

## Verification

After all tasks, run:

```bash
cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit
# Expected: Zero errors

cd server && npx vitest run 2>&1 | tail -5
# Expected: Same pre-existing failures only (routes-debug, routes-lifecycle-storage)

cd dashboard && npx vitest run 2>&1 | tail -5
# Expected: All pass (same as baseline)
```

## Self-Review

**Spec coverage:**
- [x] Bug: `cost-aggregator.ts` fix → Task 2
- [x] Type: `CostSummary` cache fields → Task 1
- [x] Display: `CostStrip` cache breakdown → Task 4
- [x] Display: `TopBar` accurate total → Task 5
- [x] Display: `AgentNodeCard` tooltip cache lines → Task 6
- [x] Test fixtures for new type fields → Task 3
- [x] New unit tests for `cost-aggregator.ts` → Task 2, Step 1

**Placeholder scan:** No TBDs or TODOs found.

**Type consistency:** `CostSummary.cacheRead24h/7d/cacheWrite24h/7d` used consistently in Tasks 1, 2, 3. `AggregatedTokens.cacheReadTokens/cacheWriteTokens` used in Tasks 4, 5, 6 — these fields already exist in the type.
