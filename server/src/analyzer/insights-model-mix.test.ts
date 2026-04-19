import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(() => ({ size: 100 })) };
});

import { statSync } from "node:fs";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { computeInsightsModelMix, _resetModelMixCacheForTesting } from "./insights-model-mix.js";
import type { SessionInfo, SessionEvent } from "../types.js";

const mockedStat = vi.mocked(statSync);
const mockedParse = vi.mocked(parseJsonlIncremental);

function makeSession(
  id: string,
  cwd = "/home/user/my-repo",
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

function makeAssistantEvent(
  sessionId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  timestamp = "2026-04-18T12:00:00Z"
): SessionEvent {
  return {
    type: "assistant",
    uuid: `uuid-${sessionId}-${model}`,
    parentUuid: undefined,
    timestamp,
    sessionId,
    message: {
      role: "assistant",
      content: [],
      model,
      id: `msg-${sessionId}`,
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _resetModelMixCacheForTesting();
  mockedStat.mockReturnValue({ size: 100 } as ReturnType<typeof statSync>);
  mockedParse.mockReturnValue({ events: [], newOffset: 100 });
});

describe("computeInsightsModelMix", () => {
  it("returns empty models for no sessions", () => {
    const result = computeInsightsModelMix([], "all", "all");
    expect(result.models).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });

  it("groups tokens by model across sessions", () => {
    mockedParse.mockReturnValue({
      events: [makeAssistantEvent("s1", "claude-sonnet-4-6", 1000, 500)],
      newOffset: 200,
    });

    const result = computeInsightsModelMix([makeSession("s1")], "all", "all");
    expect(result.models).toHaveLength(1);
    expect(result.models[0].model).toBe("claude-sonnet-4-6");
    expect(result.models[0].tokensIn).toBe(1000);
    expect(result.models[0].tokensOut).toBe(500);
    expect(result.models[0].share).toBeCloseTo(1.0, 2);
    expect(result.totalTokens).toBe(1500);
  });

  it("computes share correctly for two models", () => {
    let callIdx = 0;
    mockedParse.mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        return {
          events: [makeAssistantEvent("s1", "claude-sonnet-4-6", 600, 400)],
          newOffset: 200,
        };
      }
      return {
        events: [makeAssistantEvent("s2", "claude-opus-4", 300, 200)],
        newOffset: 200,
      };
    });

    const result = computeInsightsModelMix(
      [makeSession("s1"), makeSession("s2")],
      "all",
      "all"
    );
    expect(result.models).toHaveLength(2);
    expect(result.totalTokens).toBe(1500); // (600+400) + (300+200)
    const sonnet = result.models.find((m) => m.model === "claude-sonnet-4-6");
    const opus = result.models.find((m) => m.model === "claude-opus-4");
    expect(sonnet?.share).toBeCloseTo(1000 / 1500, 3);
    expect(opus?.share).toBeCloseTo(500 / 1500, 3);
  });

  it("aggregates two events with the same model in one session", () => {
    mockedParse.mockReturnValue({
      events: [
        makeAssistantEvent("s1", "claude-sonnet-4-6", 200, 100),
        makeAssistantEvent("s1", "claude-sonnet-4-6", 300, 150),
      ],
      newOffset: 200,
    });

    const result = computeInsightsModelMix([makeSession("s1")], "all", "all");
    expect(result.models).toHaveLength(1);
    expect(result.models[0].tokensIn).toBe(500);
    expect(result.models[0].tokensOut).toBe(250);
    expect(result.models[0].turns).toBe(2);
    expect(result.totalTokens).toBe(750);
  });

  it("filters by repo when repo is not 'all'", () => {
    mockedParse.mockReturnValue({
      events: [makeAssistantEvent("s1", "claude-sonnet-4-6", 100, 50)],
      newOffset: 200,
    });

    const sessions = [
      makeSession("s1", "/Users/alice/my-repo"),
      makeSession("s2", "/Users/alice/other-repo"),
    ];
    const result = computeInsightsModelMix(sessions, "all", "/Users/alice/my-repo");
    expect(mockedParse).toHaveBeenCalledTimes(1);
    expect(result.models).toHaveLength(1);
    expect(result.totalTokens).toBe(150);
  });

  it("filters by timeRange — excludes sessions older than cutoff", () => {
    // "2025-01-01" is older than 7 days from "today" (2026-04-19)
    const oldSession = makeSession("s-old", "/repo", "2025-01-01T00:00:00Z");
    const result = computeInsightsModelMix([oldSession], "7d", "all");
    expect(result.models).toHaveLength(0);
    expect(mockedParse).not.toHaveBeenCalled();
  });

  it("includes sessions within the time range", () => {
    // Recent session — 1 hour ago relative to test date
    const recentDate = new Date(Date.now() - 3600_000).toISOString();
    const recentSession = makeSession("s-recent", "/repo", recentDate);
    mockedParse.mockReturnValue({
      events: [makeAssistantEvent("s-recent", "claude-sonnet-4-6", 100, 50)],
      newOffset: 200,
    });

    const result = computeInsightsModelMix([recentSession], "7d", "all");
    expect(result.models).toHaveLength(1);
    expect(result.totalTokens).toBe(150);
  });

  it("sorts models by total tokens descending", () => {
    let callIdx = 0;
    mockedParse.mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        return {
          events: [makeAssistantEvent("s1", "claude-haiku-4-5", 100, 50)],
          newOffset: 200,
        };
      }
      return {
        events: [makeAssistantEvent("s2", "claude-sonnet-4-6", 500, 300)],
        newOffset: 200,
      };
    });

    const result = computeInsightsModelMix(
      [makeSession("s1"), makeSession("s2")],
      "all",
      "all"
    );
    // sonnet has 800 tokens, haiku has 150 — sonnet must be first
    expect(result.models[0].model).toBe("claude-sonnet-4-6");
    expect(result.models[1].model).toBe("claude-haiku-4-5");
  });

  it("returns zero share when totalTokens is zero", () => {
    // statSync throws → no events → empty models
    mockedStat.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const result = computeInsightsModelMix([makeSession("s-missing")], "all", "all");
    expect(result.models).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });
});
