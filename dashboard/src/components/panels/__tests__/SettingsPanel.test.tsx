import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SettingsPanel } from "../SettingsPanel";
import type { SessionMetrics, UsageInfo } from "../../../lib/types";

function makeMetrics(overrides?: Partial<SessionMetrics>): SessionMetrics {
  return {
    session: {
      id: "s1",
      projectHash: "ph1",
      path: "/path",
      startTime: "2026-01-01T00:00:00Z",
      lastModified: "2026-01-01T01:00:00Z",
      eventCount: 100,
      subagentCount: 2,
      cwd: "/Users/test/project",
      gitBranch: "main",
      permissionMode: "default",
      model: "claude-opus-4-6",
    },
    dag: { nodes: [], edges: [] },
    tokens: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.05,
    },
    tokensByModel: {},
    tokensByTurn: [],
    tools: [],
    totalEvents: 100,
    totalToolCalls: 10,
    totalAgents: 2,
    models: ["claude-opus-4-6"],
    duration: 3600,
    permissionMode: "default",
    contextPercent: 52,
    contextWindowSize: 200000,
    tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
    hasRemoteControl: false,
    repoConfig: { hooks: 4, rules: 5, agents: 2, claudeMdFiles: 3 },
    ...overrides,
  };
}

function mockFetchResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default fetch mock for EditableSettings
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/settings")) {
        return mockFetchResponse({}) as Promise<Response>;
      }
      if (typeof url === "string" && url.includes("/models")) {
        return mockFetchResponse({ models: [] }) as Promise<Response>;
      }
      return mockFetchResponse({}) as Promise<Response>;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders placeholder when no metrics provided", () => {
    render(<SettingsPanel metrics={null} usage={null} />);
    expect(screen.getByText("Select a session to view settings")).toBeTruthy();
  });

  it("renders session section with model name", async () => {
    render(<SettingsPanel metrics={makeMetrics()} usage={null} />);
    expect(screen.getByText("claude-opus-4-6")).toBeTruthy();
  });

  it("renders permission mode", () => {
    const { container } = render(<SettingsPanel metrics={makeMetrics()} usage={null} />);
    expect(container.textContent).toContain("default");
  });

  it("renders working directory", () => {
    const { container } = render(<SettingsPanel metrics={makeMetrics()} usage={null} />);
    expect(container.textContent).toContain("Working Directory");
    expect(container.textContent).toContain("/Users/test/project");
  });

  it("renders context window percentage", () => {
    const { container } = render(<SettingsPanel metrics={makeMetrics()} usage={null} />);
    expect(container.textContent).toContain("Context Window");
    expect(container.textContent).toContain("52%");
  });

  it("renders configuration counts from repoConfig", () => {
    const { container } = render(<SettingsPanel metrics={makeMetrics()} usage={null} />);
    expect(container.textContent).toContain("CLAUDE.md Files");
    expect(container.textContent).toContain("3");
    expect(container.textContent).toContain("Rules");
    expect(container.textContent).toContain("Hooks");
  });

  it("renders usage info when available", () => {
    const usage: UsageInfo = {
      fiveHour: { utilization: 0.62, resetsAt: null },
      sevenDay: { utilization: 0.38, resetsAt: null },
      planName: "Max (5x)",
    };
    render(<SettingsPanel metrics={makeMetrics()} usage={usage} />);
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByText("Max (5x)")).toBeTruthy();
  });

  it("shows dashes for missing optional fields", () => {
    const metrics = makeMetrics({
      models: [],
      repoConfig: undefined,
    });
    const { container } = render(<SettingsPanel metrics={metrics} usage={null} />);
    expect(container.textContent).toContain("--");
  });
});

describe("SettingsPanel - Editable Settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders model, effort, and permission mode dropdowns", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url === "/api/settings") {
        return mockFetchResponse({ model: "claude-opus-4-6", effort: "high" }) as Promise<Response>;
      }
      return mockFetchResponse({ models: [] }) as Promise<Response>;
    });

    render(<SettingsPanel metrics={makeMetrics()} usage={null} />);

    await waitFor(() => {
      const modelSelect = screen.getByLabelText("Model") as HTMLSelectElement;
      expect(modelSelect).toBeTruthy();
    });

    expect(screen.getByLabelText("Effort")).toBeTruthy();
    expect(screen.getByLabelText("Permission Mode")).toBeTruthy();
  });

  it("enables save button when a field is changed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url === "/api/settings") {
        return mockFetchResponse({}) as Promise<Response>;
      }
      return mockFetchResponse({ models: [] }) as Promise<Response>;
    });

    render(<SettingsPanel metrics={makeMetrics()} usage={null} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Effort")).toBeTruthy();
    });

    const effortSelect = screen.getByLabelText("Effort") as HTMLSelectElement;
    fireEvent.change(effortSelect, { target: { value: "high" } });

    const saveButton = screen.getByText("Save Settings");
    expect(saveButton.closest("button")?.disabled).toBe(false);
  });

  it("calls PUT /api/settings on save", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockImplementation((url) => {
      if (typeof url === "string" && url === "/api/settings") {
        return mockFetchResponse({}) as Promise<Response>;
      }
      return mockFetchResponse({ models: [] }) as Promise<Response>;
    });

    render(<SettingsPanel metrics={makeMetrics()} usage={null} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Effort")).toBeTruthy();
    });

    // Change effort
    fireEvent.change(screen.getByLabelText("Effort"), { target: { value: "low" } });

    // Mock the PUT response
    fetchSpy.mockImplementation(() =>
      mockFetchResponse({ success: true }) as Promise<Response>,
    );

    fireEvent.click(screen.getByText("Save Settings"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/settings",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });
});
