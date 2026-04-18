/**
 * Reproduction test for AppLayout.tsx:357 bug:
 * AppLayout passes session.isRunning to TurnHistoryPanel instead of session.isActive.
 *
 * Scenario: a JSONL session where isRunning=false (quiet >2 min) but isActive=true
 * (JSONL file modified within 12 hours). Before the fix, TurnHistoryPanel receives
 * sessionIsRunning=false and shows "indeterminate" — dishonest. After the fix,
 * TurnHistoryPanel receives sessionIsRunning=true (from isActive) and shows "running".
 *
 * This test mocks TurnHistoryPanel to capture the sessionIsRunning prop value that
 * AppLayout passes, allowing us to verify AppLayout reads from the correct field.
 */
import React, { useContext, useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { SessionMetrics, SessionInfo } from "../lib/types";
import { LayoutContext } from "../contexts/LayoutContext";

// ─── Capture the prop AppLayout passes to TurnHistoryPanel ───────────────────

let capturedSessionIsRunning: boolean | undefined = undefined;

vi.mock("../components/TurnHistoryPanel", () => ({
  TurnHistoryPanel: (props: { sessionIsRunning?: boolean }) => {
    capturedSessionIsRunning = props.sessionIsRunning;
    return null;
  },
}));

// ─── Mock all the hooks AppLayout depends on ─────────────────────────────────

vi.mock("../hooks/useRepos", () => ({
  useRepos: () => ({ repos: [], loading: false, refresh: vi.fn() }),
}));

vi.mock("../hooks/usePermissions", () => ({
  usePermissions: () => ({
    permissions: [],
    decide: vi.fn(),
    decideSession: vi.fn(),
    handlePermissionRequest: vi.fn(),
    handlePermissionResolved: vi.fn(),
  }),
}));

vi.mock("../hooks/useUsage", () => ({
  useUsage: () => ({ usage: null }),
}));

vi.mock("../hooks/useCosts", () => ({
  useCosts: () => ({ costs: null }),
}));

vi.mock("../hooks/useUnifiedWebSocket", () => ({
  useUnifiedWebSocket: () => ({ isConnected: false, wsLatency: null }),
}));

// ─── Probe component to capture and invoke setCurrentMetrics ─────────────────

let globalSetCurrentMetrics: ((m: SessionMetrics | null) => void) | null = null;

function MetricsProbe() {
  const ctx = useContext(LayoutContext);
  useEffect(() => {
    if (ctx) {
      globalSetCurrentMetrics = ctx.setCurrentMetrics;
    }
  });
  return null;
}

// ─── Mock child components that require router context or complex setup ───────

vi.mock("../components/Layout", () => ({
  Layout: (props: {
    titlebar?: React.ReactNode;
    topBar?: React.ReactNode;
    sidebar?: React.ReactNode;
    turnHistory?: React.ReactNode;
    center?: React.ReactNode;
    bottomPanel?: React.ReactNode;
    sidebarCollapsed?: boolean;
    onToggleSidebar?: () => void;
  }) => {
    // Render the turnHistory slot so our TurnHistoryPanel mock is mounted,
    // and render MetricsProbe inside the layout context.
    return (
      <div data-testid="layout">
        <MetricsProbe />
        {props.turnHistory}
      </div>
    );
  },
}));

vi.mock("../components/Titlebar", () => ({
  Titlebar: () => null,
}));

vi.mock("../components/TopBar", () => ({
  TopBar: () => null,
}));

vi.mock("../components/RepoList", () => ({
  RepoList: () => null,
}));

vi.mock("../components/ProfileDrawer", () => ({
  ProfileDrawer: () => null,
}));

vi.mock("../components/bottom-panel/BottomPanel", () => ({
  BottomPanel: () => null,
}));

// Mock tanstack router (AppLayout uses useNavigate and renders <Outlet />)
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Outlet: MetricsProbe, // Renders MetricsProbe in center slot to capture context
}));

// ─── Import AppLayout after mocks are in place ────────────────────────────────

import { AppLayout } from "../routes/AppLayout";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSessionInfo(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "sess-001",
    projectHash: "abc123",
    path: "/home/user/.claude/projects/abc123/sess-001.jsonl",
    startTime: new Date(Date.now() - 3_600_000).toISOString(),
    lastModified: new Date(Date.now() - 3_000).toISOString(),
    eventCount: 10,
    subagentCount: 0,
    isActive: true,
    isRunning: false,
    ...overrides,
  };
}

const ZERO_TOKENS = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0,
};

function makeMetrics(session: SessionInfo): SessionMetrics {
  return {
    session,
    dag: { nodes: [], edges: [] },
    tokens: ZERO_TOKENS,
    tokensByModel: {},
    tokensByTurn: [],
    tools: [],
    totalEvents: 10,
    totalToolCalls: 0,
    totalAgents: 1,
    models: [],
    duration: 3600,
    contextPercent: 0,
    contextWindowSize: 200000,
    tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
    hasRemoteControl: false,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedSessionIsRunning = undefined;
  globalSetCurrentMetrics = null;
  vi.stubGlobal("fetch", vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ repos: [] }) })
  ));
  vi.stubGlobal("WebSocket", vi.fn(() => ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    send: vi.fn(),
  })));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppLayout.tsx:357 — sessionIsRunning wiring", () => {
  it("BUG REPRODUCTION: passes session.isActive (not session.isRunning) to TurnHistoryPanel", async () => {
    // Session: isRunning=false (quiet >2 min), isActive=true (within 12 hours)
    // Before the fix: AppLayout reads session.isRunning → passes false → panel shows indeterminate
    // After the fix: AppLayout reads session.isActive → passes true → panel shows running
    const session = makeSessionInfo({ isRunning: false, isActive: true });
    const metrics = makeMetrics(session);

    await act(async () => {
      render(<AppLayout />);
    });

    // Inject metrics via the context (simulates SessionPage loading a session)
    await act(async () => {
      globalSetCurrentMetrics?.(metrics);
    });

    // BEFORE fix: capturedSessionIsRunning = false (from session.isRunning)
    // AFTER fix:  capturedSessionIsRunning = true  (from session.isActive)
    //
    // This assertion FAILS before AppLayout.tsx:357 is fixed.
    expect(capturedSessionIsRunning).toBe(true);
  });

  it("null metrics: sessionIsRunning is undefined (panel treats as active by convention)", async () => {
    await act(async () => {
      render(<AppLayout />);
    });

    // With null metrics, currentMetrics?.session?.isActive is undefined
    // TurnHistoryPanel treats undefined as "active" (preserves legacy behavior)
    expect(capturedSessionIsRunning).toBeUndefined();
  });

  it("session with isActive=false: sessionIsRunning correctly propagated as false", async () => {
    // Closed session: both isRunning and isActive are false (old session from days ago)
    const session = makeSessionInfo({ isRunning: false, isActive: false });
    const metrics = makeMetrics(session);

    await act(async () => {
      render(<AppLayout />);
    });

    await act(async () => {
      globalSetCurrentMetrics?.(metrics);
    });

    // After fix: AppLayout passes isActive (false) → panel shows indeterminate correctly
    expect(capturedSessionIsRunning).toBe(false);
  });
});
