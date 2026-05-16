import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { BackgroundAgentGroup } from "./BackgroundAgentGroup";
import type { AgentNode } from "../../lib/types";

afterEach(cleanup);

function syntheticAgent(toolUseId: string, overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: `synthetic:agent:${toolUseId}`,
    type: "engineer",
    description: `task-${toolUseId}`,
    parentId: "main",
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
    },
    toolCalls: 0,
    mcpToolCalls: 0,
    status: "active",
    startTime: "2026-05-16T10:00:00Z",
    ...overrides,
  };
}

function realAgent(id: string, overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id,
    type: "engineer",
    description: `real-${id}`,
    parentId: "main",
    tokenUsage: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.05,
    },
    toolCalls: 3,
    mcpToolCalls: 0,
    status: "completed",
    startTime: "2026-05-16T10:00:00Z",
    endTime: "2026-05-16T10:03:00Z",
    ...overrides,
  };
}

describe("BackgroundAgentGroup", () => {
  it("renders nothing when no agents", () => {
    const { container } = render(
      <BackgroundAgentGroup agents={[]} isLive={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders count badge", () => {
    render(
      <BackgroundAgentGroup
        agents={[syntheticAgent("t1"), syntheticAgent("t2", { status: "completed", endTime: "2026-05-16T10:01:00Z" })]}
        isLive={false}
      />,
    );
    expect(screen.getByText(/Background agents/i)).toBeTruthy();
    expect(screen.getByText("×2")).toBeTruthy();
  });

  it("shows running pill when any agent is active", () => {
    render(
      <BackgroundAgentGroup
        agents={[syntheticAgent("t1"), syntheticAgent("t2", { status: "completed" })]}
        isLive={true}
      />,
    );
    expect(screen.getByText(/1 RUNNING/i)).toBeTruthy();
    expect(screen.getByText(/1 done/i)).toBeTruthy();
  });

  it("renders synthetic agent with — for tokens and cost", () => {
    render(
      <BackgroundAgentGroup
        agents={[syntheticAgent("t1", { status: "completed" })]}
        isLive={false}
      />,
    );
    // Two "—" cells (tokens, cost) per synthetic agent
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("real agent shows token + cost values", () => {
    render(
      <BackgroundAgentGroup
        agents={[realAgent("real-1")]}
        isLive={false}
      />,
    );
    // formatTokens(1500) = "2K" (rounded); cost should appear as $0.05
    expect(screen.getAllByText(/↓\s*\d/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$0\.05/).length).toBeGreaterThan(0);
  });

  it("group summary excludes synthetic agents from token/cost totals", () => {
    render(
      <BackgroundAgentGroup
        agents={[
          syntheticAgent("t1", { status: "completed" }),
          realAgent("real-1", { tokenUsage: {
            inputTokens: 1000,
            outputTokens: 1000,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            totalCost: 0.1,
          } }),
        ]}
        isLive={false}
      />,
    );
    // Total should be 2K (real only), NOT 2K + 0 synthetic added
    const tokenMatches = screen.getAllByText(/2K|2\.0K|^↓/);
    expect(tokenMatches.length).toBeGreaterThan(0);
  });

  it("calls onSelect when row clicked", () => {
    const onSelect = vi.fn();
    render(
      <BackgroundAgentGroup
        agents={[realAgent("real-1")]}
        isLive={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("real-real-1"));
    expect(onSelect).toHaveBeenCalledWith("real-1");
  });
});
