import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("SettingsPanel", () => {
  it("renders placeholder when no metrics provided", () => {
    render(<SettingsPanel metrics={null} usage={null} />);
    expect(screen.getByText("Select a session to view settings")).toBeTruthy();
  });

  it("renders session section with model name", () => {
    render(<SettingsPanel metrics={makeMetrics()} usage={null} />);
    expect(screen.getByText("Model")).toBeTruthy();
    expect(screen.getByText("claude-opus-4-6")).toBeTruthy();
  });

  it("renders permission mode", () => {
    const { container } = render(<SettingsPanel metrics={makeMetrics()} usage={null} />);
    expect(container.textContent).toContain("Permission Mode");
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
    // Model should show "--" when models array is empty, repoConfig fields too
    expect(container.textContent).toContain("--");
  });
});
