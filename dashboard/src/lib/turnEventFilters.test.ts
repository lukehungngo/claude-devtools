import { describe, it, expect } from "vitest";
import { mainEventsOnly, eventsForAgent } from "./turnEventFilters";
import type { SessionEvent } from "./types";

// ─── Test helpers ────────────────────────────────────────────────────

/**
 * Build a minimal SessionEvent-compatible object for filter testing.
 * Only the fields read by the filters (type, isSidechain, agentId) plus the
 * base identity fields (uuid, timestamp, sessionId) are set; other required
 * fields are cast through `as SessionEvent`.
 */
function makeEvent(overrides: {
  uuid: string;
  isSidechain?: boolean;
  agentId?: string;
}): SessionEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid,
    timestamp: "2026-01-01T00:00:00Z",
    sessionId: "sess-1",
    ...(overrides.isSidechain !== undefined && { isSidechain: overrides.isSidechain }),
    ...(overrides.agentId !== undefined && { agentId: overrides.agentId }),
    message: {
      role: "assistant",
      content: [],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  } as SessionEvent;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("turnEventFilters", () => {
  it("T-FILTERS-1 mainEventsOnly excludes sidechain", () => {
    const events: SessionEvent[] = [
      makeEvent({ uuid: "m1" }),
      makeEvent({ uuid: "m2", isSidechain: false }),
      makeEvent({ uuid: "s1", isSidechain: true, agentId: "subA" }),
      makeEvent({ uuid: "m3" }),
      makeEvent({ uuid: "s2", isSidechain: true, agentId: "subB" }),
    ];

    const result = mainEventsOnly(events);

    expect(result).toHaveLength(3);
    expect(result.every((e) => !e.isSidechain)).toBe(true);
    expect(result.map((e) => e.uuid)).toEqual(["m1", "m2", "m3"]);
  });

  it('T-FILTERS-2 eventsForAgent("main") returns non-sidechain events only', () => {
    const events: SessionEvent[] = [
      makeEvent({ uuid: "m1" }),
      makeEvent({ uuid: "m2", isSidechain: false }),
      makeEvent({ uuid: "s1", isSidechain: true, agentId: "subA" }),
      makeEvent({ uuid: "m3" }),
      makeEvent({ uuid: "s2", isSidechain: true, agentId: "subB" }),
    ];

    const mainResult = eventsForAgent(events, "main");
    const mainOnlyResult = mainEventsOnly(events);

    expect(mainResult).toHaveLength(3);
    expect(mainResult.map((e) => e.uuid)).toEqual(["m1", "m2", "m3"]);
    // Identity/content match with mainEventsOnly
    expect(mainResult).toEqual(mainOnlyResult);
  });

  it("T-FILTERS-3 eventsForAgent(agentId) returns only events for that agent", () => {
    const events: SessionEvent[] = [
      makeEvent({ uuid: "m1" }),
      makeEvent({ uuid: "m2" }),
      makeEvent({ uuid: "a1", isSidechain: true, agentId: "subA" }),
      makeEvent({ uuid: "a2", isSidechain: true, agentId: "subA" }),
      makeEvent({ uuid: "b1", isSidechain: true, agentId: "subB" }),
    ];

    const subAResult = eventsForAgent(events, "subA");
    expect(subAResult).toHaveLength(2);
    expect(subAResult.every((e) => e.agentId === "subA")).toBe(true);
    expect(subAResult.map((e) => e.uuid)).toEqual(["a1", "a2"]);

    const subBResult = eventsForAgent(events, "subB");
    expect(subBResult).toHaveLength(1);
    expect(subBResult.every((e) => e.agentId === "subB")).toBe(true);
    expect(subBResult[0].uuid).toBe("b1");
  });

  it("T-FILTERS-4 helpers return a new array (no mutation)", () => {
    const input: SessionEvent[] = [
      makeEvent({ uuid: "m1" }),
      makeEvent({ uuid: "s1", isSidechain: true, agentId: "subA" }),
    ];
    const originalLength = input.length;

    const first = mainEventsOnly(input);
    const second = mainEventsOnly(input);

    expect(first).not.toBe(second);
    expect(first).not.toBe(input);
    expect(input).toHaveLength(originalLength);
  });

  it("T-FILTERS-5 empty input returns empty array", () => {
    expect(mainEventsOnly([])).toEqual([]);
    expect(mainEventsOnly([])).toHaveLength(0);
    expect(eventsForAgent([], "subA")).toEqual([]);
    expect(eventsForAgent([], "subA")).toHaveLength(0);
    expect(eventsForAgent([], "main")).toEqual([]);
  });
});
