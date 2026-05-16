/**
 * NEW-4 — MCP Status tab.
 *
 * Surfaces `query.mcpServerStatus()` per-server connection state.
 * Asserts the 5 status values render with distinct icons/styles,
 * failed servers show their error inline, and empty state renders
 * when no servers are configured.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MCPStatusTab } from "./MCPStatusTab";
import type { SessionEvent } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

type ServerFixture = {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled" | "configured";
  serverInfo?: { name: string; version: string };
  error?: string;
  config?: { type?: string; url?: string; command?: string };
  scope?: string;
};

function mockServersOnce(servers: ServerFixture[] | null, ok = true, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok,
    status,
    json: async () => ({ servers }),
  } as Response);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MCPStatusTab", () => {
  it("shows loading state before the fetch resolves", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}) as Promise<Response>);
    render(<MCPStatusTab sessionId="live-sess" />);
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it("renders a row for each of the 5 status values with a distinct icon", async () => {
    mockServersOnce([
      {
        name: "connected-srv",
        status: "connected",
        serverInfo: { name: "exa", version: "1.0.0" },
        scope: "user",
        config: { type: "http", url: "https://exa.example.com" },
      },
      {
        name: "failed-srv",
        status: "failed",
        error: "ECONNREFUSED",
        scope: "project",
        config: { type: "stdio" },
      },
      {
        name: "pending-srv",
        status: "pending",
        scope: "user",
        config: { type: "sse", url: "https://sse.example.com" },
      },
      {
        name: "auth-srv",
        status: "needs-auth",
        scope: "claudeai",
        config: { type: "claudeai-proxy", url: "https://claude.ai" },
      },
      {
        name: "off-srv",
        status: "disabled",
        scope: "local",
        config: { type: "stdio" },
      },
    ]);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByTestId("mcp-row-connected-srv")).toBeTruthy();
    });
    expect(screen.getByTestId("mcp-row-failed-srv")).toBeTruthy();
    expect(screen.getByTestId("mcp-row-pending-srv")).toBeTruthy();
    expect(screen.getByTestId("mcp-row-auth-srv")).toBeTruthy();
    expect(screen.getByTestId("mcp-row-off-srv")).toBeTruthy();

    // distinct icon test-ids (data-testid on the icon wrapper)
    expect(screen.getByTestId("mcp-icon-connected")).toBeTruthy();
    expect(screen.getByTestId("mcp-icon-failed")).toBeTruthy();
    expect(screen.getByTestId("mcp-icon-pending")).toBeTruthy();
    expect(screen.getByTestId("mcp-icon-needs-auth")).toBeTruthy();
    expect(screen.getByTestId("mcp-icon-disabled")).toBeTruthy();
  });

  it("shows error message inline for failed servers", async () => {
    mockServersOnce([
      {
        name: "broken",
        status: "failed",
        error: "ECONNREFUSED: connect failed at port 4001",
        scope: "project",
        config: { type: "stdio" },
      },
    ]);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByTestId("mcp-row-broken")).toBeTruthy();
    });
    expect(screen.getByText(/ECONNREFUSED: connect failed at port 4001/)).toBeTruthy();
  });

  it("renders the lock icon and label for needs-auth servers", async () => {
    mockServersOnce([
      {
        name: "claudeai",
        status: "needs-auth",
        scope: "claudeai",
        config: { type: "claudeai-proxy", url: "https://claude.ai" },
      },
    ]);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByTestId("mcp-icon-needs-auth")).toBeTruthy();
    });
  });

  it("renders empty state when servers list is empty", async () => {
    mockServersOnce([]);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByText(/no mcp servers/i)).toBeTruthy();
    });
  });

  it("renders empty state when servers payload is null (non-live session)", async () => {
    mockServersOnce(null);

    render(<MCPStatusTab sessionId="cold-sess" />);

    await waitFor(() => {
      expect(screen.getByText(/no mcp servers/i)).toBeTruthy();
    });
  });

  it("renders empty state when sessionId is omitted", async () => {
    render(<MCPStatusTab />);
    // No fetch fires; shows empty state immediately.
    expect(screen.getByText(/no mcp servers/i)).toBeTruthy();
  });

  it("shows server version and transport (config.type) for connected servers", async () => {
    mockServersOnce([
      {
        name: "exa",
        status: "connected",
        serverInfo: { name: "exa", version: "2.5.1" },
        scope: "user",
        config: { type: "http", url: "https://exa.example.com" },
      },
    ]);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByTestId("mcp-row-exa")).toBeTruthy();
    });
    expect(screen.getByText(/2\.5\.1/)).toBeTruthy();
    expect(screen.getByText(/http/)).toBeTruthy();
    expect(screen.getByText(/user/)).toBeTruthy();
  });

  it("re-fetches when the refresh button is clicked", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ servers: [] }),
      } as Response);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByText(/no mcp servers/i)).toBeTruthy();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // Bug F — disk-fallback "configured" rows for cold (CLI-launched) sessions.
  it("renders the configured-icon and a footer banner for cold-session 'configured' rows", async () => {
    mockServersOnce([
      {
        name: "claude-devtools",
        status: "configured",
        scope: "project",
        config: { type: "http", url: "http://localhost:5557/mcp" },
      },
      {
        name: "exa",
        status: "configured",
        scope: "project",
        config: { command: "exa-mcp" },
      },
    ]);

    render(<MCPStatusTab sessionId="cold-sess" />);

    await waitFor(() => {
      expect(screen.getByTestId("mcp-row-claude-devtools")).toBeTruthy();
    });
    expect(screen.getByTestId("mcp-row-exa")).toBeTruthy();
    // distinct icon for the new status
    expect(screen.getAllByTestId("mcp-icon-configured").length).toBeGreaterThanOrEqual(2);
    // footer banner clarifying live-status is unavailable
    expect(
      screen.getByText(/Live connection status only available for sessions started from the dashboard/i)
    ).toBeTruthy();
  });

  it("does NOT render the cold-session banner when all rows are live statuses", async () => {
    mockServersOnce([
      {
        name: "exa",
        status: "connected",
        serverInfo: { name: "exa", version: "1.0.0" },
        scope: "user",
        config: { type: "http", url: "https://exa.example.com" },
      },
    ]);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByTestId("mcp-row-exa")).toBeTruthy();
    });
    expect(
      screen.queryByText(/Live connection status only available/i)
    ).toBeNull();
  });

  it("shows error state on non-OK responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    } as Response);

    render(<MCPStatusTab sessionId="live-sess" />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load mcp/i)).toBeTruthy();
    });
  });
});

// ── Bug I — per-turn MCP tool-call surface ──────────────────────────
//
// MCP server status is session-scoped (one row per configured server). To
// answer "which mcp tools fired in T<N>", we additionally render a separate
// section below the server list, derived from the active turn's assistant
// events.

interface AssistantToolUseFixture {
  name: string;
}

/**
 * Build an assistant SessionEvent containing one or more mcp tool_use items.
 * Indices/timestamps are arbitrary — only `type`, `message.content`, and
 * `tool_use.name` matter for the per-turn derivation.
 */
function mkAssistantWithToolUses(
  ts: string,
  uses: AssistantToolUseFixture[],
): SessionEvent {
  return {
    type: "assistant",
    uuid: `evt-${ts}`,
    timestamp: ts,
    sessionId: "live-sess",
    agentId: "main",
    message: {
      id: `msg-${ts}`,
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: uses.map((u, i) => ({
        type: "tool_use" as const,
        id: `tu-${ts}-${i}`,
        name: u.name,
        input: {},
      })),
    },
  } as unknown as SessionEvent;
}

/**
 * Build a TurnSnapshot pointing at a slice of the events array. Only
 * `turnNumber`, `startIndex`, and `endIndex` are needed for `getEventsForTurn`
 * — the rest are filled with neutral defaults so the component never reads
 * stale aggregates.
 */
function mkTurn(turnNumber: number, startIndex: number, endIndex: number): TurnSnapshot {
  return {
    turnNumber,
    promptText: `T${turnNumber}`,
    startIndex,
    endIndex,
    agents: [],
    durationMs: null,
    cost: 0,
    costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
    inputTokens: 0,
    outputTokens: 0,
    startTime: `2026-01-01T00:0${turnNumber}:00Z`,
    endTime: `2026-01-01T00:0${turnNumber}:59Z`,
    dispatchedAgentIds: new Set<string>(["main"]),
    eventAgentIds: new Set<string>(["main"]),
  };
}

describe("MCPStatusTab per-turn MCP tool calls (Bug I)", () => {
  // Empty-servers mock so the per-turn section is the only visible thing.
  function mockEmptyServers(): void {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ servers: [] }),
    } as Response);
  }

  // Fixture: T1 fires mcp__claude-devtools__list-sessions ×2 + open-dashboard ×1
  //          T2 fires no mcp tools (just a non-mcp Bash tool_use)
  //          T3 fires mcp__other__doThing ×1
  function buildFixture(): { events: SessionEvent[]; turns: TurnSnapshot[] } {
    const events: SessionEvent[] = [
      // T1 — index 0,1
      mkAssistantWithToolUses("2026-01-01T00:01:00Z", [
        { name: "mcp__claude-devtools__list-sessions" },
        { name: "mcp__claude-devtools__list-sessions" },
      ]),
      mkAssistantWithToolUses("2026-01-01T00:01:30Z", [
        { name: "mcp__claude-devtools__open-dashboard" },
      ]),
      // T2 — index 2: only a non-mcp tool_use, must NOT count
      mkAssistantWithToolUses("2026-01-01T00:02:00Z", [{ name: "Bash" }]),
      // T3 — index 3
      mkAssistantWithToolUses("2026-01-01T00:03:00Z", [
        { name: "mcp__other__doThing" },
      ]),
    ];
    const turns: TurnSnapshot[] = [
      mkTurn(1, 0, 2),
      mkTurn(2, 2, 3),
      mkTurn(3, 3, 4),
    ];
    return { events, turns };
  }

  it("renders MCP tool calls for the active turn", async () => {
    mockEmptyServers();
    const { events, turns } = buildFixture();

    render(
      <MCPStatusTab
        sessionId="live-sess"
        events={events}
        turns={turns}
        activeTurnIndex={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mcp-turn-tool-calls")).toBeTruthy();
    });

    // Header includes the turn number.
    expect(screen.getByText(/MCP tool calls in T1/)).toBeTruthy();

    // Server row aggregates calls across both assistant events.
    const row = screen.getByTestId("mcp-turn-row-claude-devtools");
    expect(row).toBeTruthy();
    expect(row.textContent ?? "").toContain("3 calls");
    expect(row.textContent ?? "").toContain("list-sessions ×2");
    expect(row.textContent ?? "").toContain("open-dashboard ×1");
  });

  it("hides the section when active turn has no mcp calls", async () => {
    mockEmptyServers();
    const { events, turns } = buildFixture();

    render(
      <MCPStatusTab
        sessionId="live-sess"
        events={events}
        turns={turns}
        activeTurnIndex={1}
      />,
    );

    // Wait for the fetch resolution + render so we know the empty-servers
    // placeholder is on screen and any per-turn section had a chance to mount.
    await waitFor(() => {
      expect(screen.getByText(/no mcp servers/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("mcp-turn-tool-calls")).toBeNull();
  });

  it("re-derives when active turn changes", async () => {
    mockEmptyServers();
    const { events, turns } = buildFixture();

    const { rerender } = render(
      <MCPStatusTab
        sessionId="live-sess"
        events={events}
        turns={turns}
        activeTurnIndex={0}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mcp-turn-row-claude-devtools")).toBeTruthy();
    });

    rerender(
      <MCPStatusTab
        sessionId="live-sess"
        events={events}
        turns={turns}
        activeTurnIndex={2}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("mcp-turn-row-other")).toBeTruthy();
    });
    // T3 has no claude-devtools calls — that row must be gone.
    expect(screen.queryByTestId("mcp-turn-row-claude-devtools")).toBeNull();
    expect(screen.getByText(/MCP tool calls in T3/)).toBeTruthy();
    const row = screen.getByTestId("mcp-turn-row-other");
    expect(row.textContent ?? "").toContain("1 call");
    expect(row.textContent ?? "").toContain("doThing ×1");
  });

  it("hides the section when activeTurnIndex is null/undefined", async () => {
    mockEmptyServers();
    const { events, turns } = buildFixture();

    render(
      <MCPStatusTab
        sessionId="live-sess"
        events={events}
        turns={turns}
        activeTurnIndex={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/no mcp servers/i)).toBeTruthy();
    });
    expect(screen.queryByTestId("mcp-turn-tool-calls")).toBeNull();
  });
});
