import { describe, expect, it } from "vitest";
import { detectCostPerLocOutlier } from "../cost-per-loc-outlier.js";
import type { AssistantEvent } from "../../../types.js";
import type { SessionWithEvents } from "../types.js";

function assistant(costTokens: number, content: unknown): AssistantEvent {
  return {
    type: "assistant",
    uuid: `a-${costTokens}`,
    sessionId: "s1",
    timestamp: "2026-05-18T00:00:00.000Z",
    message: {
      role: "assistant",
      content: content as AssistantEvent["message"]["content"],
      model: "claude-opus-4-1",
      id: "msg",
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: costTokens, output_tokens: costTokens },
    },
  };
}

function session(events: AssistantEvent[]): SessionWithEvents {
  return { info: { id: "s1", projectHash: "p", path: "/tmp/s1.jsonl", startTime: "", lastModified: "", eventCount: events.length, subagentCount: 0 }, mainEvents: events };
}

describe("detectCostPerLocOutlier", () => {
  it("warns when cost per estimated LOC is high", () => {
    const result = detectCostPerLocOutlier(session([
      assistant(300_000, [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "/tmp/a.ts", content: Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n") } }]),
    ]));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("warn");
    expect(result.impactValue).toMatch(/estimated \$\d+\.\d{2} per LOC changed/);
  });

  it("praises when cost per estimated LOC is low", () => {
    const result = detectCostPerLocOutlier(session([
      assistant(1_000, [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "/tmp/a.ts", content: Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n") } }]),
    ]));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("praise");
  });

  it("ignores non-code file writes", () => {
    const result = detectCostPerLocOutlier(session([
      assistant(300_000, [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "/tmp/a.md", content: "one\ntwo\nthree" } }]),
    ]));

    expect(result.detected).toBe(false);
  });
});
