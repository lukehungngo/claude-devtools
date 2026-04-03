import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentLogTab } from "./AgentLogTab";
import type { SessionEvent, AssistantEvent, SubagentMeta } from "../../lib/types";

afterEach(cleanup);

function makeAssistantEvent(
  overrides: Partial<AssistantEvent> = {},
): AssistantEvent {
  return {
    type: "assistant",
    uuid: crypto.randomUUID(),
    timestamp: "2026-04-01T10:00:00.000Z",
    sessionId: "sess-1",
    message: {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "Hello world" }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message" as const,
      stop_reason: "end_turn" as const,
      usage: { input_tokens: 100, output_tokens: 50 },
    },
    ...overrides,
  } as AssistantEvent;
}

describe("AgentLogTab", () => {
  it("renders without crashing with empty events", () => {
    render(<AgentLogTab allEvents={[]} />);
    expect(screen.getByText("Select a session to view agent timeline")).toBeTruthy();
  });

  it("renders events and shows Agents Log header", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main", timestamp: "2026-04-01T10:00:00.000Z" }),
    ];
    render(<AgentLogTab allEvents={events} />);
    expect(screen.getByText("Agent Timeline")).toBeTruthy();
  });

  it("passes subagentMeta through to AgentLogs", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "agent-abc", timestamp: "2026-04-01T10:00:00.000Z" }),
    ];
    const meta: SubagentMeta = {
      "agent-abc": { agentType: "researcher", description: "Research specialist" },
    };
    // Should not throw with subagentMeta
    render(<AgentLogTab allEvents={events} subagentMeta={meta} />);
    expect(screen.getByText("Agent Timeline")).toBeTruthy();
  });

  it("passes dag nodes through to AgentLogs", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({ agentId: "main" }),
    ];
    const dag = {
      nodes: [{ id: "main", type: "main", label: "main", status: "completed" as const, tokenUsage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0, totalCost: 0 }, toolCalls: 0, mcpToolCalls: 0, startTime: "2026-04-01T10:00:00.000Z" }],
      edges: [],
    };
    render(<AgentLogTab allEvents={events} dag={dag} />);
    expect(screen.getByText("1 agents")).toBeTruthy();
  });
});
