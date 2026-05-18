import { describe, expect, it } from "vitest";
import { detectLongTurnDurations } from "../long-turn-durations.js";
import type { AssistantEvent, SystemEvent, UserEvent } from "../../../types.js";
import type { SessionWithEvents } from "../types.js";

function user(i: number): UserEvent {
  return { type: "user", uuid: `u-${i}`, sessionId: "s1", timestamp: `2026-05-18T00:${String(i).padStart(2, "0")}:00.000Z`, userType: "external", message: { role: "user", content: "go" } };
}

function assistant(i: number): AssistantEvent {
  return { type: "assistant", uuid: `a-${i}`, sessionId: "s1", timestamp: `2026-05-18T00:${String(i).padStart(2, "0")}:01.000Z`, message: { role: "assistant", content: [{ type: "tool_use", id: `t${i}`, name: "Read", input: {} }], model: "claude-sonnet-4-6", id: `m${i}`, type: "message", stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } } };
}

function duration(i: number, durationMs: number): SystemEvent {
  return { type: "system", subtype: "turn_duration", uuid: `s-${i}`, sessionId: "s1", timestamp: `2026-05-18T00:${String(i).padStart(2, "0")}:02.000Z`, durationMs };
}

function session(events: SessionWithEvents["mainEvents"]): SessionWithEvents {
  return { info: { id: "s1", projectHash: "p", path: "/tmp/s1.jsonl", startTime: "", lastModified: "", eventCount: events.length, subagentCount: 0 }, mainEvents: events };
}

describe("detectLongTurnDurations", () => {
  it("warns when slow turn duration and long turn count are high", () => {
    const events = Array.from({ length: 6 }, (_, i) => [user(i), assistant(i), duration(i, 70_000)]).flat();

    const result = detectLongTurnDurations(session(events));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("warn");
    expect(result.impactValue).toBe("slow turns reached 1m 10s (6 turns over 1m)");
  });

  it("praises fast turns when there are enough tool calls", () => {
    const events = Array.from({ length: 20 }, (_, i) => [user(i), assistant(i), duration(i, 10_000)]).flat();

    expect(detectLongTurnDurations(session(events)).status).toBe("praise");
  });

  it("stays quiet without enough long turns", () => {
    expect(detectLongTurnDurations(session([user(1), assistant(1), duration(1, 70_000)])).detected).toBe(false);
  });
});
