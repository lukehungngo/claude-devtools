import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo } from "../types.js";

vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(() => ({ events: [], newOffset: 0 })),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(() => ({ size: 1000 })) };
});

import { statSync } from "node:fs";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import {
  scanToolMilestones,
  resetMilestoneCacheForTesting,
} from "./tool-milestone-scanner.js";

const mockedStat = vi.mocked(statSync);
const mockedParse = vi.mocked(parseJsonlIncremental);

let sizeCounter = 0;

function makeSession(
  id: string,
  startTime: string,
  cwd = "/repo"
): SessionInfo {
  return {
    id,
    projectHash: "abc",
    path: `/fake/${id}.jsonl`,
    startTime,
    lastModified: startTime,
    eventCount: 1,
    subagentCount: 0,
    cwd,
  };
}

function makeMcpToolUseEvent(toolName: string, sessionId: string) {
  return {
    type: "assistant" as const,
    uuid: `uuid-${toolName}-${Math.random()}`,
    timestamp: "2026-04-10T10:00:00Z",
    sessionId,
    message: {
      role: "assistant" as const,
      content: [
        {
          type: "tool_use" as const,
          id: `id-${Math.random()}`,
          name: toolName,
          input: {},
        },
      ],
      model: "claude-sonnet-4-6",
      id: "m1",
      type: "message" as const,
      stop_reason: "tool_use" as const,
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sizeCounter = 0;
  resetMilestoneCacheForTesting();
  mockedStat.mockImplementation(
    () => ({ size: ++sizeCounter * 100 }) as ReturnType<typeof statSync>
  );
  mockedParse.mockReturnValue({ events: [], newOffset: 100 });
});

describe("scanToolMilestones", () => {
  it("returns empty array for no sessions", () => {
    const result = scanToolMilestones([]);
    expect(result).toEqual([]);
  });

  it("returns empty array when sessions have no MCP tool calls", () => {
    mockedParse.mockReturnValue({
      events: [
        makeMcpToolUseEvent("Read", "s1"),
        makeMcpToolUseEvent("Write", "s1"),
      ],
      newOffset: 200,
    });

    const result = scanToolMilestones([makeSession("s1", "2026-04-10T10:00:00Z")]);
    expect(result).toEqual([]);
  });

  it("extracts server name from mcp__<server>__<tool> pattern", () => {
    mockedParse.mockReturnValue({
      events: [makeMcpToolUseEvent("mcp__token-savior__compress", "s1")],
      newOffset: 200,
    });

    const result = scanToolMilestones([makeSession("s1", "2026-04-10T10:00:00Z")]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("token-savior");
  });

  it("uses session startTime as date for firstSeen and lastSeen", () => {
    mockedParse.mockReturnValue({
      events: [makeMcpToolUseEvent("mcp__claude-mem__store", "s1")],
      newOffset: 200,
    });

    const result = scanToolMilestones([makeSession("s1", "2026-04-10T10:00:00Z")]);
    expect(result[0].firstSeen).toBe("2026-04-10");
    expect(result[0].lastSeen).toBe("2026-04-10");
  });

  it("groups multiple sessions by server name", () => {
    const sessions = [
      makeSession("s1", "2026-04-10T10:00:00Z"),
      makeSession("s2", "2026-04-15T10:00:00Z"),
    ];

    mockedParse
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__token-savior__compress", "s1")],
        newOffset: 200,
      })
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__token-savior__expand", "s2")],
        newOffset: 200,
      });

    const result = scanToolMilestones(sessions);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("token-savior");
  });

  it("firstSeen is the earliest session date", () => {
    const sessions = [
      makeSession("s1", "2026-04-10T10:00:00Z"),
      makeSession("s2", "2026-04-15T10:00:00Z"),
    ];

    mockedParse
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__token-savior__compress", "s1")],
        newOffset: 200,
      })
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__token-savior__expand", "s2")],
        newOffset: 200,
      });

    const result = scanToolMilestones(sessions);
    expect(result[0].firstSeen).toBe("2026-04-10");
  });

  it("lastSeen is the most recent session date", () => {
    const sessions = [
      makeSession("s1", "2026-04-10T10:00:00Z"),
      makeSession("s2", "2026-04-15T10:00:00Z"),
    ];

    mockedParse
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__token-savior__compress", "s1")],
        newOffset: 200,
      })
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__token-savior__expand", "s2")],
        newOffset: 200,
      });

    const result = scanToolMilestones(sessions);
    expect(result[0].lastSeen).toBe("2026-04-15");
  });

  it("handles multiple distinct MCP servers", () => {
    const sessions = [makeSession("s1", "2026-04-10T10:00:00Z")];

    mockedParse.mockReturnValue({
      events: [
        makeMcpToolUseEvent("mcp__token-savior__compress", "s1"),
        makeMcpToolUseEvent("mcp__claude-mem__store", "s1"),
      ],
      newOffset: 200,
    });

    const result = scanToolMilestones(sessions);
    expect(result).toHaveLength(2);
    const names = result.map((r) => r.name).sort();
    expect(names).toEqual(["claude-mem", "token-savior"]);
  });

  it("returns results sorted by firstSeen ascending", () => {
    const sessions = [
      makeSession("s1", "2026-04-10T10:00:00Z"),
      makeSession("s2", "2026-04-01T10:00:00Z"),
    ];

    mockedParse
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__tool-b__action", "s1")],
        newOffset: 200,
      })
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__tool-a__action", "s2")],
        newOffset: 200,
      });

    const result = scanToolMilestones(sessions);
    expect(result[0].name).toBe("tool-a");
    expect(result[1].name).toBe("tool-b");
  });

  it("isActive is true when lastSeen is within 14 days", () => {
    // Use a date very close to "now" (test runs close to 2026-04-20)
    const recentDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    mockedParse.mockReturnValue({
      events: [makeMcpToolUseEvent("mcp__active-tool__run", "s1")],
      newOffset: 200,
    });

    const result = scanToolMilestones([
      makeSession("s1", `${recentDate}T10:00:00Z`),
    ]);
    expect(result[0].isActive).toBe(true);
  });

  it("isActive is false when lastSeen is more than 14 days ago", () => {
    mockedParse.mockReturnValue({
      events: [makeMcpToolUseEvent("mcp__old-tool__run", "s1")],
      newOffset: 200,
    });

    const result = scanToolMilestones([
      makeSession("s1", "2020-01-01T10:00:00Z"),
    ]);
    expect(result[0].isActive).toBe(false);
  });

  it("filters sessions by repo when repo is provided", () => {
    const sessions = [
      makeSession("s1", "2026-04-10T10:00:00Z", "/repo-x"),
      makeSession("s2", "2026-04-10T10:00:00Z", "/repo-y"),
    ];

    mockedParse
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__tool-x__action", "s1")],
        newOffset: 200,
      })
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__tool-y__action", "s2")],
        newOffset: 200,
      });

    const result = scanToolMilestones(sessions, "/repo-x");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("tool-x");
  });

  it("does not filter by repo when repo is 'all'", () => {
    const sessions = [
      makeSession("s1", "2026-04-10T10:00:00Z", "/repo-x"),
      makeSession("s2", "2026-04-10T10:00:00Z", "/repo-y"),
    ];

    mockedParse
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__tool-x__action", "s1")],
        newOffset: 200,
      })
      .mockReturnValueOnce({
        events: [makeMcpToolUseEvent("mcp__tool-y__action", "s2")],
        newOffset: 200,
      });

    const result = scanToolMilestones(sessions, "all");
    expect(result).toHaveLength(2);
  });

  it("handles statSync failure gracefully", () => {
    mockedStat.mockImplementation(() => {
      throw new Error("File not found");
    });
    const sessions = [makeSession("s1", "2026-04-10T10:00:00Z")];
    expect(() => scanToolMilestones(sessions)).not.toThrow();
  });

  it("uses cache when file size is unchanged", () => {
    const session = makeSession("s1", "2026-04-10T10:00:00Z");

    mockedStat.mockReturnValue({ size: 1000 } as ReturnType<typeof statSync>);
    mockedParse.mockReturnValue({
      events: [makeMcpToolUseEvent("mcp__token-savior__compress", "s1")],
      newOffset: 200,
    });

    scanToolMilestones([session]);
    scanToolMilestones([session]);

    // parseJsonlIncremental should only be called once due to caching
    expect(mockedParse).toHaveBeenCalledTimes(1);
  });
});
