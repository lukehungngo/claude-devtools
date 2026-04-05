# Fix Benchmark Issues — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 3 performance issues found by benchmarks: (P2) incremental turn grouping not faster than full rebuild, (P3) session discovery ~500ms cold per API call, (P3) /api/commands ~620ms.

**Architecture:** Issue #1 is a dashboard-side algorithm fix. Issues #2 and #3 are server-side caching improvements. All changes respect existing invariants (read-only JSONL, byte-offset reads, immutable data).

**Tech Stack:** TypeScript, Vitest for unit tests, existing bench files for regression verification.

---

## Tasks

### TASK-001: Fix incremental turn grouping to only process new events

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/dashboard/src/lib/turnSnapshot.ts` (lines 330-358)
  - Modify: `/Users/soh/working/ai/claude-devtools/dashboard/src/lib/turnSnapshot.test.ts`
- **Approach:** The current `groupEventsIntoTurnsIncremental()` slices from `lastTurnStartIndex` and calls `groupEventsIntoTurns()` on the tail, which re-processes the entire last turn + new events. For a 5K-event session where the last turn started at index 4900, this only saves processing 4900 events. But if the last turn started at index 0 (single long turn), it re-processes everything.

  The fix: instead of calling `groupEventsIntoTurns()` on the sliced tail, process only the `newEventCount` events incrementally. Keep all existing turns except the last one intact. For the last turn, extend it with any new events that belong to it, and create new turns only when a turn boundary is detected in the new events.

  Specifically:
  1. Keep `existingTurns.slice(0, -1)` (all completed turns) — these never change.
  2. Take the last existing turn and the new events.
  3. Scan only the new events for turn boundaries.
  4. If no boundary found: extend the last turn's `endIndex` and rebuild just that one turn from its events.
  5. If boundary found: finalize the last turn up to the boundary, create new turn(s) from remaining events.

  This makes the cost O(newEventCount) instead of O(totalEvents - lastTurnStartIndex).

- **Tests:** 
  - Existing tests must still pass (no regression)
  - Add benchmark comparison: incremental with 5K base + 10 new should be significantly faster than full 5K rebuild
  - Add unit test: incremental with 1 new event appended to last turn (no boundary) should produce same result as full rebuild
  - Add unit test: incremental with new events containing a turn boundary should split correctly

- **Verify:** `cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm test --run src/lib/turnSnapshot.test.ts && pnpm test:bench --run src/lib/turnSnapshot.bench.ts`
- **Depends on:** none
- **Est:** 5 min

**Current code (to replace):**

```typescript
export function groupEventsIntoTurnsIncremental(
  existingTurns: TurnSnapshot[],
  allEvents: SessionEvent[],
  newEventCount: number,
  subagentMeta?: SubagentMeta
): TurnSnapshot[] {
  if (existingTurns.length === 0 || newEventCount >= allEvents.length) {
    return groupEventsIntoTurns(allEvents, subagentMeta);
  }

  const lastTurnStartIndex = existingTurns[existingTurns.length - 1].startIndex;
  const eventsToProcess = allEvents.slice(lastTurnStartIndex);
  const rebuiltTurns = groupEventsIntoTurns(eventsToProcess, subagentMeta);

  const baseTurnNumber = existingTurns.length;
  for (let i = 0; i < rebuiltTurns.length; i++) {
    rebuiltTurns[i].turnNumber = baseTurnNumber + i;
    rebuiltTurns[i].startIndex += lastTurnStartIndex;
    rebuiltTurns[i].endIndex += lastTurnStartIndex;
  }

  return [...existingTurns.slice(0, -1), ...rebuiltTurns];
}
```

**New approach:**

```typescript
export function groupEventsIntoTurnsIncremental(
  existingTurns: TurnSnapshot[],
  allEvents: SessionEvent[],
  newEventCount: number,
  subagentMeta?: SubagentMeta
): TurnSnapshot[] {
  if (existingTurns.length === 0 || newEventCount >= allEvents.length) {
    return groupEventsIntoTurns(allEvents, subagentMeta);
  }

  // Only process from the END of the last existing turn's events,
  // not from the START of the last turn.
  const lastTurn = existingTurns[existingTurns.length - 1];
  const newStartIndex = allEvents.length - newEventCount;

  // Scan new events for turn boundaries
  let boundaryOffset = -1;
  for (let i = 0; i < newEventCount; i++) {
    if (isTurnBoundary(allEvents[newStartIndex + i])) {
      boundaryOffset = i;
      break;
    }
  }

  if (boundaryOffset === -1) {
    // No new turn boundary — extend the last turn with new events
    // Rebuild ONLY the last turn (from its startIndex through all new events)
    const lastTurnEvents = allEvents.slice(lastTurn.startIndex);
    const rebuilt = buildTurn(
      lastTurn.turnNumber,
      lastTurn.promptText,
      lastTurnEvents,
      lastTurn.startIndex,
      subagentMeta
    );
    // Last turn may have been running before, keep its status logic
    return [...existingTurns.slice(0, -1), rebuilt];
  }

  // Turn boundary found in new events — rebuild from the last turn's start
  // through the end, using groupEventsIntoTurns on the affected slice only
  const eventsToProcess = allEvents.slice(lastTurn.startIndex);
  const rebuiltTurns = groupEventsIntoTurns(eventsToProcess, subagentMeta);

  const baseTurnNumber = existingTurns.length;
  for (let i = 0; i < rebuiltTurns.length; i++) {
    rebuiltTurns[i].turnNumber = baseTurnNumber + i;
    rebuiltTurns[i].startIndex += lastTurn.startIndex;
    rebuiltTurns[i].endIndex += lastTurn.startIndex;
  }

  return [...existingTurns.slice(0, -1), ...rebuiltTurns];
}
```

The key insight: when no turn boundary exists in new events (the common case during streaming — assistant events keep arriving for the current turn), we only call `buildTurn()` once on the last turn's events instead of `groupEventsIntoTurns()` on a potentially large slice. This makes the common case O(lastTurnSize) instead of O(allEventsFromLastTurnStart).

For the uncommon case (a new user prompt arrives, creating a turn boundary), we fall back to rebuilding from the last turn's start — same as before, but this only happens once per turn, not on every event.

- [ ] **Step 1: Write failing test — incremental should be faster for no-boundary case**

Read the existing test file first to understand the test patterns, then add:

```typescript
describe("groupEventsIntoTurnsIncremental performance", () => {
  it("returns same result as full rebuild when extending last turn", () => {
    // Create 100 events, group them, then add 5 more non-boundary events
    const events = generateTestEvents(100);
    const baseTurns = groupEventsIntoTurns(events);
    
    const newEvents = generateAssistantEvents(5); // no turn boundary
    const allEvents = [...events, ...newEvents];
    
    const incremental = groupEventsIntoTurnsIncremental(baseTurns, allEvents, 5);
    const full = groupEventsIntoTurns(allEvents);
    
    expect(incremental.length).toBe(full.length);
    expect(incremental[incremental.length - 1].endIndex).toBe(full[full.length - 1].endIndex);
  });

  it("correctly splits when new events contain turn boundary", () => {
    const events = generateTestEvents(50);
    const baseTurns = groupEventsIntoTurns(events);
    const baseCount = baseTurns.length;
    
    // Add a user prompt (turn boundary) + assistant response
    const newEvents = [
      makeUserPrompt("new question"),
      makeAssistantEvent("response"),
    ];
    const allEvents = [...events, ...newEvents];
    
    const incremental = groupEventsIntoTurnsIncremental(baseTurns, allEvents, 2);
    expect(incremental.length).toBe(baseCount + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm test --run src/lib/turnSnapshot.test.ts`

- [ ] **Step 3: Implement the optimized incremental function**

Replace `groupEventsIntoTurnsIncremental` in `turnSnapshot.ts` with the new approach above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm test --run src/lib/turnSnapshot.test.ts`

- [ ] **Step 5: Run benchmark to verify improvement**

Run: `cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm test:bench --run src/lib/turnSnapshot.bench.ts`

Expected: "5K base + 10 new events — incremental" should now be significantly faster than "5K events — full".

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/lib/turnSnapshot.ts dashboard/src/lib/turnSnapshot.test.ts
git commit -m "perf: optimize incremental turn grouping to O(newEvents) for no-boundary case"
```

---

### TASK-002: Cache discoverSessions() result with TTL

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/server/src/parser/session-discovery.ts`
  - Create: `/Users/soh/working/ai/claude-devtools/server/src/parser/session-discovery.test.ts`
- **Approach:** `discoverSessions()` is called on every `GET /api/sessions`, `GET /api/repos`, and `GET /api/costs` request. It iterates all project directories and calls `sessionCache.getSessionInfo()` per file (which does a `statSync` per file). With many sessions, this stat storm takes ~500ms.

  Add a result-level cache with a short TTL (2 seconds). On cache hit, return the cached `SessionInfo[]` immediately. On miss/expired, run the full discovery and cache the result. The 2s TTL means:
  - Repeated API calls within 2s are instant (covers the typical dashboard load where multiple components fetch simultaneously)
  - Changes to JSONL files are reflected within 2s (acceptable for a dashboard that also gets WS live events)

  Implementation: a module-level variable holding `{ sessions: SessionInfo[], timestamp: number }`. In `discoverSessions()`, check if `Date.now() - timestamp < TTL`. If yes, return cached sessions. Otherwise, run the real discovery.

  Also add `invalidateDiscoveryCache()` export so the watcher can call it when a new JSONL file is detected.

- **Tests:**
  - Test that two rapid calls return the same result without re-scanning
  - Test that cache expires after TTL
  - Test that `invalidateDiscoveryCache()` forces a fresh scan

- **Verify:** `cd /Users/soh/working/ai/claude-devtools/server && pnpm test --run src/parser/session-discovery.test.ts`
- **Depends on:** none (parallel safe with TASK-001)
- **Est:** 4 min

**Implementation:**

```typescript
// At module level in session-discovery.ts
const DISCOVERY_TTL_MS = 2_000;
let discoveryCache: { sessions: SessionInfo[]; timestamp: number } | null = null;

export function discoverSessions(): SessionInfo[] {
  // Return cached result if fresh
  if (discoveryCache && Date.now() - discoveryCache.timestamp < DISCOVERY_TTL_MS) {
    return discoveryCache.sessions;
  }

  const projectsDir = getClaudeProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const sessions: SessionInfo[] = [];
  // ... existing scanning logic ...

  // Cache the result
  discoveryCache = { sessions, timestamp: Date.now() };
  return sessions;
}

export function invalidateDiscoveryCache(): void {
  discoveryCache = null;
}
```

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverSessions, invalidateDiscoveryCache } from "./session-discovery.js";

describe("discoverSessions caching", () => {
  beforeEach(() => {
    invalidateDiscoveryCache();
  });

  it("returns consistent results on rapid successive calls", () => {
    const result1 = discoverSessions();
    const result2 = discoverSessions();
    // Same reference means cache hit
    expect(result1).toBe(result2);
  });

  it("invalidateDiscoveryCache forces fresh scan", () => {
    const result1 = discoverSessions();
    invalidateDiscoveryCache();
    const result2 = discoverSessions();
    // Different reference means cache miss
    expect(result1).not.toBe(result2);
    // But same content
    expect(result1.length).toBe(result2.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (no caching yet)
- [ ] **Step 3: Implement the TTL cache in session-discovery.ts**
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git add server/src/parser/session-discovery.ts server/src/parser/session-discovery.test.ts
git commit -m "perf: add 2s TTL cache to discoverSessions() — eliminates stat storm on rapid API calls"
```

---

### TASK-003: Cache discoverRepoGroups() using the same TTL pattern

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/server/src/parser/session-discovery.ts`
  - Modify: `/Users/soh/working/ai/claude-devtools/server/src/parser/session-discovery.test.ts`
- **Approach:** `discoverRepoGroups()` calls `discoverSessions()` internally, so it already benefits from TASK-002's cache. But it also does `resolveRepoRoot()` per session (stat calls to find `.git`), grouping, and sorting. Add the same TTL cache pattern for repo groups. Since `discoverRepoGroups()` delegates to `discoverSessions()`, invalidating the discovery cache should also invalidate the repo groups cache. Update `invalidateDiscoveryCache()` to clear both caches.
- **Tests:**
  - Test rapid calls return same reference
  - Test invalidation clears both caches
- **Verify:** `cd /Users/soh/working/ai/claude-devtools/server && pnpm test --run src/parser/session-discovery.test.ts`
- **Depends on:** TASK-002
- **Est:** 3 min

**Implementation:**

```typescript
let repoGroupsCache: { repos: RepoGroup[]; timestamp: number } | null = null;

export function discoverRepoGroups(): RepoGroup[] {
  if (repoGroupsCache && Date.now() - repoGroupsCache.timestamp < DISCOVERY_TTL_MS) {
    return repoGroupsCache.repos;
  }
  
  const sessions = discoverSessions();
  // ... existing grouping logic ...
  
  repoGroupsCache = { repos, timestamp: Date.now() };
  return repos;
}

export function invalidateDiscoveryCache(): void {
  discoveryCache = null;
  repoGroupsCache = null;
}
```

- [ ] **Step 1: Add test for repo groups caching**
- [ ] **Step 2: Implement the cache**
- [ ] **Step 3: Run tests**
- [ ] **Step 4: Commit**

```bash
git add server/src/parser/session-discovery.ts server/src/parser/session-discovery.test.ts
git commit -m "perf: add TTL cache to discoverRepoGroups() — covers /api/repos endpoint"
```

---

### TASK-004: Invalidate discovery cache from the file watcher

- **Agent:** engineer
- **Files:**
  - Modify: `/Users/soh/working/ai/claude-devtools/server/src/http/watcher.ts`
- **Approach:** The watcher detects new JSONL files and events. When it detects a change, it should call `invalidateDiscoveryCache()` so the next API request gets fresh data. This ensures the 2s TTL doesn't serve stale data when the watcher knows something changed. Read the watcher file first to find the right hook point.
- **Tests:** N/A (integration — tested via E2E)
- **Verify:** `cd /Users/soh/working/ai/claude-devtools/server && npx tsc --noEmit`
- **Depends on:** TASK-002
- **Est:** 2 min

- [ ] **Step 1: Read watcher.ts to find where file changes are detected**
- [ ] **Step 2: Add `invalidateDiscoveryCache()` call at the detection point**
- [ ] **Step 3: Run typecheck to verify no errors**
- [ ] **Step 4: Commit**

```bash
git add server/src/http/watcher.ts
git commit -m "perf: invalidate discovery cache on file watcher change detection"
```

---

### TASK-005: Run E2E benchmarks to verify improvements

- **Agent:** engineer
- **Files:** none (verification only)
- **Approach:** Start the dev server, run the E2E performance tests twice (cold + warm), and compare against the pre-fix baseline. The `/api/sessions` and `/api/repos` endpoints should be significantly faster on the second call (cache hit). Report the before/after numbers.
- **Tests:** E2E performance tests
- **Verify:** `cd /Users/soh/working/ai/claude-devtools/dashboard && npx playwright test e2e/performance.spec.ts --reporter=list`
- **Depends on:** TASK-001, TASK-002, TASK-003, TASK-004
- **Est:** 3 min

- [ ] **Step 1: Start server: `cd server && pnpm run dev &`**
- [ ] **Step 2: Run E2E perf tests**
- [ ] **Step 3: Run again immediately (warm cache) and compare**
- [ ] **Step 4: Run dashboard benchmarks to verify incremental improvement**
- [ ] **Step 5: Report before/after numbers**

---

## Dependency Graph

```
TASK-001 (incremental turn grouping) ─────────────────┐
TASK-002 (discoverSessions cache) → TASK-003 (repoGroups cache) ──┤
                                  → TASK-004 (watcher invalidation) ┤
                                                                    ↓
                                                              TASK-005 (verify)
```

Parallel-safe groups:
- **Group A (parallel):** TASK-001, TASK-002
- **Group B (after TASK-002):** TASK-003, TASK-004
- **Group C (after all):** TASK-005

## Risk Assessment

- **Incremental turn grouping regression:** The optimized path skips `groupEventsIntoTurns()` for the no-boundary case, calling `buildTurn()` directly. If `buildTurn()` doesn't handle all edge cases that the full function handles (like `finalizeTurn()`), the last turn may have wrong status. Mitigation: test against full rebuild output for correctness.
- **Discovery cache staleness:** 2s TTL means a brand new session won't appear for up to 2s. Acceptable because the WS connection pushes live events anyway, and the file watcher invalidates the cache. Mitigation: TASK-004 ensures watcher invalidates cache immediately.
- **Cache reference sharing:** Returning the same array reference from the cache means callers mutating the result would corrupt the cache. Mitigation: The route handlers JSON-serialize the result immediately (never mutate), and the discovery routes that add `isRunning` status do so on the session objects (which are cached by SessionCache separately). Verify no routes mutate the array itself.
