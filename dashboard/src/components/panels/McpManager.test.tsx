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

describe("McpManager: add/remove operations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows Add Server button", () => {
    render(<McpManager servers={[]} />);
    expect(screen.getByText("Add Server")).toBeTruthy();
  });

  it("shows add form when Add Server is clicked", () => {
    render(<McpManager servers={[]} />);
    fireEvent.click(screen.getByText("Add Server"));
    expect(screen.getByLabelText("Server name")).toBeTruthy();
    expect(screen.getByLabelText("Command")).toBeTruthy();
  });

  it("hides add form when cancel is clicked", () => {
    render(<McpManager servers={[]} />);
    fireEvent.click(screen.getByText("Add Server"));
    fireEvent.click(screen.getByLabelText("Cancel add server"));
    expect(screen.queryByLabelText("Server name")).toBeNull();
  });

  it("calls POST /api/mcp/servers on form submit", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, server: { name: "new-srv", command: "cmd", args: [] } }),
    } as Response);

    render(<McpManager servers={[]} />);
    fireEvent.click(screen.getByText("Add Server"));

    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "new-srv" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "npx" } });
    fireEvent.change(screen.getByLabelText("Arguments"), { target: { value: "-y, @mcp/test" } });

    // Submit the form
    const submitBtn = screen.getAllByText("Add Server").find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        (c) => c[0] === "/api/mcp/servers" && (c[1] as RequestInit)?.method === "POST"
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.name).toBe("new-srv");
      expect(body.command).toBe("npx");
      expect(body.args).toEqual(["-y", "@mcp/test"]);
    });
  });

  it("shows Remove button per server", () => {
    render(
      <McpManager
        servers={[
          { name: "fs-server", command: "npx", args: [], status: "configured", toolCount: 5 },
        ]}
      />
    );
    expect(screen.getByLabelText("Remove fs-server")).toBeTruthy();
  });

  it("shows confirmation dialog on Remove click", () => {
    render(
      <McpManager
        servers={[
          { name: "fs-server", command: "npx", args: [], status: "configured", toolCount: 5 },
        ]}
      />
    );
    fireEvent.click(screen.getByLabelText("Remove fs-server"));
    expect(screen.getByText("Remove?")).toBeTruthy();
    expect(screen.getByLabelText("Confirm remove fs-server")).toBeTruthy();
  });

  it("calls DELETE /api/mcp/servers/:name on confirm", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    render(
      <McpManager
        servers={[
          { name: "fs-server", command: "npx", args: [], status: "configured", toolCount: 5 },
        ]}
      />
    );

    fireEvent.click(screen.getByLabelText("Remove fs-server"));
    fireEvent.click(screen.getByLabelText("Confirm remove fs-server"));

    await waitFor(() => {
      const deleteCall = fetchSpy.mock.calls.find(
        (c) => (c[0] as string).includes("/api/mcp/servers/fs-server") && (c[1] as RequestInit)?.method === "DELETE"
      );
      expect(deleteCall).toBeTruthy();
    });
  });

  it("cancels removal when No is clicked", () => {
    render(
      <McpManager
        servers={[
          { name: "fs-server", command: "npx", args: [], status: "configured", toolCount: 5 },
        ]}
      />
    );
    fireEvent.click(screen.getByLabelText("Remove fs-server"));
    fireEvent.click(screen.getByLabelText("Cancel remove"));
    expect(screen.queryByText("Remove?")).toBeNull();
  });

  it("displays error message from server on add failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server \"dup\" already exists" }),
    } as Response);

    render(<McpManager servers={[]} />);
    fireEvent.click(screen.getByText("Add Server"));
    fireEvent.change(screen.getByLabelText("Server name"), { target: { value: "dup" } });
    fireEvent.change(screen.getByLabelText("Command"), { target: { value: "cmd" } });

    const submitBtn = screen.getAllByText("Add Server").find(
      (el) => el.tagName === "BUTTON" && el.getAttribute("type") === "submit"
    );
    fireEvent.click(submitBtn!);

    await waitFor(() => {
      expect(screen.getByText(/already exists/)).toBeTruthy();
    });
  });
});
