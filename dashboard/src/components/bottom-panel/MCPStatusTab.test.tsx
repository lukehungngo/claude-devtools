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

type ServerFixture = {
  name: string;
  status: "connected" | "failed" | "needs-auth" | "pending" | "disabled";
  serverInfo?: { name: string; version: string };
  error?: string;
  config?: { type: string; url?: string };
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
