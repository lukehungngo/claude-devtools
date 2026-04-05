import { describe, it, expect } from "vitest";
import { computeTimeline } from "./TraceTab";
import type { AgentNode, AgentDAG } from "../../lib/types";

function makeNode(overrides: Partial<AgentNode> & { id: string }): AgentNode {
  return {
    type: "agent",
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0,
    },
    toolCalls: 0,
    mcpToolCalls: 0,
    status: "completed",
    ...overrides,
  };
}

describe("TraceTab duration scoping bugs", () => {
  describe("Bug 1: computeTimeline uses all node timestamps instead of main node bounds", () => {
    it("should use main node turn-scoped times as timeline bounds, not child node times", () => {
      // Scenario: Turn T41 took 21.4 seconds, but a child node has
      // session-wide timestamps spanning 4+ hours
      const turnStart = "2026-04-06T10:00:00.000Z";
      const turnEnd = "2026-04-06T10:00:21.400Z"; // 21.4s later

      // Child node has session-wide (unscoped) timestamps — 4 hours earlier
      const sessionStart = "2026-04-06T05:35:00.000Z";
      const sessionEnd = "2026-04-06T10:00:21.400Z"; // ~4h25m span

      const nodes: AgentNode[] = [
        makeNode({
          id: "main",
          startTime: turnStart,
          endTime: turnEnd,
        }),
        makeNode({
          id: "child-1",
          parentId: "main",
          startTime: sessionStart, // unscoped: 4+ hours before turn
          endTime: sessionEnd,
        }),
      ];

      const timeline = computeTimeline(nodes);

      // Timeline should be ~21.4s (the turn scope), NOT ~4h25m
      expect(timeline.totalMs).toBeLessThan(30_000); // less than 30s
      expect(timeline.totalMs).toBeGreaterThanOrEqual(21_000); // at least 21s
    });
  });

  describe("Bug 2: buildRow uses totalMs for root instead of node times", () => {
    // We test this indirectly via buildTraceGroups which is not exported,
    // but the computeTimeline fix above ensures totalMs is correct,
    // and we need to also verify the root node duration calculation.
    // We'll test computeTimeline returns correct totalMs so that even
    // if buildRow uses totalMs, the value is turn-scoped.
    it("should scope timeline totalMs to main node bounds even with far-flung children", () => {
      const turnStart = "2026-04-06T12:00:00.000Z";
      const turnEnd = "2026-04-06T12:00:10.000Z"; // 10s turn

      const nodes: AgentNode[] = [
        makeNode({
          id: "main",
          startTime: turnStart,
          endTime: turnEnd,
        }),
        makeNode({
          id: "child-a",
          parentId: "main",
          startTime: "2026-04-06T08:00:00.000Z", // 4h before turn
          endTime: "2026-04-06T08:05:00.000Z",
        }),
        makeNode({
          id: "child-b",
          parentId: "main",
          startTime: "2026-04-06T12:00:02.000Z",
          endTime: "2026-04-06T12:00:08.000Z",
        }),
      ];

      const timeline = computeTimeline(nodes);

      // Should be 10s, not 4+ hours
      expect(timeline.totalMs).toBe(10_000);
      expect(timeline.sessionStartMs).toBe(
        new Date(turnStart).getTime(),
      );
      expect(timeline.sessionEndMs).toBe(
        new Date(turnEnd).getTime(),
      );
    });
  });
});
