import { describe, expect, it } from "vitest";
import { detectHighContextDurationTax } from "../high-context-duration-tax.js";
import type { AssistantEvent, SystemEvent, UserEvent } from "../../../types.js";
import type { SessionWithEvents } from "../types.js";

function turn(i: number, inputTokens: number, durationMs: number): [UserEvent, AssistantEvent, SystemEvent] {
  return [
    { type: "user", uuid: `u-${i}`, sessionId: "s1", timestamp: `2026-05-18T00:${String(i).padStart(2, "0")}:00.000Z`, userType: "external", message: { role: "user", content: "go" } },
    { type: "assistant", uuid: `a-${i}`, sessionId: "s1", timestamp: `2026-05-18T00:${String(i).padStart(2, "0")}:01.000Z`, message: { role: "assistant", content: "ok", model: "claude-sonnet-4-6", id: `m${i}`, type: "message", stop_reason: "end_turn", usage: { input_tokens: inputTokens, output_tokens: 1 } } },
    { type: "system", subtype: "turn_duration", uuid: `s-${i}`, sessionId: "s1", timestamp: `2026-05-18T00:${String(i).padStart(2, "0")}:02.000Z`, durationMs },
  ];
}

function session(events: SessionWithEvents["mainEvents"]): SessionWithEvents {
  return { info: { id: "s1", projectHash: "p", path: "/tmp/s1.jsonl", startTime: "", lastModified: "", eventCount: events.length, subagentCount: 0 }, mainEvents: events };
}

describe("detectHighContextDurationTax", () => {
  it("warns when high-context turns are much slower", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => turn(i, 160_000, 90_000)).flat(),
      ...Array.from({ length: 5 }, (_, i) => turn(i + 5, 20_000, 30_000)).flat(),
    ];

    const result = detectHighContextDurationTax(session(events));

    expect(result.detected).toBe(true);
    expect(result.status).toBe("warn");
    expect(result.impactValue).toBe("high-context turns were 3.0x slower");
  });

  it("praises low context tax with enough high-context turns", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => turn(i, 160_000, 30_000)).flat(),
      ...Array.from({ length: 5 }, (_, i) => turn(i + 5, 20_000, 28_000)).flat(),
    ];

    expect(detectHighContextDurationTax(session(events)).status).toBe("praise");
  });

  it("stays quiet without both comparison buckets", () => {
    const events = Array.from({ length: 5 }, (_, i) => turn(i, 160_000, 90_000)).flat();

    expect(detectHighContextDurationTax(session(events)).detected).toBe(false);
  });
});
