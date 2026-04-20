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
});
