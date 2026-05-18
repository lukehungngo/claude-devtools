import { describe, expect, it } from "vitest";
import { detectToolFailureStorm } from "../tool-failure-storm.js";
import type { AssistantEvent, UserEvent } from "../../../types.js";
import type { SessionWithEvents } from "../types.js";

function tool(id: string, name = "Bash"): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name, input: {} }],
      model: "claude-sonnet-4-6",
      id: `msg-${id}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
}

function result(id: string, isError: boolean): UserEvent {
  return {
    type: "user",
    uuid: `u-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:01.000Z",
    userType: "internal",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "", is_error: isError }] },
  };
}

function session(events: SessionWithEvents["mainEvents"]): SessionWithEvents {
  return { info: { id: "s1", projectHash: "p", path: "/tmp/s1.jsonl", startTime: "", lastModified: "", eventCount: events.length, subagentCount: 0 }, mainEvents: events };
}

describe("detectToolFailureStorm", () => {
  it("warns when tool failure rate is high", () => {
    const events = Array.from({ length: 20 }, (_, i) => [tool(`t${i}`), result(`t${i}`, i < 3)]).flat();

    const detected = detectToolFailureStorm(session(events));

    expect(detected.detected).toBe(true);
    expect(detected.status).toBe("warn");
    expect(detected.impactValue).toBe("3 of 20 tool calls failed");
  });

  it("praises low failure rate with enough tool calls", () => {
    const events = Array.from({ length: 20 }, (_, i) => [tool(`t${i}`), result(`t${i}`, false)]).flat();

    expect(detectToolFailureStorm(session(events)).status).toBe("praise");
  });

  it("stays quiet without enough tool calls", () => {
    expect(detectToolFailureStorm(session([tool("t1"), result("t1", true)])).detected).toBe(false);
  });
});
