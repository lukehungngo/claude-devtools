# CC Parity — Round 2 Implementation Plan

**Source spec:** `docs/spec/cc-parity-gaps-round2.md`
**Resume tag:** `phase-c-complete`
**Created:** 2026-05-16

Closes every remaining gap from the round-2 scan. Big shift: NEW-1
unblocks the previously-deferred P1-1/P1-2 daemon view by reading
`~/.claude/sessions/<pid>.json`. NEW-2 unblocks more accurate Tasks
tab data via `~/.claude/tasks/<sid>/<id>.json`.

---

## Phase R2A — fast wins (parallel, S-size)

These three tasks touch disjoint files and can run in one parallel
cluster.

### TASK-R2A1 — Wire OTel result fields from BottomPanel to CostTab (B2-WIRE) [S]

**Goal:** Pass `lastResultStopReason` and `lastResultFinishReasons` from
streaming state through BottomPanel to CostTab. Already-shipped data;
just the connecting line is missing.

**Files:**
- `dashboard/src/components/bottom-panel/BottomPanel.tsx` (one prop drill)
- `dashboard/src/routes/AppLayout.tsx` or wherever BottomPanel is rendered with streaming state

**Steps:**
1. `BottomPanel.tsx:299` currently renders `<CostTab metrics={metrics} />`. Extend BottomPanel props with `stopReason?: string` and `finishReasons?: readonly string[]`. Pass to CostTab.
2. Find where BottomPanel is rendered (grep `<BottomPanel`). The parent already has access to streaming state — pass `state.lastResultStopReason` and `state.lastResultFinishReasons`.
3. Smoke test: extend an existing BottomPanel test to render with those props and assert CostTab receives them.

**Verify:**
```bash
cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm vitest run src/components/bottom-panel/CostTab.test.tsx src/components/bottom-panel/BottomPanel 2>&1 | tail -5
cd /Users/soh/working/ai/claude-devtools && npx tsc -p dashboard --noEmit 2>&1 | tail -3
```

**Commit:** `feat: wire OTel result fields BottomPanel → CostTab (B2-WIRE)`

---

### TASK-R2A2 — Fix `react-hooks/rules-of-hooks` in ToolEntries.tsx (LX-5) [S]

**Goal:** Real bug — `useState` is called conditionally at
`ToolEntries.tsx:441`. Hoist it above the early return.

**Files:**
- `dashboard/src/components/conversation/ToolEntries.tsx`

**Steps:**
1. Read the file around lines 425–460.
2. Identify the early `return null` (or similar) preceding the `useState` call.
3. Move the `useState` above the return.
4. Also fix the `'ContentItem' is defined but never used` warning at line 3 by removing the import or prefixing with `_`.
5. Run eslint to confirm zero errors.

**Verify:**
```bash
cd /Users/soh/working/ai/claude-devtools && npx eslint dashboard/src/components/conversation/ToolEntries.tsx 2>&1 | tail -3
cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm vitest run src/components/conversation/ToolEntries 2>&1 | tail -5
```

**Commit:** `fix: hoist useState above early return in ToolEntries (LX-5)`

---

### TASK-R2A3 — Fix `require-yield` errors in session-manager.test.ts (LX-6) [S]

**Goal:** 4 test-stub `async function*` declarations lack `yield`. Either add a no-op yield or restructure.

**Files:**
- `server/src/session/session-manager.test.ts` (lines 264, 298, 367, 426)

**Steps:**
1. Read each of the 4 locations.
2. Simplest fix: add `if (false) yield;` (eslint-tolerated, lint-clean) at the top of each generator body, OR change `async function*` to `async function` returning a never-yielding async iterator.
3. Pick whichever keeps the existing test stubs simplest. Prefer the `if (false) yield;` no-op when the generator shape is part of the stubbed contract.

**Verify:**
```bash
cd /Users/soh/working/ai/claude-devtools && npx eslint server/src/session/session-manager.test.ts 2>&1 | grep -E "error|warning" | wc -l
# Must be 0 errors. Warnings ok.
cd /Users/soh/working/ai/claude-devtools/server && pnpm vitest run src/session/session-manager.test.ts 2>&1 | tail -3
```

**Commit:** `fix: add no-op yield to satisfy require-yield in session-manager tests (LX-6)`

---

## Phase R2B — daemon-state ingestion (NEW-1, the big unlock)

### TASK-R2B1 — Server: daemon-session discovery + REST endpoint [M]

**Goal:** Read `~/.claude/sessions/*.json` files into a typed model and expose via REST.

**Files (new):**
- `server/src/parser/daemon-session-discovery.ts`
- `server/src/parser/daemon-session-discovery.test.ts`
- `server/src/http/routes/daemon-sessions-routes.ts`
- `server/src/http/routes/daemon-sessions-routes.test.ts`

**Schema (already verified):**
```ts
export interface DaemonSession {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;       // unix ms
  updatedAt?: number;
  procStart?: string;
  version: string;         // CC version, e.g. "2.1.143"
  peerProtocol?: number;
  kind?: "interactive" | "background" | string;
  entrypoint?: string;     // "cli" | "claude-desktop" | "sdk-cli"
  status?: "idle" | "busy" | string;
  bridgeSessionId?: string;   // Remote Control / claude.ai bridge marker
}
```

**Steps:**
1. Create `daemon-session-discovery.ts`. Functions:
   ```ts
   export function listDaemonSessions(): DaemonSession[]
   export function findDaemonSessionByPid(pid: number): DaemonSession | null
   export function findDaemonSessionsBySessionId(sessionId: string): DaemonSession[]  // possibly multiple, dedupe by pid
   ```
   Read `~/.claude/sessions/*.json` lazily, with a stat-based cache (mirror SessionCache invalidation pattern from invariant #2).
2. Also detect "is the process still alive" — try `process.kill(pid, 0)` (POSIX no-op signal). If it throws ESRCH, the daemon entry is stale; mark `alive: false` in the typed result.
3. Create `daemon-sessions-routes.ts` with:
   ```
   GET /api/daemon-sessions          → { sessions: DaemonSession[] }
   GET /api/daemon-sessions/:pid     → { session: DaemonSession | null }
   ```
4. Mount in `server/src/http/routes.ts` next to `createProjectRoutes()`.
5. Tests:
   - listDaemonSessions returns all readable JSON files from a stub dir.
   - Stale-pid detection: write a fake JSON with pid=999999, assert `alive: false`.
   - Route returns the array.

**Verify:**
```bash
cd /Users/soh/working/ai/claude-devtools/server && pnpm vitest run src/parser/daemon-session-discovery src/http/routes/daemon-sessions-routes 2>&1 | tail -5
cd /Users/soh/working/ai/claude-devtools && npx tsc -p server --noEmit 2>&1 | tail -3
```

**Commit:** `feat: ingest ~/.claude/sessions/<pid>.json daemon state (NEW-1 server)`

---

### TASK-R2B2 — Server: cross-reference SessionInfo with daemon state [M]

**Depends on:** TASK-R2B1.

**Goal:** Enrich `SessionInfo` with `pid`, `daemonStatus`, `bridgeSessionId`, replace the mtime heuristic where authoritative.

**Files:**
- `server/src/types.ts` (extend `SessionInfo`)
- `server/src/cache/session-cache.ts` (or higher up in the discovery pipeline)
- `dashboard/src/lib/types.ts` (mirror the new fields)
- `server/src/http/routes/discovery-routes.ts` (currently at lines 88–100, replaces mtime heuristic when daemon status is available)

**Steps:**
1. Extend `SessionInfo`:
   ```ts
   pid?: number;
   daemonStatus?: "idle" | "busy" | "background" | string;
   bridgeSessionId?: string;
   daemonAlive?: boolean;
   ```
2. After `discoverSessions()` returns, walk the daemon list and overlay matching sessions (match by `sessionId`).
3. In `discovery-routes.ts:88-100` change the isRunning logic:
   ```ts
   if (daemon?.daemonAlive && daemon.daemonStatus === "busy") {
     session.isRunning = true;
   } else if (daemon?.daemonAlive && daemon.daemonStatus === "idle") {
     session.isRunning = false;        // authoritative: daemon says idle
   } else {
     session.isRunning = ageMs < RUNNING_THRESHOLD_MS;  // fall back to mtime
   }
   ```
4. Mirror the new fields in dashboard types and add nothing else to the dashboard yet (R2B3 handles UI).
5. Tests:
   - SessionInfo carries the new fields when daemon present.
   - Falls back to mtime when daemon absent.
   - Stale daemon (alive=false) treats as mtime fallback.

**Verify:**
```bash
cd /Users/soh/working/ai/claude-devtools/server && pnpm test 2>&1 | tail -3
cd /Users/soh/working/ai/claude-devtools && npx tsc -p server --noEmit && npx tsc -p dashboard --noEmit
```

**Commit:** `feat: enrich SessionInfo with daemon pid/status/bridge (NEW-1 server)`

---

### TASK-R2B3 — Dashboard: render daemon status + Remote Control indicator [M]

**Depends on:** TASK-R2B2.

**Goal:** Replace the mtime heuristic in the UI; show a "Remote Control" indicator when `bridgeSessionId` is set.

**Files:**
- `dashboard/src/components/RepoList.tsx` — session row rendering
- (possibly new) `dashboard/src/components/BridgeIndicator.tsx` for the small icon

**Steps:**
1. In `RepoList.tsx` session-row render, when `session.daemonStatus === "busy"` show a pulsing green dot. When `idle` show a steady green dot (daemon-confirmed idle). When daemon absent fall back to current behavior.
2. When `session.bridgeSessionId` is set, render a small `Radio` (or `Cloud`) icon from `lucide-react` next to the entrypoint badge with title="Connected via Remote Control / claude.ai".
3. Tests:
   - Row with daemonStatus="busy" renders the pulsing dot.
   - Row with bridgeSessionId renders the bridge icon.
   - Row without daemon falls back to mtime-based rendering.

**Verify:**
```bash
cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm vitest run src/components/RepoList.test.tsx 2>&1 | tail -5
cd /Users/soh/working/ai/claude-devtools && npx tsc -p dashboard --noEmit 2>&1 | tail -3
```

**Commit:** `feat: render daemon status + Remote Control bridge indicator (NEW-1 dashboard)`

---

## Phase R2C — daemon task-state (NEW-2)

### TASK-R2C1 — Read daemon task store + merge into TasksTab [M]

**Goal:** Read `~/.claude/tasks/<sessionId>/<id>.json` as authoritative source; fall back to `deriveSessionTasks()` for sessions without a tasks dir.

**Schema (already verified):**
```ts
export interface DaemonTaskRecord {
  id: string;
  subject: string;
  description?: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed" | "deleted" | string;
  blocks: string[];        // task IDs this blocks
  blockedBy: string[];     // task IDs blocking this one
}
```

**Files:**
- `server/src/parser/daemon-task-discovery.ts` (NEW)
- `server/src/parser/daemon-task-discovery.test.ts` (NEW)
- `server/src/http/routes/session-routes.ts` (add `GET /api/sessions/:sessionId/tasks` if not present)
- `dashboard/src/components/bottom-panel/TasksTab.tsx` (prefer daemon data when available)

**Steps:**
1. Create `daemon-task-discovery.ts`:
   ```ts
   export function loadDaemonTasks(sessionId: string): DaemonTaskRecord[]
   ```
   Read `~/.claude/tasks/<sessionId>/*.json` and return sorted by id (numeric).
2. New REST: `GET /api/sessions/:sessionId/tasks/daemon` returning `{ tasks: DaemonTaskRecord[] }`.
3. `TasksTab.tsx` — fetch the daemon endpoint first; if non-empty, render those. Fall back to current `deriveSessionTasks()` if empty.
4. Render `blockedBy`: small chain icon + dependency count badge next to each blocked task.
5. Tests:
   - `loadDaemonTasks` returns sorted records from a stub dir.
   - TasksTab prefers daemon data when present.

**Verify:**
```bash
cd /Users/soh/working/ai/claude-devtools/server && pnpm vitest run src/parser/daemon-task-discovery 2>&1 | tail -5
cd /Users/soh/working/ai/claude-devtools/dashboard && pnpm vitest run src/components/bottom-panel/TasksTab.test.tsx 2>&1 | tail -5
cd /Users/soh/working/ai/claude-devtools && npx tsc -p server --noEmit && npx tsc -p dashboard --noEmit
```

**Commit:** `feat: TasksTab uses ~/.claude/tasks/ daemon state with blockedBy chain (NEW-2)`

---

## Execution order + parallelization

```
Cluster 1 (3 parallel — disjoint files):
  R2A1 (B2-WIRE)   ← dashboard/src/components/bottom-panel/BottomPanel.tsx, parent
  R2A2 (LX-5)      ← dashboard/src/components/conversation/ToolEntries.tsx
  R2A3 (LX-6)      ← server/src/session/session-manager.test.ts

Cluster 2 (also parallel to Cluster 1 — disjoint files):
  R2B1 (NEW-1 server discovery)  ← all new files

After Cluster 1 + R2B1 done:
  R2B2 (NEW-1 SessionInfo enrichment) — touches server/src/types.ts and discovery-routes.ts
  R2C1 (NEW-2 task ingestion) — touches NEW files + TasksTab.tsx and session-routes.ts

After R2B2 done:
  R2B3 (NEW-1 dashboard UI) — touches RepoList.tsx
```

After each task: run that task's `Verify` block, then commit. Phase tags:
- `phase-r2a-complete` after R2A1+R2A2+R2A3
- `phase-r2b-complete` after R2B1+R2B2+R2B3
- `phase-r2c-complete` after R2C1

## Out of scope (still deferred to Phase D)

- P1-3 `/loop` wakeup markers (capture-gated)
- P1-4 `/goal` overlay (capture-gated)
- FU-1 SDK-level bound summarize (no SDK API)
- Splitting Hooks tab into separate Notifications tab (design choice, revisit later)
