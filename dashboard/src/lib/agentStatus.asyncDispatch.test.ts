import { describe, it, expect } from "vitest";
import {
  isAgentCompleted,
  findTaskNotificationForToolUseId,
  findAgentCompletion,
} from "./agentStatus";
import { toolUseIdToSyntheticAgent } from "./agentIds";
import type { SessionEvent, AssistantEvent, UserEvent, QueueOperationEvent } from "./types";

const T_AGENT_USE_ID = "toolu_001";
const SYNTH = toolUseIdToSyntheticAgent(T_AGENT_USE_ID);

function asyncDispatchAssistant(ts: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    message: {
      role: "assistant",
      model: "claude-opus-4-7",
      id: `msg-${ts}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: [{
        type: "tool_use",
        id: T_AGENT_USE_ID,
        name: "Agent",
        input: { description: "do the thing", subagent_type: "engineer", run_in_background: true },
      }],
    },
  } as unknown as AssistantEvent;
}

function dispatchAckToolResult(ts: string): UserEvent {
  return {
    type: "user",
    uuid: `u-ack-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: T_AGENT_USE_ID,
        content: [{ type: "text", text: "Async agent launched successfully.\nagentId: abc123 (internal ID)\nThe agent is working in the background." }],
        is_error: false,
      }],
    },
  } as unknown as UserEvent;
}

function realToolResult(ts: string, isError = false): UserEvent {
  return {
    type: "user",
    uuid: `u-real-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: T_AGENT_USE_ID,
        content: [{ type: "text", text: "Subagent finished and wrote three files." }],
        is_error: isError,
      }],
    },
  } as unknown as UserEvent;
}

function taskNotificationQueueOp(ts: string): QueueOperationEvent {
  return {
    type: "queue-operation",
    uuid: `q-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    operation: "enqueue",
    content: `<task-notification>\n<task-id>abc123</task-id>\n<tool-use-id>${T_AGENT_USE_ID}</tool-use-id>\n<output-file>/tmp/out.json</output-file>\n</task-notification>`,
  } as unknown as QueueOperationEvent;
}

function taskNotificationUser(ts: string): UserEvent {
  return {
    type: "user",
    uuid: `u-notif-${ts}`,
    timestamp: ts,
    sessionId: "s1",
    userType: "external",
    message: {
      role: "user",
      content: `<task-notification>\n<task-id>abc123</task-id>\n<tool-use-id>${T_AGENT_USE_ID}</tool-use-id>\n</task-notification>`,
    },
  } as unknown as UserEvent;
}

describe("findTaskNotificationForToolUseId", () => {
  it("matches a queue-operation event with the right tool-use-id", () => {
    const evts: SessionEvent[] = [taskNotificationQueueOp("2026-05-16T12:14:36Z")];
    const r = findTaskNotificationForToolUseId(evts, T_AGENT_USE_ID);
    expect(r).not.toBeNull();
    expect(r!.timestamp).toBe("2026-05-16T12:14:36Z");
  });

  it("matches a user event with the same payload", () => {
    const evts: SessionEvent[] = [taskNotificationUser("2026-05-16T12:14:36Z")];
    const r = findTaskNotificationForToolUseId(evts, T_AGENT_USE_ID);
    expect(r).not.toBeNull();
  });

  it("does not match when the tool-use-id is different", () => {
    const evts: SessionEvent[] = [taskNotificationQueueOp("2026-05-16T12:14:36Z")];
    expect(findTaskNotificationForToolUseId(evts, "toolu_other")).toBeNull();
  });
});

describe("findAgentCompletion — async dispatch flow", () => {
  it("returns null when only the dispatch-ack tool_result is present (subagent still running)", () => {
    const evts: SessionEvent[] = [
      asyncDispatchAssistant("2026-05-16T12:07:51.736Z"),
      dispatchAckToolResult("2026-05-16T12:07:52.122Z"),
    ];
    expect(findAgentCompletion(evts, T_AGENT_USE_ID)).toBeNull();
  });

  it("returns notification timestamp once the task-notification arrives", () => {
    const evts: SessionEvent[] = [
      asyncDispatchAssistant("2026-05-16T12:07:51.736Z"),
      dispatchAckToolResult("2026-05-16T12:07:52.122Z"),
      taskNotificationQueueOp("2026-05-16T12:14:36.353Z"),
    ];
    const r = findAgentCompletion(evts, T_AGENT_USE_ID);
    expect(r).not.toBeNull();
    expect(r!.timestamp).toBe("2026-05-16T12:14:36.353Z");
    expect(r!.isError).toBe(false);
  });

  it("falls back to a non-ack tool_result (sync dispatch)", () => {
    const evts: SessionEvent[] = [
      asyncDispatchAssistant("2026-05-16T12:00:00Z"),
      realToolResult("2026-05-16T12:00:05Z"),
    ];
    const r = findAgentCompletion(evts, T_AGENT_USE_ID);
    expect(r).not.toBeNull();
    expect(r!.timestamp).toBe("2026-05-16T12:00:05Z");
  });

  it("non-ack tool_result with is_error: true is completion-with-error", () => {
    const evts: SessionEvent[] = [
      asyncDispatchAssistant("2026-05-16T12:00:00Z"),
      realToolResult("2026-05-16T12:00:05Z", true),
    ];
    const r = findAgentCompletion(evts, T_AGENT_USE_ID);
    expect(r).not.toBeNull();
    expect(r!.isError).toBe(true);
  });
});

describe("isAgentCompleted — synthetic agent post-fix", () => {
  it("dispatch + ack only → NOT completed (was wrongly completed before fix)", () => {
    const evts: SessionEvent[] = [
      asyncDispatchAssistant("2026-05-16T12:07:51.736Z"),
      dispatchAckToolResult("2026-05-16T12:07:52.122Z"),
    ];
    expect(isAgentCompleted(SYNTH, evts)).toBe(false);
  });

  it("dispatch + ack + task-notification → completed", () => {
    const evts: SessionEvent[] = [
      asyncDispatchAssistant("2026-05-16T12:07:51.736Z"),
      dispatchAckToolResult("2026-05-16T12:07:52.122Z"),
      taskNotificationQueueOp("2026-05-16T12:14:36.353Z"),
    ];
    expect(isAgentCompleted(SYNTH, evts)).toBe(true);
  });

  it("sync dispatch + non-ack tool_result → completed", () => {
    const evts: SessionEvent[] = [
      asyncDispatchAssistant("2026-05-16T12:00:00Z"),
      realToolResult("2026-05-16T12:00:05Z"),
    ];
    expect(isAgentCompleted(SYNTH, evts)).toBe(true);
  });
});
