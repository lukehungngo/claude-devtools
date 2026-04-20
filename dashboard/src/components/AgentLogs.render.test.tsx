/**
 * TASK-2: Render-based tests for AgentLogs agent group header redesign.
 *
 * These tests verify that the agent group header renders with the new
 * bg-s surface background and data-testid attribute.
 *
 * Uses a mock for @tanstack/react-virtual to avoid jsdom dimension issues.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { SessionEvent, AssistantEvent, AgentNode } from "../lib/types";

// Mock useVirtualizer to return a controlled set of items so the
// agent-header row is rendered in jsdom (which has zero scroll dimensions).
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: {
    count: number;
    getScrollElement: () => HTMLElement | null;
    estimateSize: (i: number) => number;
    overscan?: number;
  }) => {
    const count = opts.count;
    const items = Array.from({ length: count }, (_, i) => ({
      key: i,
      index: i,
      start: i * 28,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * 28,
      measureElement: () => {},
      scrollToIndex: () => {},
    };
  },
}));

// Dynamically import AgentLogs AFTER mock is hoisted by vi.mock.
// Use a lazy import inside each test to pick up the mock.
import { AgentLogs } from "./AgentLogs";

afterEach(cleanup);

function makeAssistantEvent(overrides: Partial<AssistantEvent> = {}): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid ?? "a-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp ?? "2026-03-23T10:00:00Z",
    sessionId: "s1",
    ...overrides,
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      model: "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeAgent(id: string, type: string): AgentNode {
  return {
    id,
    type,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
    },
    toolCalls: 0,
    mcpToolCalls: 0,
    status: "completed",
  };
}

describe("TASK-2: AgentLogs agent group header redesign", () => {
  it("renders agent group header with data-testid and var(--bg-s) background", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const agents: AgentNode[] = [makeAgent("main", "main")];

    const { container } = render(
      <AgentLogs
        events={events}
        agents={agents}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={() => {}}
      />,
    );

    const header = container.querySelector("[data-testid='agent-group-header']");
    expect(header).not.toBeNull();
    const style = header!.getAttribute("style") ?? "";
    expect(style).toContain("var(--bg-s)");
  });

  it("agent group header uses dispatch color (var(--resp-dispatch)) for depth-0 agent name", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const agents: AgentNode[] = [makeAgent("main", "main")];

    const { container } = render(
      <AgentLogs
        events={events}
        agents={agents}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={() => {}}
      />,
    );

    const header = container.querySelector("[data-testid='agent-group-header']");
    expect(header).not.toBeNull();
    // The agent name span should have dispatch color
    const nameSpan = header!.querySelector("span[style*='resp-dispatch']");
    expect(nameSpan).not.toBeNull();
  });

  it("subagent (depth > 0) name uses var(--resp-tool) purple color", () => {
    const parent = makeAgent("main", "main");
    const child: AgentNode = { ...makeAgent("sub-1", "general-purpose"), parentId: "main" };
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main", uuid: "e1" }),
      makeAssistantEvent({ agentId: "sub-1", uuid: "e2", timestamp: "2026-03-23T10:01:00Z" }),
    ];

    const { container } = render(
      <AgentLogs
        events={events}
        agents={[parent, child]}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={() => {}}
      />,
    );

    const headers = container.querySelectorAll("[data-testid='agent-group-header']");
    // Should have 2 headers: main agent and subagent
    expect(headers.length).toBe(2);
    // The subagent header (second one) should have var(--resp-tool) on name span
    const subagentHeader = headers[1];
    const nameSpan = subagentHeader.querySelector("span[style*='resp-tool']");
    expect(nameSpan).not.toBeNull();
  });
});

describe("TASK-3: AgentLogs panel header and filter bar redesign", () => {
  it("panel header has h-[30px] class and shows 'Agent Log' text (not 'Agent Timeline')", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const agents: AgentNode[] = [makeAgent("main", "main")];

    const { container, queryByText } = render(
      <AgentLogs
        events={events}
        agents={agents}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={() => {}}
      />,
    );

    // New header should have h-[30px] class
    const header = container.querySelector(".h-\\[30px\\]");
    expect(header).not.toBeNull();

    // New header text should be 'Agent Log', not 'Agent Timeline'
    expect(queryByText(/Agent Log/)).not.toBeNull();
    expect(queryByText(/Agent Timeline/)).toBeNull();
  });

  it("panel header shows agent count badge with number only (not 'N agents')", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const agents: AgentNode[] = [makeAgent("main", "main"), makeAgent("sub-1", "general-purpose")];

    const { queryByText } = render(
      <AgentLogs
        events={events}
        agents={agents}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={() => {}}
      />,
    );

    // Badge shows count only, no "N agents" text
    expect(queryByText("2 agents")).toBeNull();
    expect(queryByText("2")).not.toBeNull();
  });

  it("filter bar 'All' tab active state uses bg-dt-bg0, not rounded-full or bg-dt-accent-dim", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const agents: AgentNode[] = [makeAgent("main", "main")];

    const { getByText } = render(
      <AgentLogs
        events={events}
        agents={agents}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={() => {}}
      />,
    );

    const allButton = getByText("All");
    expect(allButton.tagName).toBe("BUTTON");
    // Active tab should use bg-dt-bg0
    expect(allButton.className).toContain("bg-dt-bg0");
    // Should NOT use old rounded-full pill style
    expect(allButton.className).not.toContain("rounded-full");
    // Should NOT use old accent-dim active style
    expect(allButton.className).not.toContain("bg-dt-accent-dim");
  });

  it("filter bar buttons use rounded-[3px], not rounded-full", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const agents: AgentNode[] = [makeAgent("main", "main")];

    const { getByText } = render(
      <AgentLogs
        events={events}
        agents={agents}
        selectedAgent={null}
        toolFilter={null}
        onSelectAgent={() => {}}
      />,
    );

    const allButton = getByText("All");
    expect(allButton.className).toContain("rounded-[3px]");
    expect(allButton.className).not.toContain("rounded-full");
  });
});
