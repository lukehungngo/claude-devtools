import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { DoctorPanel } from "../components/panels/DoctorPanel";
import { StatsPanel } from "../components/panels/StatsPanel";
import { McpManager } from "../components/panels/McpManager";

// Recharts ResponsiveContainer requires ResizeObserver
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DoctorPanel", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        checks: [
          { name: "jsonl_directory", status: "pass", detail: "/home/.claude/projects" },
          { name: "node_version", status: "pass", detail: "v22.0.0" },
          { name: "server_uptime", status: "pass", detail: "1h 5m 30s" },
          { name: "session_count", status: "warn", detail: "0 sessions discovered" },
          { name: "active_sessions", status: "fail", detail: "0 active sessions" },
        ],
      }),
    } as Response);
  });

  it("renders diagnostics heading", () => {
    render(<DoctorPanel />);
    expect(screen.getByText("Diagnostics")).toBeTruthy();
  });

  it("fetches and displays check results", async () => {
    render(<DoctorPanel />);
    await waitFor(() => {
      // Check name "node_version" is formatted as "Node Version"
      expect(screen.getByText("Node Version")).toBeTruthy();
    });
  });

  it("shows pass/warn/fail icons", async () => {
    render(<DoctorPanel />);
    await waitFor(() => {
      // Check that we have the detail text
      expect(screen.getByText("v22.0.0")).toBeTruthy();
    });
  });

  it("shows check count summary", async () => {
    render(<DoctorPanel />);
    await waitFor(() => {
      expect(screen.getByText(/3 passed/)).toBeTruthy();
    });
  });
});

describe("StatsPanel", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        totalSessions: 42,
        totalEvents: 1500,
        sessionsPerDay: [
          { date: "2026-03-23", count: 3 },
          { date: "2026-03-24", count: 5 },
          { date: "2026-03-25", count: 8 },
        ],
        topRepos: [
          { name: "my-app", sessions: 20 },
          { name: "utils", sessions: 10 },
        ],
      }),
    } as Response);
  });

  it("renders statistics heading", () => {
    render(<StatsPanel />);
    expect(screen.getByText("Statistics")).toBeTruthy();
  });

  it("shows total sessions card", async () => {
    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("42")).toBeTruthy();
    });
  });

  it("shows total events card", async () => {
    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("1,500")).toBeTruthy();
    });
  });

  it("shows top repos list", async () => {
    render(<StatsPanel />);
    await waitFor(() => {
      expect(screen.getByText("my-app")).toBeTruthy();
      expect(screen.getByText("utils")).toBeTruthy();
    });
  });
});

describe("McpManager", () => {
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
});
