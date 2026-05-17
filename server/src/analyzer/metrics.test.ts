import { describe, it, expect, vi } from "vitest";
import { calculateTokenCost, computeMetrics } from "./metrics.js";
import type { SessionEvent, SessionInfo, AssistantEvent } from "../types.js";
import { getModelContextWindow } from "../cache/model-context-cache.js";

// model-context-cache may not exist yet (built in a parallel task); mock it so
// these tests remain green regardless of whether Task 1 has run.
vi.mock("../cache/model-context-cache.js", () => ({
  getModelContextWindow: vi.fn().mockReturnValue(undefined),
}));

// Helper to create an assistant event with usage
function makeAssistantEvent(
  overrides: Partial<AssistantEvent> & {
    usage?: Partial<AssistantEvent["message"]["usage"]>;
    model?: string;
    content?: AssistantEvent["message"]["content"];
  } = {}
): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid || "uuid-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp || "2026-03-23T10:00:00Z",
    sessionId: "test-session",
    message: {
      role: "assistant",
      content: overrides.content || [{ type: "text", text: "hello" }],
      model: overrides.model || "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: {
        input_tokens: overrides.usage?.input_tokens ?? 1000,
        output_tokens: overrides.usage?.output_tokens ?? 500,
        cache_creation_input_tokens:
          overrides.usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens:
          overrides.usage?.cache_read_input_tokens ?? 0,
      },
    },
  };
}

function makeSessionInfo(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "test-session",
    projectHash: "abc123",
    path: "/tmp/test.jsonl",
    startTime: "2026-03-23T10:00:00Z",
    lastModified: "2026-03-23T10:05:00Z",
    eventCount: 10,
    subagentCount: 0,
    isActive: false,
    ...overrides,
  };
}

describe("calculateTokenCost", () => {
  it("computes correct cost for claude-opus-4-6 model", () => {
    // Pricing: input:15, output:75, cacheWrite:18.75, cacheRead:1.5 per million
    const cost = calculateTokenCost("claude-opus-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    });
    // 15 + 75 + 18.75 + 1.5 = 110.25
    expect(cost).toBeCloseTo(110.25, 2);
  });

  it("computes correct cost for claude-sonnet-4-6 model", () => {
    // Pricing: input:3, output:15, cacheWrite:3.75, cacheRead:0.3 per million
    const cost = calculateTokenCost("claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    });
    // 3 + 15 + 3.75 + 0.3 = 22.05
    expect(cost).toBeCloseTo(22.05, 2);
  });

  it("falls back to sonnet pricing for unknown model", () => {
    const cost = calculateTokenCost("unknown-model-xyz", {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    // Should use sonnet pricing: input:3 per million = 3.0
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it("returns 0 for zero tokens", () => {
    const cost = calculateTokenCost("claude-sonnet-4-6", {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    expect(cost).toBe(0);
  });

  it("scales linearly with token count", () => {
    const cost1 = calculateTokenCost("claude-sonnet-4-6", {
      inputTokens: 100_000,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    const cost2 = calculateTokenCost("claude-sonnet-4-6", {
      inputTokens: 200_000,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    });
    expect(cost2).toBeCloseTo(cost1 * 2, 6);
  });
});

describe("computeMetrics", () => {
  it("aggregates tokens from main events only (subagent tokens tracked in DAG)", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    ];
    const subagentEvents = new Map<string, SessionEvent[]>([
      [
        "agent-1",
        [
          makeAssistantEvent({
            usage: { input_tokens: 200, output_tokens: 100 },
          }),
        ],
      ],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "explore task" }],
    ]);

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      subagentEvents,
      subagentMeta
    );

    // Only main events count toward top-level totals (matches CLI behavior)
    expect(metrics.tokens.inputTokens).toBe(100);
    expect(metrics.tokens.outputTokens).toBe(50);
  });

  it("calculates totalAgents as 1 + subagentEvents.size", () => {
    const mainEvents: SessionEvent[] = [makeAssistantEvent()];
    const subagentEvents = new Map<string, SessionEvent[]>([
      ["agent-1", [makeAssistantEvent()]],
      ["agent-2", [makeAssistantEvent()]],
    ]);
    const subagentMeta = new Map([
      ["agent-1", { agentType: "Explore", description: "a" }],
      ["agent-2", { agentType: "Plan", description: "b" }],
    ]);

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      subagentEvents,
      subagentMeta
    );

    expect(metrics.totalAgents).toBe(3);
  });

  it("computes contextPercent based on last assistant event input tokens", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        usage: { input_tokens: 50000, output_tokens: 100, cache_read_input_tokens: 0 },
        model: "claude-sonnet-4-6",
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    // contextWindowSize for sonnet = 200000
    // contextPercent = round((50000 / 200000) * 100) = 25
    expect(metrics.contextPercent).toBe(25);
    expect(metrics.contextWindowSize).toBe(200_000);
  });

  it("caps contextPercent at 100 when tokens exceed an SDK-pinned window", () => {
    // Pin the window explicitly via sdkContextWindow — the observation-derived
    // path would treat 300K as evidence of a 1M tier and report 30% (no cap).
    // To exercise the cap behaviour we must force the smaller window through
    // the SDK authoritative path.
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        usage: { input_tokens: 300000, output_tokens: 100, cache_read_input_tokens: 0 },
        model: "claude-sonnet-4-6",
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map(),
      200_000, // SDK pins window at 200K
    );

    // 300K / 200K = 150% → capped at 100
    expect(metrics.contextPercent).toBe(100);
    expect(metrics.contextWindowSize).toBe(200_000);
  });

  it("uses sdkContextWindow when provided (SDK authoritative value)", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        usage: { input_tokens: 250_000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        model: "claude-opus-4-6", // No [1m] suffix
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map(),
      1_000_000, // SDK says 1M context
    );

    // 250K / 1M = 25%
    expect(metrics.contextWindowSize).toBe(1_000_000);
    expect(metrics.contextPercent).toBe(25);
  });

  it("falls back to model-based window when sdkContextWindow is undefined", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        usage: { input_tokens: 50_000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        model: "claude-opus-4-6",
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map(),
      // sdkContextWindow omitted — uses fallback
    );

    expect(metrics.contextWindowSize).toBe(200_000);
    expect(metrics.contextPercent).toBe(25);
  });

  // (Removed 2026-05-17 with Bug K fix): the "1m" substring heuristic was
  // deleted from getContextWindowSize. Context window is now derived from
  // observed usage, not the model name. See
  // docs/bugs/context-window-hardcoded-guesswork.md.

  it("computes duration from first to last main event timestamps (inactive session)", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({ timestamp: "2026-03-23T10:00:00Z" }),
      makeAssistantEvent({ timestamp: "2026-03-23T10:05:00Z" }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo({ isActive: false }),
      mainEvents,
      new Map(),
      new Map()
    );

    // 5 minutes = 300000 ms
    expect(metrics.duration).toBe(300_000);
  });

  it("extracts tasks from TaskCreate and TaskUpdate tool_use events", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        content: [
          { type: "tool_use", id: "t1", name: "TaskCreate", input: {} },
          {
            type: "tool_use",
            id: "t2",
            name: "TaskUpdate",
            input: { taskId: "1", status: "completed" },
          },
        ],
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    expect(metrics.tasks.total).toBe(1);
    expect(metrics.tasks.completed).toBe(1);
  });

  it("extracts tasks from TodoWrite tool_use events", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        content: [
          {
            type: "tool_use",
            id: "t1",
            name: "TodoWrite",
            input: {
              todos: [
                { status: "completed" },
                { status: "in_progress" },
                { status: "pending" },
              ],
            },
          },
        ],
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    expect(metrics.tasks.total).toBe(3);
    expect(metrics.tasks.completed).toBe(1);
    expect(metrics.tasks.inProgress).toBe(1);
    expect(metrics.tasks.pending).toBe(1);
  });

  it("detects remote control from entrypoint field", () => {
    const mainEvents: SessionEvent[] = [
      {
        ...makeAssistantEvent(),
        entrypoint: "remote-control",
      } as unknown as SessionEvent,
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    expect(metrics.hasRemoteControl).toBe(true);
  });

  it("detects remote control from /remote-control text in user event", () => {
    const mainEvents: SessionEvent[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-03-23T10:00:00Z",
        sessionId: "test-session",
        userType: "external",
        message: {
          role: "user",
          content: [{ type: "text", text: "run /remote-control command" }],
        },
      } as SessionEvent,
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    expect(metrics.hasRemoteControl).toBe(true);
  });

  it("returns hasRemoteControl=false when no remote control indicators", () => {
    const mainEvents: SessionEvent[] = [makeAssistantEvent()];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    expect(metrics.hasRemoteControl).toBe(false);
  });

  it("computes cumulative cost in tokensByTurn", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-03-23T10:00:00Z",
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
      makeAssistantEvent({
        timestamp: "2026-03-23T10:01:00Z",
        usage: { input_tokens: 2000, output_tokens: 1000 },
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    expect(metrics.tokensByTurn).toHaveLength(2);
    expect(metrics.tokensByTurn[1].cumulativeCost).toBeGreaterThan(
      metrics.tokensByTurn[0].cumulativeCost
    );
    expect(metrics.tokensByTurn[1].cumulativeCost).toBeCloseTo(
      metrics.tokensByTurn[0].cost + metrics.tokensByTurn[1].cost
    );
  });

  it("returns correct models list", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({ model: "claude-opus-4-6" }),
      makeAssistantEvent({ model: "claude-sonnet-4-6" }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    expect(metrics.models).toContain("claude-opus-4-6");
    expect(metrics.models).toContain("claude-sonnet-4-6");
  });

  it("excludes pseudo-models like <synthetic> from models list and token aggregation", () => {
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        uuid: "real-1",
        model: "claude-opus-4-6",
        usage: { input_tokens: 50_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
      makeAssistantEvent({
        uuid: "synth-1",
        model: "<synthetic>",
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
      makeAssistantEvent({
        uuid: "real-2",
        model: "claude-opus-4-6",
        usage: { input_tokens: 30_000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
    );

    // <synthetic> must not pollute the models list
    expect(metrics.models).not.toContain("<synthetic>");
    expect(metrics.models).toContain("claude-opus-4-6");

    // tokensByModel must not have an entry for <synthetic>
    expect(metrics.tokensByModel["<synthetic>"]).toBeUndefined();
    expect(metrics.tokensByModel["claude-opus-4-6"]).toBeDefined();

    // Totals reflect only real events (50_000 + 30_000 = 80_000 input)
    expect(metrics.tokens.inputTokens).toBe(80_000);
    expect(metrics.tokens.outputTokens).toBe(300);
  });

  it("derives 1M window from observed usage when a turn exceeds 200K (Bug K)", () => {
    // Bug K fix: window is observation-driven, NOT model-name-driven.
    // Use an unknown model id so the pre-fix hardcoded FALLBACK_CONTEXT_WINDOW_SIZES
    // would have returned 200K — only the new observation logic returns 1M
    // when a turn served > 200K input. This is what makes this a real
    // both-directions test for the Bug K fix.
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        usage: { input_tokens: 500_000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        model: "claude-future-model-2027", // intentionally unknown to old static map
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map(),
      // sdkContextWindow omitted — observation-derived path must pick 1M
    );

    expect(metrics.contextWindowSize).toBe(1_000_000);
    // 500_000 / 1_000_000 = 50%
    expect(metrics.contextPercent).toBe(50);
  });

  it("uses persistent cache value when available (overrides static map)", () => {
    // Mock cache to return a custom value for an unknown model
    vi.mocked(getModelContextWindow).mockReturnValueOnce(512_000);
    // Build a session using "claude-future-model" (not in static map)
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        usage: { input_tokens: 256_000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        model: "claude-future-model",
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map(),
      // sdkContextWindow omitted — persistent cache must be used
    );

    // 256_000 / 512_000 = 50%
    expect(metrics.contextWindowSize).toBe(512_000);
    expect(metrics.contextPercent).toBe(50);
  });

  it("explicit sessionIsRunning overrides sessionInfo.isRunning", () => {
    const sessionInfo = makeSessionInfo({ isRunning: true });

    const metrics = computeMetrics(
      sessionInfo,
      [],
      new Map(),
      new Map(),
      undefined,
      false // explicit sessionIsRunning=false overrides sessionInfo.isRunning=true
    );

    expect(metrics.session.isRunning).toBe(false);
  });

  it("infers 1M tier when any turn exceeds 200K, even with unknown model names (Bug K)", () => {
    // Mixed-model session with model ids that are NOT in the pre-fix static
    // map. The pre-fix path would have returned the 200K default for both —
    // only the observation-derived path sees the 500K turn and returns 1M.
    const mainEvents: SessionEvent[] = [
      makeAssistantEvent({
        uuid: "first-small",
        timestamp: "2026-04-17T10:00:00Z",
        model: "claude-future-small-2027",
        usage: { input_tokens: 10_000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
      makeAssistantEvent({
        uuid: "later-big",
        timestamp: "2026-04-17T10:01:00Z",
        model: "claude-future-big-2027",
        usage: { input_tokens: 500_000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      }),
    ];

    const metrics = computeMetrics(
      makeSessionInfo(),
      mainEvents,
      new Map(),
      new Map()
      // no sdkContextWindow — observation-derived path must see the 500K turn
    );

    // 500K observed → 1M tier inferred.
    expect(metrics.contextWindowSize).toBe(1_000_000);
    // 500_000 / 1_000_000 = 50%
    expect(metrics.contextPercent).toBe(50);
  });
});
