# UI Layout Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp the dashboard layout so connection status + usage meters live in the Titlebar, the sidebar becomes a pure repo/session navigator, and TopBar HUD shows richer context info.

**Architecture:** Move CONNECTION + USAGE sections from sidebar (RepoList) to Titlebar. Add pong-based WS latency measurement to `useUnifiedWebSocket`. TopBar gains context window size suffix and cosmetic polish. Zero functionality changes — layout, CSS, and data routing only.

**Tech Stack:** React, TypeScript strict, Tailwind dt-* tokens, Vitest, lucide-react

---

## File Map

| File | Change |
|------|--------|
| `server/src/http/server.ts` | Add ws message handler to echo ping→pong |
| `dashboard/src/hooks/useUnifiedWebSocket.ts` | Export `parsePongLatency`, add `wsLatency` state + ping interval |
| `dashboard/src/components/Titlebar.tsx` | Add connection pill + usage meters, remove center repo@branch text |
| `dashboard/src/routes/AppLayout.tsx` | Pass `wsLatency` + `usage` to Titlebar; remove `isConnected`/`usage` from RepoList after T2 |
| `dashboard/src/components/RepoList.tsx` | Remove CONNECTION + USAGE sections; add REPOS header with + and ⊞ buttons |
| `dashboard/src/components/TopBar.tsx` | Context suffix "of Nk", YOLO badge accent |
| `dashboard/src/components/__tests__/Titlebar.test.tsx` | Update tests for real connection pill |
| `dashboard/src/hooks/useUnifiedWebSocket.test.ts` | New: test `parsePongLatency` |

## Dependency Order

- **T1** (WS latency) → must complete before T2
- **T2** (Titlebar + AppLayout + RepoList cleanup) → depends on T1
- **T3** (REPOS header + ⊞ button) → depends on T2 (same files)
- **T4** (TopBar polish) → independent, can run parallel to T1

---

## Task 1: WS Latency Measurement

**Files:**
- Modify: `server/src/http/server.ts` (add 8 lines to ws.on("connection") handler)
- Modify: `dashboard/src/hooks/useUnifiedWebSocket.ts` (add parsePongLatency + wsLatency state)
- Create: `dashboard/src/hooks/useUnifiedWebSocket.test.ts`

### Step 1.1: Write failing tests for parsePongLatency

Create `dashboard/src/hooks/useUnifiedWebSocket.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parsePongLatency, dispatchWsMessage } from "./useUnifiedWebSocket";

describe("parsePongLatency", () => {
  it("returns latency ms when message is pong with ts", () => {
    const sentAt = 1000;
    const now = 1047;
    const data = JSON.stringify({ type: "pong", ts: sentAt });
    expect(parsePongLatency(data, now)).toBe(47);
  });

  it("returns null for non-pong messages", () => {
    const data = JSON.stringify({ type: "new-events", events: [] });
    expect(parsePongLatency(data, Date.now())).toBeNull();
  });

  it("returns null for pong without ts", () => {
    const data = JSON.stringify({ type: "pong" });
    expect(parsePongLatency(data, Date.now())).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parsePongLatency("not json", Date.now())).toBeNull();
  });

  it("does not interfere with dispatchWsMessage for business messages", () => {
    let called = false;
    const handlers = {
      onNewSession: () => { called = true; },
    };
    const data = JSON.stringify({ type: "new-session", filePath: "/tmp/x.jsonl" });
    dispatchWsMessage(data, handlers);
    expect(called).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run to confirm FAIL**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/hooks/useUnifiedWebSocket.test.ts
```

Expected: FAIL with "parsePongLatency is not a function"

- [ ] **Step 1.3: Add parsePongLatency to useUnifiedWebSocket.ts**

In `dashboard/src/hooks/useUnifiedWebSocket.ts`, add after the `dispatchWsMessage` function (after line 109):

```typescript
/**
 * Checks if a raw WS message is a pong response.
 * Returns round-trip latency in ms, or null if not a pong.
 * Exported for testing.
 */
export function parsePongLatency(data: string, now: number): number | null {
  try {
    const msg = JSON.parse(data) as { type: string; ts?: number };
    if (msg.type === "pong" && typeof msg.ts === "number") {
      return now - msg.ts;
    }
  } catch { /* ignore */ }
  return null;
}
```

- [ ] **Step 1.4: Run to confirm PASS**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/hooks/useUnifiedWebSocket.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 1.5: Update UnifiedWebSocketState interface + hook to expose wsLatency**

In `dashboard/src/hooks/useUnifiedWebSocket.ts`:

1. Update `UnifiedWebSocketState` interface (replace the existing interface at line 70):

```typescript
export interface UnifiedWebSocketState {
  isConnected: boolean;
  wsLatency: number | null;
  error: string | null;
}
```

2. In `useUnifiedWebSocket` function body, add state after the existing `isConnected` state (after line 119):

```typescript
const [isConnected, setIsConnected] = useState(false);
const [wsLatency, setWsLatency] = useState<number | null>(null);
const [error, setError] = useState<string | null>(null);
const wsRef = useRef<WebSocket | null>(null);
const reconnectDelay = useRef(1000);
const unmountedRef = useRef(false);
const handlersRef = useRef(handlers);
const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

3. Replace the `ws.onopen` handler (lines 140-144) with:

```typescript
ws.onopen = () => {
  setIsConnected(true);
  setError(null);
  reconnectDelay.current = 1000;
  // Initial latency measurement
  ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
  // Periodic latency refresh every 15s
  pingIntervalRef.current = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
    }
  }, 15_000);
};
```

4. Replace the `ws.onclose` handler (lines 146-154) with:

```typescript
ws.onclose = () => {
  setIsConnected(false);
  wsRef.current = null;
  if (pingIntervalRef.current) {
    clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = null;
  }
  if (unmountedRef.current) return;
  const delay = reconnectDelay.current;
  reconnectDelay.current = Math.min(delay * 2, 30000);
  setTimeout(connect, delay);
};
```

5. Replace the `ws.onmessage` handler (lines 161-163) with:

```typescript
ws.onmessage = (event: MessageEvent) => {
  const data = event.data as string;
  const latency = parsePongLatency(data, Date.now());
  if (latency !== null) {
    setWsLatency(latency);
    return;
  }
  dispatchWsMessage(data, handlersRef.current);
};
```

6. Update the return statement (line 175) to include `wsLatency`:

```typescript
return { isConnected, wsLatency, error };
```

7. Also update the cleanup function (in the effect's return) to clear ping interval:

```typescript
return () => {
  unmountedRef.current = true;
  if (pingIntervalRef.current) {
    clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = null;
  }
  wsRef.current?.close();
  wsRef.current = null;
};
```

- [ ] **Step 1.6: Add ping→pong echo handler to server.ts**

In `server/src/http/server.ts`, inside the `wss.on("connection", (ws) => {` block, add the message handler after the heartbeat interval setup (after line 64):

```typescript
// Application-level ping/pong for client-side latency measurement
ws.on("message", (data: Buffer | string) => {
  try {
    const msg = JSON.parse(data.toString()) as { type: string; ts?: number };
    if (msg.type === "ping" && typeof msg.ts === "number") {
      ws.send(JSON.stringify({ type: "pong", ts: msg.ts }));
    }
  } catch { /* ignore malformed */ }
});
```

- [ ] **Step 1.7: Verify typecheck passes**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
npx tsc --noEmit -p server/tsconfig.json && cd dashboard && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 1.8: Run all dashboard tests**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run
```

Expected: 1240 passed (1235 + 5 new)

- [ ] **Step 1.9: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
git add server/src/http/server.ts dashboard/src/hooks/useUnifiedWebSocket.ts dashboard/src/hooks/useUnifiedWebSocket.test.ts
git commit -m "feat: add WS ping/pong latency measurement to useUnifiedWebSocket"
```

---

## Task 2: Titlebar Redesign + Sidebar Cleanup

**Files:**
- Modify: `dashboard/src/components/Titlebar.tsx` (full rewrite of center area)
- Modify: `dashboard/src/routes/AppLayout.tsx` (pass wsLatency + usage to Titlebar; stop passing usage/isConnected to RepoList)
- Modify: `dashboard/src/components/RepoList.tsx` (remove CONNECTION + USAGE sections)
- Modify: `dashboard/src/components/__tests__/Titlebar.test.tsx` (update tests for real connection pill)

**Prerequisite:** Task 1 must be complete (wsLatency available from hook).

### Step 2.1: Write failing tests for Titlebar connection pill + usage meters

Replace `dashboard/src/components/__tests__/Titlebar.test.tsx` entirely:

```typescript
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

import { Titlebar } from "../Titlebar";
import type { UsageInfo } from "../../lib/types";

const mockUsage: UsageInfo = {
  fiveHour: { utilization: 0.13, resetsAt: null },
  sevenDay: { utilization: 0.33, resetsAt: null },
  planName: "Max",
};

describe("Titlebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders brand button", () => {
    render(<Titlebar />);
    expect(screen.getByTestId("home-button")).toBeDefined();
  });

  it("shows connected pill when isConnected=true", () => {
    render(<Titlebar isConnected={true} wsLatency={47} />);
    expect(screen.getByText("Connected")).toBeDefined();
    expect(screen.getByText("47ms")).toBeDefined();
  });

  it("shows disconnected pill when isConnected=false", () => {
    render(<Titlebar isConnected={false} wsLatency={null} />);
    expect(screen.getByText("Disconnected")).toBeDefined();
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("renders no connection pill when isConnected is not provided", () => {
    render(<Titlebar />);
    expect(screen.queryByText("Connected")).toBeNull();
    expect(screen.queryByText("Disconnected")).toBeNull();
  });

  it("shows session usage meter when usage provided", () => {
    render(<Titlebar usage={mockUsage} />);
    expect(screen.getByText("13%")).toBeDefined();
  });

  it("does not render repo@branch in center (moved to TopBar)", () => {
    render(<Titlebar repoName="myrepo" branch="main" />);
    // repoName/branch props exist for legacy but should NOT appear in center
    // The center area shows usage meters, not repo text
    // Verify the text is not visually in the center — we just check it's not duplicated naively
    const el = screen.queryByText("myrepo @ main");
    expect(el).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run to confirm FAIL**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/components/__tests__/Titlebar.test.tsx
```

Expected: FAIL — "isConnected" prop not accepted, "Connected" text missing

- [ ] **Step 2.3: Rewrite Titlebar.tsx**

Replace `dashboard/src/components/Titlebar.tsx` entirely:

```typescript
import { Sun, Moon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "../contexts/ThemeContext";
import type { UsageInfo } from "../lib/types";

interface TitlebarProps {
  repoName?: string;
  branch?: string;
  isConnected?: boolean;
  wsLatency?: number | null;
  usage?: UsageInfo | null;
}

export function Titlebar({ isConnected, wsLatency, usage }: TitlebarProps) {
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const sessionPct = usage?.fiveHour.utilization != null
    ? Math.round(usage.fiveHour.utilization * 100)
    : null;
  const ratePct = usage?.sevenDay.utilization != null
    ? Math.round(usage.sevenDay.utilization * 100)
    : null;

  return (
    <div
      className="flex items-center shrink-0 gap-2"
      style={{
        height: "var(--titlebar-h, 38px)",
        background: "var(--bg-s)",
        padding: "0 16px",
        borderBottom: "1px solid var(--bd)",
      }}
    >
      {/* Brand */}
      <button
        onClick={() => navigate({ to: "/" })}
        className="cursor-pointer bg-transparent border-none font-semibold shrink-0"
        style={{ fontSize: 12, color: "var(--acc)", padding: 0, letterSpacing: ".2px" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        title="Back to home"
        data-testid="home-button"
      >
        Claude DevTools
      </button>

      {/* Connection pill */}
      {isConnected !== undefined && (
        <div
          className="flex items-center shrink-0"
          style={{
            gap: 5,
            padding: "2px 8px",
            borderRadius: 10,
            background: isConnected ? "var(--grn-bg)" : "var(--red-bg)",
            marginLeft: 4,
          }}
          title="WebSocket connection status"
        >
          <div
            className="rounded-full shrink-0"
            style={{
              width: 6,
              height: 6,
              background: isConnected ? "var(--grn)" : "var(--red)",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: isConnected ? "var(--grn)" : "var(--red)",
              letterSpacing: ".2px",
            }}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          {isConnected && wsLatency != null && (
            <span
              className="font-mono"
              style={{ fontSize: 9, color: "var(--grn)", opacity: 0.75 }}
            >
              {wsLatency}ms
            </span>
          )}
        </div>
      )}

      {/* Center: usage meters */}
      <div className="flex-1 flex items-center justify-center gap-3">
        {sessionPct != null && (
          <UsageMeter label="5h" pct={sessionPct} resetsAt={usage?.fiveHour.resetsAt} />
        )}
        {ratePct != null && (
          <UsageMeter label="7d" pct={ratePct} resetsAt={usage?.sevenDay.resetsAt} />
        )}
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center justify-center cursor-pointer shrink-0"
        style={{
          width: 26, height: 26, borderRadius: 6,
          border: "1px solid var(--bd)", background: "transparent",
          color: "var(--t3)", fontSize: 14, transition: "all .15s",
        }}
        title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      >
        {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
      </button>

      {/* Avatar button */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 26, height: 26, borderRadius: "50%",
          border: "1px solid var(--bd)",
          background: "linear-gradient(135deg, var(--acc), var(--pur))",
          color: "#fff", fontFamily: "var(--font-mono)",
          fontSize: 10, fontWeight: 700,
          cursor: "pointer", position: "relative", marginLeft: 4,
        }}
        title="Profile"
        role="button"
        aria-label="Profile"
      >
        LH
        <span
          style={{
            position: "absolute", top: -2, right: -2,
            width: 7, height: 7, borderRadius: "50%",
            background: "var(--grn)", border: "1.5px solid var(--bg-s)",
          }}
        />
      </div>
    </div>
  );
}

function UsageMeter({
  label,
  pct,
  resetsAt,
}: {
  label: string;
  pct: number;
  resetsAt: string | null | undefined;
}) {
  const color = pct > 80 ? "var(--red)" : pct > 50 ? "var(--amb)" : "var(--grn)";
  const title = resetsAt
    ? `Resets at ${new Date(resetsAt).toLocaleTimeString()}`
    : undefined;

  return (
    <div
      className="flex items-center shrink-0"
      style={{ gap: 4 }}
      title={title}
    >
      <span
        className="font-mono"
        style={{ fontSize: 9, color: "var(--t3)", letterSpacing: ".2px" }}
      >
        {label}
      </span>
      <div
        style={{
          width: 28,
          height: 3,
          borderRadius: 2,
          background: "var(--bd)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: color,
            borderRadius: 2,
            transition: "width .3s",
          }}
        />
      </div>
      <span
        className="font-mono"
        style={{ fontSize: 9, color, letterSpacing: ".2px" }}
      >
        {pct}%
      </span>
    </div>
  );
}
```

- [ ] **Step 2.4: Update AppLayout.tsx to pass wsLatency + usage to Titlebar, remove from RepoList**

In `dashboard/src/routes/AppLayout.tsx`:

1. Find where `useUnifiedWebSocket` result is destructured. Currently it returns `{ isConnected, error }`. Update to also destructure `wsLatency`:

Find the line (around line 150-160, wherever `useUnifiedWebSocket` is called) that reads:
```typescript
const { isConnected, error } = useUnifiedWebSocket(...);
```
Or similar, and update to:
```typescript
const { isConnected, wsLatency, error } = useUnifiedWebSocket(...);
```

2. Find the `<Titlebar>` JSX in AppLayout (around line 294-297) and update to pass new props:

```typescript
<Titlebar
  repoName={currentRepo?.repoName}
  branch={currentMetrics?.session.gitBranch ?? currentRepo?.gitBranch}
  isConnected={isConnected}
  wsLatency={wsLatency}
  usage={usage}
/>
```

3. Find the `<RepoList>` JSX (around line 321-353) and remove `usage` and `isConnected` props. Keep all other props intact:

```typescript
<RepoList
  repos={repos}
  loading={reposLoading}
  selected={selected}
  onSelect={handleSelect}
  onNewSession={() => {
    const selectedRepo = repos.find((r) =>
      r.sessions.some(
        (s) =>
          s.projectHash === selected?.projectHash &&
          s.id === selected?.sessionId,
      ),
    );
    const cwd = selectedRepo?.cwd ?? repos[0]?.cwd;
    if (cwd) startNewSession(cwd);
  }}
  activeSessionId={activeSessionId}
  onResumeSession={async (sessionId, cwd) => {
    try {
      await fetch(`/api/sessions/${sessionId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd }),
      });
      setActiveSessionId(sessionId);
    } catch (err) {
      console.error("Failed to resume session:", err);
    }
  }}
/>
```

Note: `isConnected` and `usage` are intentionally removed from RepoList.

- [ ] **Step 2.5: Remove CONNECTION + USAGE sections from RepoList.tsx**

In `dashboard/src/components/RepoList.tsx`:

1. Remove `usage` and `isConnected` from the `Props` interface (lines 33-34):
   ```typescript
   // Remove these two lines from the Props interface:
   usage?: UsageInfo | null;
   isConnected?: boolean;
   ```

2. Remove `usage` and `isConnected` from the function destructuring parameter (lines 46-47):
   ```typescript
   // Remove usage and isConnected from destructuring:
   // Before: }, usage, isConnected }: Props)
   // After: }: Props)
   ```

3. Remove the computed `sessionPct` and `ratePct` lines (84-85):
   ```typescript
   // Remove:
   const sessionPct = usage?.fiveHour.utilization ?? null;
   const ratePct = usage?.sevenDay.utilization ?? null;
   ```

4. Delete the entire CONNECTION section JSX (lines 89-139):
   ```
   {/* Connection section */}
   <SectionTitle>Connection</SectionTitle>
   <div style={{ padding: "8px 14px" }} className="flex items-center gap-2">
     ...
   </div>
   {usage?.planName && (
     ...
   )}
   ```

5. Delete the entire USAGE section JSX (lines 141-146):
   ```
   {/* Usage section */}
   <SectionTitle>Usage</SectionTitle>
   <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--bd)" }}>
     <UsageRow label="Session limit (5h)" value={sessionPct} resetsAt={usage?.fiveHour.resetsAt} />
     <UsageRow label="Rate limit (7d)" value={ratePct} resetsAt={usage?.sevenDay.resetsAt} />
   </div>
   ```

6. Delete `{/* Repositories section */}` header and `<SectionTitle>Repositories</SectionTitle>` (line 148-149).

7. Remove the `UsageInfo` import from the import line if it's no longer used:
   ```typescript
   // Before:
   import type { RepoGroup, SessionInfo, UsageInfo } from "../lib/types";
   // After:
   import type { RepoGroup, SessionInfo } from "../lib/types";
   ```

8. Also check if `UsageRow` function is still used (it was used in the USAGE section). If not, delete the entire `UsageRow` function at the bottom of the file.

The result: the sidebar JSX should now start directly with the repo list `<div className="flex-1 overflow-y-auto ...">`.

- [ ] **Step 2.6: Run Titlebar tests to confirm PASS**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/components/__tests__/Titlebar.test.tsx
```

Expected: PASS (6 tests)

- [ ] **Step 2.7: Typecheck**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
npx tsc --noEmit -p server/tsconfig.json && cd dashboard && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2.8: Run all dashboard tests**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run
```

Expected: ≥1235 passed

- [ ] **Step 2.9: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
git add dashboard/src/components/Titlebar.tsx dashboard/src/routes/AppLayout.tsx dashboard/src/components/RepoList.tsx dashboard/src/components/__tests__/Titlebar.test.tsx
git commit -m "feat: move connection status + usage meters to Titlebar; clean up sidebar"
```

---

## Task 3: REPOS Header with Toggle Button

**Files:**
- Modify: `dashboard/src/components/RepoList.tsx` (add REPOS header)
- Modify: `dashboard/src/routes/AppLayout.tsx` (pass onToggleTurnHistory to RepoList)

**Prerequisite:** Task 2 must be complete (RepoList is already clean from CONNECTION/USAGE removal).

### Step 3.1: Write failing test for REPOS header

Add to the end of `dashboard/src/components/RepoList.test.tsx` (create if missing, or add as new describe block):

Create `dashboard/src/components/RepoList.test.tsx`:

```typescript
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RepoList } from "./RepoList";

const mockRepos = [
  {
    cwd: "/tmp/repo1",
    repoName: "myrepo",
    gitBranch: "main",
    hasActiveSessions: false,
    sessions: [],
  },
];

describe("RepoList", () => {
  afterEach(() => { cleanup(); });

  it("renders REPOS header", () => {
    render(
      <RepoList repos={mockRepos} loading={false} selected={null} onSelect={() => {}} />
    );
    expect(screen.getByText("REPOS")).toBeDefined();
  });

  it("calls onToggleTurnHistory when toggle button clicked", () => {
    const onToggle = vi.fn();
    render(
      <RepoList
        repos={mockRepos}
        loading={false}
        selected={null}
        onSelect={() => {}}
        onToggleTurnHistory={onToggle}
      />
    );
    const toggleBtn = screen.getByTitle("Toggle turn history panel");
    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls onNewSession when + button clicked", () => {
    const onNew = vi.fn();
    render(
      <RepoList
        repos={mockRepos}
        loading={false}
        selected={null}
        onSelect={() => {}}
        onNewSession={onNew}
      />
    );
    const newBtn = screen.getByTitle("Start new session");
    fireEvent.click(newBtn);
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3.2: Run to confirm FAIL**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/components/RepoList.test.tsx
```

Expected: FAIL — "REPOS" text not found, title elements missing

- [ ] **Step 3.3: Add onToggleTurnHistory prop and REPOS header to RepoList.tsx**

In `dashboard/src/components/RepoList.tsx`:

1. Add `onToggleTurnHistory?: () => void;` to the `Props` interface:

```typescript
interface Props {
  repos: RepoGroup[];
  loading: boolean;
  selected: { projectHash: string; sessionId: string } | null;
  onSelect: (s: { projectHash: string; sessionId: string }) => void;
  onNewSession?: () => void;
  activeSessionId?: string | null;
  onResumeSession?: (sessionId: string, cwd: string) => void;
  onAddRepo?: (path: string) => void;
  onToggleTurnHistory?: () => void;
}
```

2. Add `onToggleTurnHistory` to the destructuring:

```typescript
export function RepoList({
  repos,
  loading,
  selected,
  onSelect,
  onNewSession,
  activeSessionId,
  onResumeSession,
  onToggleTurnHistory,
}: Props) {
```

3. Add the `LayoutList` icon to the imports from `lucide-react`. Change the import line from:

```typescript
import { Plus, Play, Settings, Copy, Check } from "lucide-react";
```

to:

```typescript
import { Plus, Play, Settings, Copy, Check, LayoutList } from "lucide-react";
```

4. At the top of the returned JSX (inside `<div className="flex flex-col h-full overflow-hidden">`), add the REPOS header as the first child:

```tsx
{/* REPOS header */}
<div
  className="flex items-center shrink-0"
  style={{
    padding: "10px 14px 8px",
    borderBottom: "1px solid var(--bd)",
    gap: 6,
  }}
>
  <span className="t-section flex-1">REPOS</span>
  {onNewSession && (
    <button
      onClick={onNewSession}
      className="flex items-center justify-center cursor-pointer border-none bg-transparent"
      style={{
        width: 20, height: 20, borderRadius: 4,
        color: "var(--t3)", transition: "color .15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t3)"; }}
      title="Start new session"
      aria-label="Start new session"
    >
      <Plus size={12} />
    </button>
  )}
  {onToggleTurnHistory && (
    <button
      onClick={onToggleTurnHistory}
      className="flex items-center justify-center cursor-pointer border-none bg-transparent"
      style={{
        width: 20, height: 20, borderRadius: 4,
        color: "var(--t3)", transition: "color .15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t3)"; }}
      title="Toggle turn history panel"
      aria-label="Toggle turn history panel"
    >
      <LayoutList size={12} />
    </button>
  )}
</div>
```

- [ ] **Step 3.4: Pass onToggleTurnHistory from AppLayout to RepoList**

In `dashboard/src/routes/AppLayout.tsx`, find the `<RepoList>` JSX and add `onToggleTurnHistory={toggleTurnHistory}` as a prop:

```tsx
<RepoList
  repos={repos}
  loading={reposLoading}
  selected={selected}
  onSelect={handleSelect}
  onNewSession={() => { ... }}
  activeSessionId={activeSessionId}
  onResumeSession={async (sessionId, cwd) => { ... }}
  onToggleTurnHistory={toggleTurnHistory}
/>
```

(`toggleTurnHistory` is already defined in AppLayout as the `useCallback` at line 82.)

- [ ] **Step 3.5: Run tests**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/components/RepoList.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 3.6: Run full suite + typecheck**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
npx tsc --noEmit -p dashboard/tsconfig.json && cd dashboard && pnpm test --run
```

Expected: 0 TS errors, ≥1235 tests pass

- [ ] **Step 3.7: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
git add dashboard/src/components/RepoList.tsx dashboard/src/routes/AppLayout.tsx dashboard/src/components/RepoList.test.tsx
git commit -m "feat: add REPOS header with new-session and toggle-turn-history buttons to sidebar"
```

---

## Task 4: TopBar Polish

**Files:**
- Modify: `dashboard/src/components/TopBar.tsx` (context suffix, YOLO badge accent)

**Note:** This task is independent and can run in parallel with T1.

### Step 4.1: Write failing tests for TopBar changes

Create `dashboard/src/components/__tests__/TopBar.test.tsx`:

```typescript
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { TopBar } from "../TopBar";
import type { SessionMetrics } from "../../lib/types";

function makeMetrics(overrides: Partial<SessionMetrics> = {}): SessionMetrics {
  return {
    session: {
      id: "test",
      projectHash: "abc",
      isRunning: false,
      gitBranch: "main",
      lastModified: new Date().toISOString(),
      sessionName: "test",
      cwd: "/tmp",
      eventCount: 0,
    },
    tokens: { inputTokens: 0, outputTokens: 0, totalCost: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    turns: [],
    totalToolCalls: 0,
    totalAgents: 0,
    models: ["claude-sonnet-4-6"],
    duration: 0,
    contextPercent: 67,
    contextWindowSize: 200000,
    tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
    hasRemoteControl: false,
    ...overrides,
  };
}

describe("TopBar context display", () => {
  afterEach(() => { cleanup(); });

  it("shows context percent", () => {
    render(<TopBar metrics={makeMetrics({ contextPercent: 67 })} />);
    expect(screen.getByText("67%")).toBeDefined();
  });

  it("shows context window size as 'of Nk' suffix", () => {
    render(<TopBar metrics={makeMetrics({ contextPercent: 67, contextWindowSize: 200000 })} />);
    expect(screen.getByText("of 200K")).toBeDefined();
  });

  it("shows 'of 1M' for 1M context window", () => {
    render(<TopBar metrics={makeMetrics({ contextPercent: 10, contextWindowSize: 1000000 })} />);
    expect(screen.getByText("of 1M")).toBeDefined();
  });
});

describe("TopBar YOLO badge", () => {
  afterEach(() => { cleanup(); });

  it("renders YOLO badge for bypassPermissions mode", () => {
    render(
      <TopBar
        metrics={null}
        permissionMode="bypassPermissions"
        onPermissionModeChange={() => {}}
      />
    );
    expect(screen.getByText("YOLO")).toBeDefined();
  });
});
```

- [ ] **Step 4.2: Run to confirm FAIL**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/components/__tests__/TopBar.test.tsx
```

Expected: FAIL — "of 200K" text not found

- [ ] **Step 4.3: Add context window size suffix to TopBar.tsx**

In `dashboard/src/components/TopBar.tsx`, find the Context section (around lines 194-226):

```tsx
{/* Context — only show static when controls are NOT active */}
{!(isLive && onModelSelect) && (
  <>
    <div className="flex flex-col items-center gap-[2px]">
      <span className="t-eyebrow">Context</span>
      <div className="flex items-center gap-1">
        <span className="t-metric">
          {contextPct}%
        </span>
        <div
          style={{
            width: 42,
            height: 4,
            borderRadius: 2,
            background: "var(--bd)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${contextPct}%`,
              borderRadius: 2,
              background: contextColor,
              transition: "width .3s, background .3s",
            }}
          />
        </div>
      </div>
    </div>
    <HudSep />
  </>
)}
```

Replace this block with:

```tsx
{/* Context — only show static when controls are NOT active */}
{!(isLive && onModelSelect) && (
  <>
    <div className="flex flex-col items-center gap-[2px]">
      <span className="t-eyebrow">Context</span>
      <div className="flex items-center gap-1">
        <span className="t-metric">
          {contextPct}%
        </span>
        <div
          style={{
            width: 42,
            height: 4,
            borderRadius: 2,
            background: "var(--bd)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${contextPct}%`,
              borderRadius: 2,
              background: contextColor,
              transition: "width .3s, background .3s",
            }}
          />
        </div>
        {metrics.contextWindowSize > 0 && (
          <span
            className="t-mono-xs"
            style={{ color: "var(--t3)", fontSize: 9 }}
          >
            of {formatTokens(metrics.contextWindowSize)}
          </span>
        )}
      </div>
    </div>
    <HudSep />
  </>
)}
```

Note: `formatTokens` is already imported from `../lib/cost` at line 2.

- [ ] **Step 4.4: Run TopBar tests**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp/dashboard
pnpm test --run src/components/__tests__/TopBar.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 4.5: Typecheck + full suite**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
cd dashboard && npx tsc --noEmit && pnpm test --run
```

Expected: 0 TS errors, ≥1235 passed

- [ ] **Step 4.6: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
git add dashboard/src/components/TopBar.tsx dashboard/src/components/__tests__/TopBar.test.tsx
git commit -m "feat: add context window size suffix to TopBar HUD"
```

---

## Self-Review

### Spec coverage
- GAP 1 (connection pill with latency): T1 + T2 ✓
- GAP 2 (usage meters in titlebar): T2 ✓
- GAP 3 (remove CONNECTION + USAGE from sidebar): T2 ✓
- GAP 4 (REPOS header + ⊞ toggle): T3 ✓
- GAP 5 (branch ✎ edit icon): Already present from previous session (&#x2387; glyph) — no additional work
- GAP 6 (context "of Nk" suffix): T4 ✓
- GAP 7 (YOLO badge accent): MODE_COLORS already has `bypassPermissions: { bg: "color-mix(in srgb, var(--red) 15%, transparent)", fg: "var(--red)" }` — already styled distinctly. TopBar test confirms it renders. ✓

### Placeholder scan
- No TBD, TODO, or placeholder text found.
- All code blocks show actual implementation.

### Type consistency
- `parsePongLatency(data: string, now: number): number | null` — consistent between definition and test.
- `wsLatency: number | null` — consistent between `UnifiedWebSocketState`, hook return, AppLayout destructuring, and Titlebar props.
- `onToggleTurnHistory?: () => void` — consistent between Props interface and AppLayout usage.
- `formatTokens(metrics.contextWindowSize)` — `contextWindowSize: number` from types.ts:241, `formatTokens(count: number)` from cost.ts:157. ✓

---

## Verification Command

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/ui-layout-revamp
pnpm lint && \
npx tsc --noEmit -p server/tsconfig.json && \
cd dashboard && npx tsc --noEmit && \
pnpm test --run
```

Expected: lint clean, 0 TS errors, ≥1235 dashboard tests pass.
