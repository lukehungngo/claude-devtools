/**
 * Tests for /cost and /usage command formatters (T2-02, T2-14)
 *
 * Verifies that:
 * - formatCostCommand returns a detailed multi-line breakdown when metrics are available
 * - formatCostCommand includes total cost, total tokens, per-model breakdown, and duration
 * - formatCostCommand returns a fallback message when metrics are null
 * - formatUsageCommand returns utilization info when usage is available
 * - formatUsageCommand shows 5h/7d utilization %, reset times, and plan name
 * - formatUsageCommand returns a fallback message when usage is null
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatCostCommand, formatUsageCommand, formatContextCommand, formatPermissionsCommand, formatDiffCommand, formatMcpCommand, formatTasksCommand, formatAnalyticsCommand } from "./commandFormatters";
import type { SessionMetrics, UsageInfo, ToolCallStat, CostSummary, TaskSummary } from "./types";

function makeMetrics(overrides?: Partial<SessionMetrics>): SessionMetrics {
  return {
    session: {
      id: "test-session",
      projectHash: "hash",
      path: "/tmp/test.jsonl",
      startTime: "2026-03-29T10:00:00Z",
      lastModified: "2026-03-29T10:05:00Z",
      eventCount: 50,
      subagentCount: 0,
    },
    dag: { nodes: [], edges: [] },
    tokens: {
      inputTokens: 150000,
      outputTokens: 25000,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.825,
    },
    tokensByModel: {
      "claude-sonnet-4-6": {
        inputTokens: 100000,
        outputTokens: 15000,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0.525,
      },
      "claude-opus-4-6": {
        inputTokens: 50000,
        outputTokens: 10000,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 1.5,
      },
    },
    tokensByTurn: [],
    tools: [],
    totalEvents: 50,
    totalToolCalls: 10,
    totalAgents: 1,
    models: ["claude-sonnet-4-6", "claude-opus-4-6"],
    duration: 300000, // 5 minutes
    contextPercent: 42,
    contextWindowSize: 200000,
    tasks: { total: 0, completed: 0, inProgress: 0, pending: 0 },
    hasRemoteControl: false,
    ...overrides,
  };
}

describe("formatCostCommand", () => {
  it("returns a detailed multi-line breakdown when metrics are available", () => {
    const metrics = makeMetrics();
    const output = formatCostCommand(metrics);

    // Should contain total cost
    expect(output).toContain("$0.825");
    // Should contain total tokens
    expect(output).toContain("150K");
    expect(output).toContain("25K");
    // Should contain duration
    expect(output).toContain("5m");
  });

  it("includes per-model breakdown", () => {
    const metrics = makeMetrics();
    const output = formatCostCommand(metrics);

    // Should show both models
    expect(output).toContain("sonnet");
    expect(output).toContain("opus");
    // Should show per-model costs
    expect(output).toContain("$0.525");
    expect(output).toContain("$1.50");
  });

  it("returns fallback message when metrics are null", () => {
    const output = formatCostCommand(null);
    expect(output).toContain("No session data");
  });

  it("handles single model sessions", () => {
    const metrics = makeMetrics({
      tokensByModel: {
        "claude-sonnet-4-6": {
          inputTokens: 100000,
          outputTokens: 15000,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0.525,
        },
      },
      models: ["claude-sonnet-4-6"],
    });
    const output = formatCostCommand(metrics);

    expect(output).toContain("sonnet");
    expect(output).not.toContain("opus");
  });

  it("handles zero-cost sessions", () => {
    const metrics = makeMetrics({
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        totalCost: 0,
      },
      tokensByModel: {},
      models: [],
      duration: 0,
    });
    const output = formatCostCommand(metrics);

    expect(output).toContain("$0.0000");
  });
});

describe("formatUsageCommand", () => {
  it("returns utilization info when usage is available", () => {
    const usage: UsageInfo = {
      fiveHour: { utilization: 0.45, resetsAt: "2026-03-29T15:00:00Z" },
      sevenDay: { utilization: 0.12, resetsAt: "2026-04-05T00:00:00Z" },
      planName: "Pro",
    };
    const output = formatUsageCommand(usage);

    expect(output).toContain("45%");
    expect(output).toContain("12%");
    expect(output).toContain("Pro");
    expect(output).toContain("5-hour");
    expect(output).toContain("7-day");
  });

  it("shows reset times", () => {
    const usage: UsageInfo = {
      fiveHour: { utilization: 0.80, resetsAt: "2026-03-29T15:00:00Z" },
      sevenDay: { utilization: 0.50, resetsAt: "2026-04-05T00:00:00Z" },
      planName: "Max",
    };
    const output = formatUsageCommand(usage);

    expect(output).toContain("resets");
  });

  it("returns fallback message when usage is null", () => {
    const output = formatUsageCommand(null);
    expect(output).toContain("No usage data");
  });

  it("handles null utilization values gracefully", () => {
    const usage: UsageInfo = {
      fiveHour: { utilization: null, resetsAt: null },
      sevenDay: { utilization: null, resetsAt: null },
      planName: null,
    };
    const output = formatUsageCommand(usage);

    // Should not crash, should show something reasonable
    expect(output).toContain("5-hour");
    expect(output).toContain("7-day");
  });

  it("handles null plan name", () => {
    const usage: UsageInfo = {
      fiveHour: { utilization: 0.30, resetsAt: "2026-03-29T15:00:00Z" },
      sevenDay: { utilization: 0.10, resetsAt: "2026-04-05T00:00:00Z" },
      planName: null,
    };
    const output = formatUsageCommand(usage);

    // Should not crash, should not show "null"
    expect(output).not.toContain("null");
  });
});

describe("formatContextCommand", () => {
  it("shows context percentage and window size when metrics available", () => {
    const metrics = makeMetrics({ contextPercent: 42, contextWindowSize: 200000 });
    const output = formatContextCommand(metrics);

    expect(output).toContain("42%");
    expect(output).toContain("200K");
  });

  it("shows estimated tokens used", () => {
    const metrics = makeMetrics({ contextPercent: 50, contextWindowSize: 200000 });
    const output = formatContextCommand(metrics);

    // 50% of 200K = 100K tokens used
    expect(output).toContain("100K");
  });

  it("shows green status for low usage (<70%)", () => {
    const metrics = makeMetrics({ contextPercent: 42 });
    const output = formatContextCommand(metrics);

    expect(output).toContain("OK");
  });

  it("shows yellow/warning status for medium usage (70-90%)", () => {
    const metrics = makeMetrics({ contextPercent: 75 });
    const output = formatContextCommand(metrics);

    expect(output).toContain("WARNING");
  });

  it("shows red/critical status for high usage (>90%)", () => {
    const metrics = makeMetrics({ contextPercent: 95 });
    const output = formatContextCommand(metrics);

    expect(output).toContain("CRITICAL");
  });

  it("returns fallback message when metrics are null", () => {
    const output = formatContextCommand(null);
    expect(output).toContain("No session data");
  });
});

describe("formatPermissionsCommand", () => {
  it("shows mode and allowances when data available", () => {
    const output = formatPermissionsCommand({
      mode: "default",
      allowances: ["Bash", "Write"],
      pendingCount: 0,
    });

    expect(output).toContain("default");
    expect(output).toContain("Bash");
    expect(output).toContain("Write");
  });

  it("shows pending count when there are pending permissions", () => {
    const output = formatPermissionsCommand({
      mode: "default",
      allowances: [],
      pendingCount: 3,
    });

    expect(output).toContain("3");
    expect(output).toContain("pending");
  });

  it("shows 'none' when no allowances", () => {
    const output = formatPermissionsCommand({
      mode: "plan",
      allowances: [],
      pendingCount: 0,
    });

    expect(output).toContain("none");
  });

  it("returns fallback message when data is null", () => {
    const output = formatPermissionsCommand(null);
    expect(output).toContain("No permission data");
  });
});

describe("formatDiffCommand", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch;
  });

  it("fetches git-diff endpoint and returns output", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ diff: " src/index.ts | 5 ++---\n 1 file changed\n" }),
    });

    const result = await formatDiffCommand("projHash", "sess1");

    expect(mockFetch).toHaveBeenCalledWith("/api/sessions/projHash/sess1/git-diff");
    expect(result).toContain("src/index.ts");
  });

  it("returns 'No uncommitted changes' when diff is empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ diff: "" }),
    });

    const result = await formatDiffCommand("projHash", "sess1");

    expect(result).toBe("No uncommitted changes.");
  });

  it("returns error message when no session info", async () => {
    const result = await formatDiffCommand(undefined, undefined);

    expect(result).toBe("No session selected.");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns error on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("network error"));

    const result = await formatDiffCommand("projHash", "sess1");

    expect(result).toBe("Failed to fetch git diff.");
  });
});

describe("formatMcpCommand", () => {
  it("groups tools by MCP server and shows counts", () => {
    const tools: ToolCallStat[] = [
      { name: "mcp__fs__read", count: 5, errors: 0, isMcp: true, mcpServer: "filesystem" },
      { name: "mcp__fs__write", count: 3, errors: 0, isMcp: true, mcpServer: "filesystem" },
      { name: "mcp__gh__pr", count: 2, errors: 0, isMcp: true, mcpServer: "github" },
      { name: "Read", count: 10, errors: 0, isMcp: false },
    ];

    const metrics = makeMetrics({ tools });
    const result = formatMcpCommand(metrics);

    expect(result).toContain("filesystem");
    expect(result).toContain("2 tools");
    expect(result).toContain("github");
    expect(result).toContain("1 tool");
    // Non-MCP tools should not appear
    expect(result).not.toContain(": Read");
  });

  it("returns 'No MCP servers connected' when no MCP tools", () => {
    const tools: ToolCallStat[] = [
      { name: "Read", count: 10, errors: 0, isMcp: false },
    ];

    const metrics = makeMetrics({ tools });
    const result = formatMcpCommand(metrics);

    expect(result).toBe("No MCP servers connected.");
  });

  it("returns 'No MCP servers connected' when metrics is null", () => {
    const result = formatMcpCommand(null);

    expect(result).toBe("No MCP servers connected.");
  });
});

describe("formatTasksCommand", () => {
  it("shows task summary when tasks exist", () => {
    const tasks: TaskSummary = { total: 5, completed: 3, inProgress: 1, pending: 1 };
    const metrics = makeMetrics({ tasks });
    const result = formatTasksCommand(metrics);

    expect(result).toContain("3/5");
    expect(result).toContain("3 completed");
    expect(result).toContain("1 in progress");
    expect(result).toContain("1 pending");
  });

  it("returns 'No tasks' when total is 0", () => {
    const tasks: TaskSummary = { total: 0, completed: 0, inProgress: 0, pending: 0 };
    const metrics = makeMetrics({ tasks });
    const result = formatTasksCommand(metrics);

    expect(result).toContain("No tasks");
  });

  it("returns fallback message when metrics is null", () => {
    const result = formatTasksCommand(null);
    expect(result).toContain("No session data");
  });
});

describe("formatAnalyticsCommand", () => {
  it("shows session counts, costs, tokens, and avg cost", () => {
    const costs: CostSummary = {
      cost24h: 5.25,
      cost7d: 18.50,
      sessionCount24h: 10,
      sessionCount7d: 35,
      tokenIn24h: 500000,
      tokenOut24h: 100000,
      tokenIn7d: 2000000,
      tokenOut7d: 400000,
    };
    const result = formatAnalyticsCommand(costs);

    expect(result).toContain("10 sessions (24h)");
    expect(result).toContain("35 sessions (7d)");
    expect(result).toContain("$5.25");
    expect(result).toContain("$18.50");
    expect(result).toContain("500K");
    expect(result).toContain("100K");
    expect(result).toContain("$0.525");
  });

  it("shows $0.00 avg when no sessions in 24h", () => {
    const costs: CostSummary = {
      cost24h: 0,
      cost7d: 5.0,
      sessionCount24h: 0,
      sessionCount7d: 5,
      tokenIn24h: 0,
      tokenOut24h: 0,
      tokenIn7d: 1000000,
      tokenOut7d: 200000,
    };
    const result = formatAnalyticsCommand(costs);

    expect(result).toContain("$0.00");
    expect(result).toContain("0 sessions (24h)");
  });

  it("returns fallback message when costs is null", () => {
    const result = formatAnalyticsCommand(null);
    expect(result).toContain("No analytics data");
  });
});
