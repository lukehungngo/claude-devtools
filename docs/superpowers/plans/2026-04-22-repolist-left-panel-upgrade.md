# Implementation Plan: RepoList Left Panel Upgrade

## Goal
Upgrade the repository sidebar to match the new design: bold repo name + GitHub origin header, session items with 3-state dot + title + turn count + cost, and active-session left accent bar with bg-sel background.

## Setup
Create a git worktree before implementation:
```bash
# via EnterWorktree tool — branch: feat/repolist-left-panel-upgrade
```

---

## Tasks

### TASK-001: Add gitOrigin to server RepoGroup type
- **Agent:** engineer
- **Files:** `server/src/types.ts`
- **Approach:** Add `gitOrigin?: string` to the `RepoGroup` interface (line ~244). No other changes.
- **Tests:** N/A (type-only change, covered by tsc)
- **Verify:** `cd server && npx tsc --noEmit`
- **Depends on:** none
- **Est:** 2 min

### TASK-002: Compute gitOrigin in groupSessionsIntoRepos()
- **Agent:** engineer
- **Files:** `server/src/parser/session-discovery.ts`
- **Approach:** After constructing each `RepoGroup`, call `spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: group.cwd })`. Parse the result: strip trailing `.git`, extract `owner/repo` from both HTTPS (`https://github.com/owner/repo`) and SSH (`git@github.com:owner/repo`) formats. Swallow all errors (non-git dirs, no remote, network). Set `group.gitOrigin` only when successfully parsed. `spawnSync` is already used in this codebase — do not use `execSync`.
- **Tests:** Unit test the URL-parsing helper with HTTPS, SSH, non-GitHub, and error inputs.
- **Verify:** `cd server && pnpm test`
- **Depends on:** TASK-001
- **Est:** 5 min

### TASK-003: Add gitOrigin to dashboard RepoGroup type
- **Agent:** engineer
- **Files:** `dashboard/src/lib/types.ts`
- **Approach:** Add `gitOrigin?: string` to `RepoGroup` interface (line ~152). No other changes.
- **Tests:** N/A (type-only change)
- **Verify:** `cd dashboard && npx tsc --noEmit`
- **Depends on:** none (parallel to TASK-001)
- **Est:** 2 min

### TASK-004: Add sessionCostMap + turnCountMap to AppLayout, pass to RepoList
- **Agent:** engineer
- **Files:** `dashboard/src/routes/AppLayout.tsx`
- **Approach:**
  1. Add `sessionCostMap` state: `Record<string, number>`, initialized from `localStorage.getItem('sessionCostMap')` (JSON.parse with fallback `{}`).
  2. Add `sessionTurnCountMap` state: `Record<string, number>` (in-memory only, not persisted — turn counts don't need to survive reload since they come from metrics).
  3. In the `useEffect` that sets `currentMetrics`, after setting metrics, also:
     ```ts
     if (metrics.tokens.totalCost > 0) {
       setSessionCostMap(prev => {
         const next = { ...prev, [sessionId]: metrics.tokens.totalCost };
         localStorage.setItem('sessionCostMap', JSON.stringify(next));
         return next;
       });
     }
     setSessionTurnCountMap(prev => ({
       ...prev,
       [sessionId]: metrics.tokensByTurn.length
     }));
     ```
  4. Pass `sessionCostMap` and `sessionTurnCountMap` as new props to `<RepoList>`.
- **Tests:** Verify localStorage write is called when metrics load (mock localStorage).
- **Verify:** `cd dashboard && npx tsc --noEmit && pnpm test`
- **Depends on:** none (parallel to TASK-001/003)
- **Est:** 5 min

### TASK-005: Redesign RepoList.tsx to match new design
- **Agent:** engineer
- **Files:** `dashboard/src/components/RepoList.tsx`
- **Approach:**

  **Props changes:**
  - Add `sessionCostMap: Record<string, number>` prop
  - Add `sessionTurnCountMap: Record<string, number>` prop

  **Repo header (`.repo-header`):**
  - Keep chevron toggle (▾/▸)
  - Replace current folder name with stacked layout:
    ```tsx
    <div className="repo-name-stack">
      <span className="repo-folder-name">{repo.repoName}</span>
      {repo.gitOrigin && (
        <span className="repo-origin">
          <Github size={10} />
          {repo.gitOrigin}
        </span>
      )}
    </div>
    ```
  - Import `Github` from `lucide-react`

  **Session dot (3 states):**
  ```tsx
  const dotClass = session.isRunning ? 'dot run' : session.isActive ? 'dot pass' : 'dot idle';
  <span className={dotClass} />
  ```
  - CSS: `.dot.run { background: var(--acc); animation: pulse 1.5s ease-in-out infinite; }`
  - CSS: `.dot.pass { background: var(--grn); }`
  - CSS: `.dot.idle { background: var(--t3); }`
  - Add `@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }` to component styles

  **Session meta block:**
  ```tsx
  <div className="sess-meta">
    <div className="sess-title">{session.sessionName || session.id.slice(0,8)}</div>
    <div className="sess-sub">
      {sessionTurnCountMap[session.id] != null && (
        <span>T{sessionTurnCountMap[session.id]}</span>
      )}
      {sessionCostMap[session.id] != null && (
        <span className="sess-cost">${sessionCostMap[session.id].toFixed(2)}</span>
      )}
    </div>
  </div>
  ```

  **Active state:**
  - Active session row: add `active` CSS class
  - CSS: `.sess-item.active { background: var(--bg-sel); position: relative; }`
  - CSS: `.sess-item.active::before { content:''; position:absolute; left:0; top:0; bottom:0; width:2px; background:var(--acc); }`

  **Remove:**
  - `getTimeAgo()` function (drop entirely)
  - Event count display ("48e")
  - Time-ago display ("12m")

  **Preserve (do not touch):**
  - Copy session ID button
  - Resume (Play) button → `onResumeSession`
  - New session (Plus) button → `onNewSession`
  - Toggle turn history (LayoutList) button → `onToggleTurnHistory`
  - Collapse/expand repo chevron toggle
  - `onAddRepo` button

- **Tests:** Update existing tests: pass empty maps for new props, verify dot class logic, verify sub-line renders cost/turns when maps populated, verify empty sub-line when maps empty.
- **Verify:** `cd dashboard && pnpm test && npx tsc --noEmit`
- **Depends on:** TASK-003, TASK-004
- **Est:** 15 min

### TASK-006: Update RepoList tests
- **Agent:** engineer
- **Files:** `dashboard/src/components/__tests__/RepoList.test.tsx` (if exists), `dashboard/src/components/__tests__/RepoList-tier3.test.tsx`
- **Approach:** Add required `sessionCostMap` and `sessionTurnCountMap` props to all test renders (default `{}`). Add test cases: dot class reflects `isRunning`/`isActive`/neither, cost and turn count show when maps have values, neither shows when maps are empty, gitOrigin renders Github icon + text.
- **Tests:** TDD — update test before touching component.
- **Verify:** `cd dashboard && pnpm test -- --reporter verbose 2>&1 | grep -E "RepoList|PASS|FAIL"`
- **Depends on:** TASK-005
- **Est:** 5 min

---

## Dependency Graph

```
TASK-001 → TASK-002
TASK-003 ↘
           → TASK-005 → TASK-006
TASK-004 ↗
```

TASK-001 and TASK-003 can run in parallel.
TASK-004 is independent of 001/003 and can run in parallel.
TASK-005 depends on TASK-003 (dashboard type) and TASK-004 (props).
TASK-006 depends on TASK-005 (final component shape).

---

## Design Token Reference

| Token | Value | Usage |
|-------|-------|-------|
| `--acc` | `#C2592E` | Dot running state, left accent bar |
| `--grn` | `#3D8A4A` | Dot pass (active, not running) |
| `--t3` | gray | Dot idle |
| `--amb` | `#B07D2E` | Cost text color |
| `--bg-sel` | `#F0DDD5` | Active session row background |

---

## Risk Assessment

- **gitOrigin offline**: `spawnSync` may block briefly if git is slow. Mitigate: add `timeout: 1000` to spawnSync options.
- **localStorage quota**: Cost map grows unbounded. Acceptable for now (sessions are limited in practice); add eviction if needed later.
- **Turn count missing on reload**: `sessionTurnCountMap` is not persisted — rows show no turn count until that session's metrics are loaded. This is acceptable; turns appear after the user clicks the session.
- **Existing button layout**: The new `.sess-meta` block sits alongside the existing action buttons — ensure flex layout doesn't squash the meta block. Reserve `flex: 1; min-width: 0; overflow: hidden` on meta.
