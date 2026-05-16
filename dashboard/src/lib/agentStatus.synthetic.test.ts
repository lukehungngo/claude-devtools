import { describe, it, expect } from "vitest";
import { isAgentCompleted, findToolResultForId } from "./agentStatus";
import { toolUseIdToSyntheticAgent } from "./agentIds";
import type { SessionEvent, AssistantEvent, UserEvent } from "./types";

function mainAssistantDispatch(toolUseId: string, ts: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: `asst-${toolUseId}`,
    timestamp: ts,
    sessionId: "s1",
    message: {
      role: "assistant",
      model: "claude-sonnet-4-6",
      id: `msg-${toolUseId}`,
      type: "message",
      stop_reason: "tool_use",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      content: [
        {
          type: "tool_use",
          id: toolUseId,
          name: "Agent",
          input: { description: "subagent task", subagent_type: "engineer", prompt: "do thing" },
        },
      ],
    },
  } as unknown as AssistantEvent;
}

function userToolResult(toolUseId: string, ts: string, isError = false): UserEvent {
  return {
    type: "user",
    uuid: `user-${toolUseId}`,
    timestamp: ts,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: "result",
          is_error: isError,
        },
      ],
    },
  } as unknown as UserEvent;
}

describe("isAgentCompleted — synthetic agents (Phase 3)", () => {
  it("F1 — dispatch with matching tool_result: completed", () => {
    const events: SessionEvent[] = [
      mainAssistantDispatch("t1", "2026-05-16T10:00:00Z"),
      userToolResult("t1", "2026-05-16T10:01:00Z"),
    ];
    expect(isAgentCompleted(toolUseIdToSyntheticAgent("t1"), events)).toBe(true);
  });

  it("F2 — dispatch without tool_result: not completed", () => {
    const events: SessionEvent[] = [
      mainAssistantDispatch("t1", "2026-05-16T10:00:00Z"),
    ];
    expect(isAgentCompleted(toolUseIdToSyntheticAgent("t1"), events)).toBe(false);
  });

  it("F7 — tool_result.is_error: still completed (terminal state)", () => {
    const events: SessionEvent[] = [
      mainAssistantDispatch("t1", "2026-05-16T10:00:00Z"),
      userToolResult("t1", "2026-05-16T10:01:00Z", true),
    ];
    expect(isAgentCompleted(toolUseIdToSyntheticAgent("t1"), events)).toBe(true);
  });

  it("findToolResultForId returns timestamp + isError", () => {
    const events: SessionEvent[] = [
      mainAssistantDispatch("t1", "2026-05-16T10:00:00Z"),
      userToolResult("t1", "2026-05-16T10:01:00Z", true),
    ];
    const r = findToolResultForId(events, "t1");
    expect(r).not.toBeNull();
    expect(r!.timestamp).toBe("2026-05-16T10:01:00Z");
    expect(r!.isError).toBe(true);
  });

  it("findToolResultForId returns null when no match", () => {
    const events: SessionEvent[] = [
      mainAssistantDispatch("t1", "2026-05-16T10:00:00Z"),
    ];
    expect(findToolResultForId(events, "t1")).toBeNull();
  });

  it("synthetic id with invalid suffix returns false", () => {
    expect(isAgentCompleted("synthetic:agent:", [])).toBe(false);
  });
});
