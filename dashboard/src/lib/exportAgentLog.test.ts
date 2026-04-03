import { describe, it, expect } from "vitest";
import { buildExportPayload } from "./exportAgentLog";

describe("buildExportPayload", () => {
  it("returns structured JSON with entries and groups", () => {
    const entries = [
      {
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        agentId: "main",
        agentType: "main",
        message: "hello",
        toolName: null,
        isError: false,
        cost: 0.1,
      },
    ];
    const groups = [
      {
        agentId: "main",
        agentType: "main",
        depth: 0,
        entries,
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-01T00:00:05Z",
        durationMs: 5000,
        cost: 0.1,
      },
    ];

    const result = buildExportPayload(entries, groups);
    const parsed = JSON.parse(result);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.totalEntries).toBe(1);
    expect(parsed.totalGroups).toBe(1);
  });

  it("includes rawMessage when present", () => {
    const entries = [
      {
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        agentId: "main",
        agentType: "main",
        message: "short",
        rawMessage: "full long message content here",
        toolName: "Read",
        isError: false,
        cost: 0,
      },
    ];

    const result = buildExportPayload(entries, []);
    const parsed = JSON.parse(result);
    expect(parsed.entries[0].rawMessage).toBe("full long message content here");
  });
});
