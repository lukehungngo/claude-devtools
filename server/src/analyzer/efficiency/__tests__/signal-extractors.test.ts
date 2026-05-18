import { describe, expect, it } from "vitest";
import {
  collectEditDecisions,
  collectToolSignals,
  estimateLocChanged,
  groupEfficiencyTurns,
} from "../signal-extractors.js";
import type { AssistantEvent, SystemEvent, UserEvent } from "../../../types.js";

function assistantTool(id: string, name: string, input: Record<string, unknown>): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:01.000Z",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input }],
      model: "claude-sonnet-4-6",
      id: `msg-${id}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 1000, output_tokens: 50 },
    },
  };
}

function toolResult(id: string, isError: boolean): UserEvent {
  return {
    type: "user",
    uuid: `u-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:02.000Z",
    userType: "internal",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: id, content: "result", is_error: isError }],
    },
  };
}

describe("signal extractors", () => {
  it("maps failed tool results back to tool names", () => {
    const signals = collectToolSignals([
      assistantTool("t1", "Bash", { command: "bad-command" }),
      toolResult("t1", true),
    ]);

    expect(signals.totalToolCalls).toBe(1);
    expect(signals.failedToolCalls).toBe(1);
    expect(signals.failuresByTool.get("Bash")).toBe(1);
  });

  it("estimates LOC changed from Edit and Write inputs", () => {
    const edit = estimateLocChanged("Edit", { old_string: "a\nb", new_string: "a\nc\nd" });
    const write = estimateLocChanged("Write", { content: "one\ntwo\nthree" });

    expect(edit).toBe(3);
    expect(write).toBe(3);
  });

  it("groups turns using external user prompts and turn_duration events", () => {
    const start: UserEvent = {
      type: "user",
      uuid: "u-start",
      sessionId: "s1",
      timestamp: "2026-05-18T00:00:00.000Z",
      userType: "external",
      message: { role: "user", content: "fix tests" },
    };
    const duration: SystemEvent = {
      type: "system",
      subtype: "turn_duration",
      uuid: "sys-1",
      sessionId: "s1",
      timestamp: "2026-05-18T00:01:05.000Z",
      durationMs: 65000,
    };

    const turns = groupEfficiencyTurns([start, assistantTool("t1", "Read", { file_path: "/tmp/a.ts" }), duration]);

    expect(turns).toHaveLength(1);
    expect(turns[0]!.durationMs).toBe(65000);
    expect(turns[0]!.inputTokens).toBe(1000);
  });

  it("counts permission_denied system events for edit-capable tools", () => {
    const denied = {
      type: "system",
      subtype: "permission_denied",
      uuid: "sys-denied",
      sessionId: "s1",
      timestamp: "2026-05-18T00:00:03.000Z",
      tool_name: "Edit",
      tool_use_id: "t1",
      message: "Tool call blocked",
    } as SystemEvent & Record<string, unknown>;

    const decisions = collectEditDecisions([denied]);

    expect(decisions.totalDecisions).toBe(1);
    expect(decisions.rejectedDecisions).toBe(1);
  });
});
