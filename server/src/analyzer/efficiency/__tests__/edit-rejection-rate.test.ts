import { describe, expect, it } from "vitest";
import { detectEditRejectionRate } from "../edit-rejection-rate.js";
import type { AssistantEvent, SystemEvent } from "../../../types.js";
import type { SessionWithEvents } from "../types.js";

function editTool(id: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:00.000Z",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id, name: "Edit", input: { file_path: "/tmp/a.ts", old_string: "a", new_string: "b" } }],
      model: "claude-sonnet-4-6",
      id: `msg-${id}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  };
}

function denial(id: string): SystemEvent & Record<string, unknown> {
  return {
    type: "system",
    subtype: "permission_denied",
    uuid: `sys-${id}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:01.000Z",
    tool_name: "Edit",
    tool_use_id: id,
  };
}

function session(events: SessionWithEvents["mainEvents"]): SessionWithEvents {
  return { info: { id: "s1", projectHash: "p", path: "/tmp/s1.jsonl", startTime: "", lastModified: "", eventCount: events.length, subagentCount: 0 }, mainEvents: events };
}

describe("detectEditRejectionRate", () => {
  it("warns when more than 20% of edit decisions are rejected", () => {
    const result = detectEditRejectionRate(session([editTool("t1"), editTool("t2"), editTool("t3"), editTool("t4"), editTool("t5"), denial("t1"), denial("t2")]));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("warn");
    expect(result.impactValue).toBe("2 of 5 proposed edits rejected");
  });

  it("praises low rejection rate with enough decisions", () => {
    const result = detectEditRejectionRate(session([editTool("t1"), editTool("t2"), editTool("t3"), editTool("t4"), editTool("t5")]));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("praise");
  });

  it("stays quiet without enough decisions", () => {
    const result = detectEditRejectionRate(session([editTool("t1"), denial("t1")]));

    expect(result.detected).toBe(false);
  });
});
