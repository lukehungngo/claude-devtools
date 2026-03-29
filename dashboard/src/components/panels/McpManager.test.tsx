import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { McpManager } from "./McpManager";

afterEach(cleanup);

describe("McpManager: prop-based rendering (backward compat)", () => {
  it("renders MCP servers heading", () => {
    render(<McpManager servers={[]} />);
    expect(screen.getByText("MCP Servers")).toBeTruthy();
  });

  it("shows empty state when no servers", () => {
    render(<McpManager servers={[]} />);
    expect(screen.getByText(/No MCP servers/)).toBeTruthy();
  });

  it("renders server cards with name and command", () => {
    render(
      <McpManager
        servers={[
          { name: "filesystem", command: "npx", args: ["-y", "@mcp/filesystem"], status: "configured", toolCount: 12 },
          { name: "github", command: "gh", args: ["mcp-server"], status: "configured", toolCount: 8 },
        ]}
      />
    );
    expect(screen.getByText("filesystem")).toBeTruthy();
    expect(screen.getByText("github")).toBeTruthy();
  });

  it("shows tool count for each server", () => {
    render(
      <McpManager
        servers={[
          { name: "filesystem", command: "npx", args: ["-y", "@mcp/filesystem"], status: "configured", toolCount: 12 },
        ]}
      />
    );
    expect(screen.getByText(/12 tools/)).toBeTruthy();
  });

  it("does not show toggle/reconnect without sessionId", () => {
    render(
      <McpManager
        servers={[
          { name: "filesystem", command: "npx", args: [], status: "configured", toolCount: 5 },
        ]}
      />
    );
    // No toggle or reconnect buttons when sessionId is not provided
    expect(screen.queryByText("Enabled")).toBeNull();
    expect(screen.queryByText("Reconnect")).toBeNull();
  });
});

describe("McpManager: session-aware mode", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: [
          { name: "test-server", command: "node", args: ["server.js"], status: "connected", toolCount: 5, enabled: true },
        ],
        source: "sdk",
      }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches MCP status from session endpoint when sessionId is provided", async () => {
    render(<McpManager sessionId="test-session-123" />);

    await waitFor(() => {
      expect(screen.getByText("test-server")).toBeTruthy();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions/test-session-123/mcp/status");
  });

  it("shows live badge when source is sdk", async () => {
    render(<McpManager sessionId="test-session-123" />);

    await waitFor(() => {
      expect(screen.getByText("live")).toBeTruthy();
    });
  });

  it("shows toggle and reconnect buttons for live source", async () => {
    render(<McpManager sessionId="test-session-123" />);

    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeTruthy();
      expect(screen.getByText("Reconnect")).toBeTruthy();
    });
  });

  it("calls toggle endpoint when toggle button is clicked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    // Initial fetch returns sdk source
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: [
          { name: "test-server", command: "node", args: ["server.js"], status: "connected", toolCount: 5, enabled: true },
        ],
        source: "sdk",
      }),
    } as Response);

    render(<McpManager sessionId="test-session-123" />);

    await waitFor(() => {
      expect(screen.getByText("Enabled")).toBeTruthy();
    });

    const toggleBtn = screen.getByLabelText("Toggle test-server off");
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      const calls = fetchSpy.mock.calls;
      const toggleCall = calls.find((c) => (c[0] as string).includes("/mcp/toggle"));
      expect(toggleCall).toBeTruthy();
    });
  });

  it("calls reconnect endpoint when reconnect button is clicked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: [
          { name: "test-server", command: "node", args: ["server.js"], status: "connected", toolCount: 5, enabled: true },
        ],
        source: "sdk",
      }),
    } as Response);

    render(<McpManager sessionId="test-session-123" />);

    await waitFor(() => {
      expect(screen.getByText("Reconnect")).toBeTruthy();
    });

    const reconnectBtn = screen.getByLabelText("Reconnect test-server");
    fireEvent.click(reconnectBtn);

    await waitFor(() => {
      const calls = fetchSpy.mock.calls;
      const reconnectCall = calls.find((c) => (c[0] as string).includes("/mcp/reconnect"));
      expect(reconnectCall).toBeTruthy();
    });
  });

  it("shows 'Active session required' message for static source with sessionId", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: [
          { name: "test-server", command: "node", args: ["server.js"], status: "configured", toolCount: 0 },
        ],
        source: "settings",
      }),
    } as Response);

    render(<McpManager sessionId="test-session-123" />);

    await waitFor(() => {
      expect(screen.getByText(/Active session required/)).toBeTruthy();
    });
  });
});
