# Lessons Learned — 2026-03-30 Performance Session

**Session scope:** 21 performance fixes across 3 rounds + code quality + UI redesign
**Output:** PRs #10-14, 1042 tests, 0 failures

---

## Lesson 1: Performance Is Not a Phase — It's a Constraint

**What happened:** We built 44 features across Tiers 1-3, then discovered the app was unusable on long sessions. Every WS event triggered O(n) cascades, full file re-reads, and complete DAG recomputation. A 500-event session caused visible lag.

**Root cause:** Performance was treated as "something we'll optimize later" instead of a constraint on every feature. Each feature worked in isolation but compounded into O(n²) behavior at scale.

**Rule:** Every new feature must meet performance budgets BEFORE merge:
- O(1) per live event (not O(n))
- Cached data for repeat reads
- React.memo with proper comparators
- No sync I/O on request paths

**Performance regressions are P0** — same severity as data loss or security vulnerabilities.

---

## Lesson 2: The O(n) Cascade Is the #1 Performance Killer in React

**What happened:** A single WS event triggered: new array ref → Set rebuild → full turn grouping → full DAG recompute → all components re-render. For a 500-event session, this was 500+ operations per event at ~60 events/second during streaming.

**The cascade:**
```
WS event → setState([...prev, event])     ← new array
  → useMemo(allEvents) → Set(n UUIDs)     ← O(n)
    → groupEventsIntoTurns(allEvents)      ← O(n)
      → filterDagForTurn → new arrays      ← O(n)
        → DAG layout recompute             ← O(n²)
          → All unmemoized components       ← full re-render tree
```

**Fix pattern:**
1. Batch inputs (requestAnimationFrame)
2. Cache intermediate results (restKeys Set, turn list)
3. Incremental updates (only rebuild what changed)
4. Stable references (return same object if data unchanged)
5. React.memo everything expensive

---

## Lesson 3: useEffect Dependencies with State Arrays Kill Intervals

**What happened:** `liveEvents` (a state array) was in the `useEffect` dependency array for the 30s background sync interval. Every RAF batch updated `liveEvents`, tearing down and recreating the interval. During active streaming, the timer reset every ~16ms and never reached 30s.

**Rule:** Never put frequently-changing state in `useEffect` deps for timers/intervals. Use a ref updated on render:
```typescript
const liveEventsLengthRef = useRef(0);
liveEventsLengthRef.current = liveEvents.length;
// Read ref inside interval callback, not state
```

---

## Lesson 4: File Re-reads Are the Server's Version of Re-renders

**What happened:** `discoverSessions()` was called from 11 route handlers, each reading every JSONL file in full. 50 sessions × 10MB = 500MB I/O per request. The cost aggregator read all files twice.

**Rule:** Same cache-first principle as React:
- Stat before read (mtime+size as cache key)
- Head/tail byte-range reads for metadata (don't read the middle)
- Incremental offset-based cost aggregation
- LRU cache with TTL for computed results

---

## Lesson 5: React.memo Comparators Must Cover All Data Props

**What happened:** TurnCard's comparator checked `events.length` but not `cost` or `agents.length`. When incremental turn rebuild updated cost without changing event count, the card showed stale data.

**Rule:** For every prop in the comparator, ask: "Can this change independently of the other checked props?" If yes, add it. Check: event count, status, duration, cost, agents, highlights.

---

## Top 3 Performance Rules

1. **O(1) per event, not O(n)** — batch, cache, increment, memoize
2. **Performance budgets are merge gates** — not "optimize later"
3. **Test with 500+ events** — features that work on 10 events break at 500
