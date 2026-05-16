import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo, SessionEvent } from "../types.js";

// Mock parseJsonlIncremental — usage-breakdown reads files incrementally.
vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(() => ({ events: [], newOffset: 0 })),
}));

// Mock statSync for cache-key checks.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    statSync: vi.fn(() => ({ size: 1000 })),
  };
});

import { aggregatePerModelUsage } from "./usage-breakdown.js";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { statSync } from "node:fs";

const mockedParseJsonl = vi.mocked(parseJsonlIncremental);
const mockedStat = vi.mocked(statSync);

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "session-" + Math.random().toString(36).slice(2),
    projectHash: "abc",
    path: "/tmp/test.jsonl",
    startTime: "2026-05-01T10:00:00Z",
    lastModified: new Date().toISOString(),
    eventCount: 1,
    subagentCount: 0,
    ...overrides,
  };
}

function makeAssistant(
  model: string,
  input: number,
  output: number,
  cacheCreate: number,
  cacheRead: number,
  uuid = "u-" + Math.random().toString(36).slice(2)
): SessionEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: "2026-05-01T10:00:00Z",
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "x" }],
      model,
      id: "msg-" + uuid,
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: input,
        output_tokens: output,
        cache_creation_input_tokens: cacheCreate,
        cache_read_input_tokens: cacheRead,
      },
    },
  } as unknown as SessionEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  let n = 0;
  mockedStat.mockImplementation(
    () => ({ size: ++n * 1000 }) as ReturnType<typeof statSync>
  );
});

describe("aggregatePerModelUsage", () => {
  it("returns empty breakdown for no sessions", () => {
    const result = aggregatePerModelUsage([]);
    expect(result.perModel).toEqual([]);
    expect(result.totalCost).toBe(0);
  });

  it("groups tokens by model and computes cache-hit ratio", () => {
    const session = makeSession();
    mockedParseJsonl.mockReturnValue({
      events: [
        makeAssistant("claude-sonnet-4-6", 100, 50, 200, 700, "a"),
      ],
      newOffset: 500,
    });

    const result = aggregatePerModelUsage([session]);

    expect(result.perModel).toHaveLength(1);
    const row = result.perModel[0];
    expect(row.model).toBe("claude-sonnet-4-6");
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(50);
    expect(row.cacheCreationTokens).toBe(200);
    expect(row.cacheReadTokens).toBe(700);
    // denominator = input + cacheRead + cacheCreate = 100 + 700 + 200 = 1000
    // ratio = 700 / 1000 = 0.7
    expect(row.cacheHitRatio).toBeCloseTo(0.7, 5);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it("returns 0 cache-hit ratio when denominator is zero", () => {
    const session = makeSession();
    mockedParseJsonl.mockReturnValue({
      events: [makeAssistant("claude-haiku-4-5", 0, 0, 0, 0, "z")],
      newOffset: 100,
    });

    const result = aggregatePerModelUsage([session]);
    expect(result.perModel).toHaveLength(1);
    expect(result.perModel[0].cacheHitRatio).toBe(0);
  });

  it("aggregates multiple events for the same model across sessions", () => {
    const s1 = makeSession({ path: "/tmp/s1.jsonl" });
    const s2 = makeSession({ path: "/tmp/s2.jsonl" });

    mockedParseJsonl
      .mockReturnValueOnce({
        events: [makeAssistant("claude-sonnet-4-6", 50, 25, 100, 0, "a")],
        newOffset: 100,
      })
      .mockReturnValueOnce({
        events: [makeAssistant("claude-sonnet-4-6", 50, 25, 0, 200, "b")],
        newOffset: 100,
      });

    const result = aggregatePerModelUsage([s1, s2]);

    expect(result.perModel).toHaveLength(1);
    const row = result.perModel[0];
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(50);
    expect(row.cacheCreationTokens).toBe(100);
    expect(row.cacheReadTokens).toBe(200);
    // 200 / (100 + 200 + 100) = 0.5
    expect(row.cacheHitRatio).toBeCloseTo(0.5, 5);
  });

  it("returns separate rows for distinct models, sorted by total tokens descending", () => {
    const session = makeSession();
    mockedParseJsonl.mockReturnValue({
      events: [
        // haiku small
        makeAssistant("claude-haiku-4-5", 10, 5, 0, 0, "h"),
        // sonnet large
        makeAssistant("claude-sonnet-4-6", 1000, 500, 0, 0, "s"),
      ],
      newOffset: 500,
    });

    const result = aggregatePerModelUsage([session]);
    expect(result.perModel).toHaveLength(2);
    // sonnet has more tokens, must come first
    expect(result.perModel[0].model).toBe("claude-sonnet-4-6");
    expect(result.perModel[1].model).toBe("claude-haiku-4-5");
  });

  it("skips synthetic pseudo-models", () => {
    const session = makeSession();
    mockedParseJsonl.mockReturnValue({
      events: [
        makeAssistant("<synthetic>", 9999, 9999, 0, 0, "syn"),
        makeAssistant("claude-sonnet-4-6", 100, 50, 0, 0, "real"),
      ],
      newOffset: 500,
    });

    const result = aggregatePerModelUsage([session]);
    expect(result.perModel).toHaveLength(1);
    expect(result.perModel[0].model).toBe("claude-sonnet-4-6");
    expect(result.perModel[0].inputTokens).toBe(100);
  });

  it("skips non-assistant events and events without usage", () => {
    const session = makeSession();
    const userEvent = {
      type: "user",
      uuid: "user-1",
      timestamp: "2026-05-01T10:00:00Z",
      sessionId: "s1",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    } as unknown as SessionEvent;

    mockedParseJsonl.mockReturnValue({
      events: [
        userEvent,
        makeAssistant("claude-sonnet-4-6", 200, 100, 0, 0, "a"),
      ],
      newOffset: 500,
    });

    const result = aggregatePerModelUsage([session]);
    expect(result.perModel).toHaveLength(1);
    expect(result.perModel[0].inputTokens).toBe(200);
  });

  it("ignores sessions whose files cannot be stat'd", () => {
    const broken = makeSession({ path: "/tmp/missing.jsonl" });
    mockedStat.mockImplementationOnce(() => {
      throw new Error("ENOENT");
    });
    mockedParseJsonl.mockReturnValue({ events: [], newOffset: 0 });

    const result = aggregatePerModelUsage([broken]);
    expect(result.perModel).toEqual([]);
    expect(result.totalCost).toBe(0);
  });
});
