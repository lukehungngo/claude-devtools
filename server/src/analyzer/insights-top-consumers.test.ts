import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo } from "../types.js";

vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(() => ({ events: [], newOffset: 0 })),
}));
vi.mock("./insights-aggregator.js", () => ({
  computeInsightsSessionData: vi.fn(),
  getTimeRangeCutoff: vi.fn().mockReturnValue(0),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(() => ({ size: 1000 })) };
});

import { statSync } from "node:fs";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import {
  computeInsightsSessionData,
  getTimeRangeCutoff,
} from "./insights-aggregator.js";
import {
  computeInsightsTopConsumers,
  resetCachesForTesting,
} from "./insights-top-consumers.js";

const mockedStat = vi.mocked(statSync);
const mockedParse = vi.mocked(parseJsonlIncremental);
const mockedSessionData = vi.mocked(computeInsightsSessionData);
const mockedCutoff = vi.mocked(getTimeRangeCutoff);

let sizeCounter = 0;

function makeSession(
  id: string,
  cwd: string,
  lastModified = "2026-04-18T12:00:00Z"
): SessionInfo {
  return {
    id,
    projectHash: "abc",
    path: `/fake/${id}.jsonl`,
    startTime: lastModified,
    lastModified,
    eventCount: 1,
    subagentCount: 0,
    cwd,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sizeCounter = 0;
  resetCachesForTesting();
  mockedCutoff.mockReturnValue(0);
  mockedStat.mockImplementation(
    () => ({ size: ++sizeCounter * 100 }) as ReturnType<typeof statSync>
  );
  mockedParse.mockReturnValue({ events: [], newOffset: 100 });
  mockedSessionData.mockReturnValue({
    fileSize: 100,
    offset: 100,
    tokensIn: 0,
    tokensOut: 0,
    cacheReadTokens: 0,
    cost: 0,
    turns: 0,
  });
});

describe("computeInsightsTopConsumers", () => {
  it("returns empty arrays for no sessions", () => {
    const result = computeInsightsTopConsumers([], "all", "all");
    expect(result.repos).toHaveLength(0);
    expect(result.sessions).toHaveLength(0);
    expect(result.tools).toHaveLength(0);
  });

  it("ranks repos by total token spend", () => {
    const sessions = [
      makeSession("s1", "/Users/alice/repo-a"),
      makeSession("s2", "/Users/alice/repo-b"),
      makeSession("s3", "/Users/alice/repo-a"),
    ];

    mockedSessionData.mockImplementation((s) => {
      if (s.id === "s1")
        return {
          fileSize: 100,
          offset: 100,
          tokensIn: 1000,
          tokensOut: 500,
          cacheReadTokens: 0,
          cost: 0.01,
          turns: 1,
        };
      if (s.id === "s2")
        return {
          fileSize: 100,
          offset: 100,
          tokensIn: 200,
          tokensOut: 100,
          cacheReadTokens: 0,
          cost: 0.002,
          turns: 1,
        };
      // s3
      return {
        fileSize: 100,
        offset: 100,
        tokensIn: 3000,
        tokensOut: 1000,
        cacheReadTokens: 0,
        cost: 0.03,
        turns: 1,
      };
    });

    const result = computeInsightsTopConsumers(sessions, "all", "all");
    // repo-a: 1000+500+3000+1000 = 5500 tokens; repo-b: 200+100 = 300
    expect(result.repos[0].repo).toBe("repo-a");
    expect(result.repos[1].repo).toBe("repo-b");
    expect(result.repos[0].share).toBeCloseTo(1.0, 3);
    expect(result.repos[1].share).toBeCloseTo(300 / 5500, 3);
  });

  it("ranks sessions by cost", () => {
    const sessions = [
      makeSession("s1", "/Users/alice/repo"),
      makeSession("s2", "/Users/alice/repo"),
    ];

    mockedSessionData.mockImplementation((s) => {
      if (s.id === "s1")
        return {
          fileSize: 100,
          offset: 100,
          tokensIn: 100,
          tokensOut: 50,
          cacheReadTokens: 0,
          cost: 0.05,
          turns: 1,
        };
      return {
        fileSize: 100,
        offset: 100,
        tokensIn: 500,
        tokensOut: 200,
        cacheReadTokens: 0,
        cost: 2.0,
        turns: 1,
      };
    });

    const result = computeInsightsTopConsumers(sessions, "all", "all");
    expect(result.sessions[0].sessionId).toBe("s2"); // higher cost
    expect(result.sessions[0].share).toBeCloseTo(1.0, 3);
    expect(result.sessions[1].share).toBeCloseTo(0.05 / 2.0, 3);
  });

  it("counts tool calls from assistant events", () => {
    mockedSessionData.mockReturnValue({
      fileSize: 100,
      offset: 100,
      tokensIn: 100,
      tokensOut: 50,
      cacheReadTokens: 0,
      cost: 0.01,
      turns: 1,
    });
    mockedParse.mockReturnValue({
      events: [
        {
          type: "assistant",
          uuid: "a1",
          timestamp: "2026-04-18T12:00:00Z",
          sessionId: "tool-s1",
          message: {
            role: "assistant",
            content: [
              { type: "tool_use", id: "t1", name: "Read", input: {} },
              { type: "tool_use", id: "t2", name: "Read", input: {} },
              { type: "tool_use", id: "t3", name: "Edit", input: {} },
            ],
            model: "claude-sonnet-4-6",
            id: "m1",
            type: "message",
            stop_reason: "tool_use",
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
      ],
      newOffset: 200,
    });

    const result = computeInsightsTopConsumers(
      [makeSession("tool-s1", "/repo")],
      "all",
      "all"
    );
    const read = result.tools.find((t) => t.name === "Read");
    const edit = result.tools.find((t) => t.name === "Edit");
    expect(read?.count).toBe(2);
    expect(edit?.count).toBe(1);
    expect(read?.share).toBeCloseTo(1.0, 3);
    expect(edit?.share).toBeCloseTo(0.5, 3);
  });

  it("limits results to top 5", () => {
    const sessions = Array.from({ length: 10 }, (_, i) =>
      makeSession(`s${i}`, `/repo-${i}`)
    );
    mockedSessionData.mockImplementation((s) => ({
      fileSize: 100,
      offset: 100,
      tokensIn: 1000 - parseInt(s.id.replace("s", "")) * 50,
      tokensOut: 500,
      cacheReadTokens: 0,
      cost: 0.01,
      turns: 1,
    }));

    const result = computeInsightsTopConsumers(sessions, "all", "all");
    expect(result.repos.length).toBeLessThanOrEqual(5);
    expect(result.sessions.length).toBeLessThanOrEqual(5);
  });

  it("filters by time range via getTimeRangeCutoff", () => {
    const oldSession = makeSession("old-s1", "/repo", "2020-01-01T00:00:00Z");
    const newSession = makeSession("new-s1", "/repo", "2026-04-18T12:00:00Z");

    // cutoff: sessions before 2026-04-01 excluded
    mockedCutoff.mockReturnValue(new Date("2026-04-01T00:00:00Z").getTime());
    mockedSessionData.mockReturnValue({
      fileSize: 100,
      offset: 100,
      tokensIn: 500,
      tokensOut: 200,
      cacheReadTokens: 0,
      cost: 0.01,
      turns: 1,
    });

    const result = computeInsightsTopConsumers(
      [oldSession, newSession],
      "30d",
      "all"
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].sessionId).toBe("new-s1");
  });

  it("filters by repo when repo !== 'all'", () => {
    const sessions = [
      makeSession("r1-s1", "/Users/alice/repo-x"),
      makeSession("r2-s1", "/Users/alice/repo-y"),
    ];
    mockedSessionData.mockReturnValue({
      fileSize: 100,
      offset: 100,
      tokensIn: 100,
      tokensOut: 50,
      cacheReadTokens: 0,
      cost: 0.01,
      turns: 1,
    });

    const result = computeInsightsTopConsumers(
      sessions,
      "all",
      "/Users/alice/repo-x"
    );
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].sessionId).toBe("r1-s1");
  });
});
