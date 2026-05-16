import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAgentCompleted, getAgentStatus } from "./agentStatus.js";
import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  SystemEvent,
  ContentItem,
} from "../types.js";

// ─── Test helpers ────────────────────────────────────────────────────

function makeAssistantEvent(overrides: {
  uuid?: string;
  timestamp?: string;
  agentId?: string;
  isSidechain?: boolean;
  stopReason?: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "pause_turn" | "refusal" | null;
  content?: ContentItem[];
}): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid ?? `asst-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:00Z",
    sessionId: "sess-1",
    ...(overrides.isSidechain !== undefined && { isSidechain: overrides.isSidechain }),
    ...(overrides.agentId !== undefined && { agentId: overrides.agentId }),
    message: {
      role: "assistant",
      content: overrides.content ?? [{ type: "text", text: "hello" }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: overrides.stopReason ?? null,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  };
}

function makeUserEvent(overrides: {
  uuid?: string;
  timestamp?: string;
  agentId?: string;
  isSidechain?: boolean;
  content?: ContentItem[] | string;
}): UserEvent {
  return {
    type: "user",
    uuid: overrides.uuid ?? `user-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:00Z",
    sessionId: "sess-1",
    userType: "external",
    ...(overrides.isSidechain !== undefined && { isSidechain: overrides.isSidechain }),
    ...(overrides.agentId !== undefined && { agentId: overrides.agentId }),
    message: {
      role: "user",
      content: overrides.content ?? [{ type: "text", text: "hi" }],
    },
  };
}

function makeSystemEvent(overrides: {
  uuid?: string;
  timestamp?: string;
  subtype: string;
}): SystemEvent {
  return {
    type: "system",
    uuid: overrides.uuid ?? `sys-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: overrides.timestamp ?? "2026-01-01T00:00:00Z",
    sessionId: "sess-1",
    subtype: overrides.subtype,
  };
}

function makeToolResultContent(toolUseId: string): ContentItem {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: "result",
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("isAgentCompleted — Signal 1 (own end_turn)", () => {
  it("T-COMPL-1 agent with end_turn on last assistant is completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "end_turn",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-COMPL-1a subagent with stop_reason 'tool_use' only is NOT completed (no other signals)", () => {
    // Scope: this tests Signal 1 only. Crucially, the event stream has NO
    // main user tool_result event — otherwise the weak Signal 3 would fire.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(false);
  });

  it("T-COMPL-1b main agent with end_turn is completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        // main events carry no agentId in production; isSidechain omitted
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
    ];
    expect(isAgentCompleted("main", events)).toBe(true);
  });

  it("only the last owned assistant's stop_reason votes (later tool_use does NOT complete via Signal 1)", () => {
    // Fixture: end_turn assistant followed by a later tool_use assistant.
    // Signal 1 must read the LAST assistant (tool_use), so it returns false
    // via Signal 1. With no Signal 2/3, overall result is false.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "tool_use",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(false);
  });
});

describe("isAgentCompleted — Signal 2 (turn_duration, main-only)", () => {
  it("T-COMPL-2 main with turn_duration system event is completed (even if last assistant isn't end_turn)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeSystemEvent({
        subtype: "turn_duration",
        timestamp: "2026-01-01T00:00:02Z",
      }),
    ];
    expect(isAgentCompleted("main", events)).toBe(true);
  });

  it("T-COMPL-2a subagent with turn_duration in stream is NOT completed by that alone", () => {
    // turn_duration is main-only. Even if one is in the stream, subagent
    // must find its OWN terminal signal (not main's).
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeSystemEvent({
        subtype: "turn_duration",
        timestamp: "2026-01-01T00:00:02Z",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(false);
  });
});

describe("isAgentCompleted — Signal 3 (parent tool_result ack)", () => {
  it("T-COMPL-3 subagent whose last event is tool_use, but main emitted tool_result after → completed", () => {
    const events: SessionEvent[] = [
      // Main dispatched the Task
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          {
            type: "tool_use",
            id: "toolu-1",
            name: "Task",
            input: { description: "work" },
          },
        ],
        stopReason: "tool_use",
      }),
      // Subagent runs and exits on tool_use (no end_turn)
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      // Main acknowledges with a tool_result AFTER subagent's last event
      makeUserEvent({
        timestamp: "2026-01-01T00:00:02Z",
        content: [makeToolResultContent("toolu-1")],
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-COMPL-3a subagent without any parent tool_result → NOT completed via Signal 3", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      // Main has an assistant event but no tool_result user event
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "tool_use",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(false);
  });

  it("T-COMPL-3b main's tool_result BEFORE subagent's last event does NOT acknowledge", () => {
    const events: SessionEvent[] = [
      // Stale tool_result for a prior dispatch at T=5
      makeUserEvent({
        timestamp: "2026-01-01T00:00:05Z",
        content: [makeToolResultContent("toolu-prior")],
      }),
      // Subagent's last event at T=10 — AFTER the tool_result
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:10Z",
        stopReason: "tool_use",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(false);
  });
});

describe("isAgentCompleted — Signal 3 strict tool_use_id match", () => {
  // These fixtures exercise the brainstorm's spec form of Signal 3: the parent
  // acks THIS subagent specifically via tool_use_id → dispatched-agentId chain.
  // The weak-form fallback (any tool_result postdating the subagent) stays as
  // a safety net; the strict path must take precedence where attributable.
  it("T-SIG3-STRICT-1 main dispatches subA via Task(id=abc), later tool_result with tool_use_id=abc → subA completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          {
            type: "tool_use",
            id: "abc",
            name: "Task",
            input: { description: "A work" },
          },
        ],
        stopReason: "tool_use",
      }),
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeUserEvent({
        timestamp: "2026-01-01T00:00:02Z",
        content: [makeToolResultContent("abc")],
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-SIG3-STRICT-2 concurrent dispatches — Y is acked first, X still not acked → X NOT completed", () => {
    // Discriminating test: under the weak form, X would be "completed" because
    // main emitted a tool_result after X's last event. Strict form requires
    // the tool_result's tool_use_id to match X's dispatching tool_use.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          {
            type: "tool_use",
            id: "abcX",
            name: "Task",
            input: { description: "X work" },
          },
        ],
        stopReason: "tool_use",
      }),
      makeAssistantEvent({
        agentId: "X",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:02Z",
        content: [
          {
            type: "tool_use",
            id: "abcY",
            name: "Task",
            input: { description: "Y work" },
          },
        ],
        stopReason: "tool_use",
      }),
      makeAssistantEvent({
        agentId: "Y",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:03Z",
        stopReason: "end_turn",
      }),
      makeUserEvent({
        timestamp: "2026-01-01T00:00:04Z",
        content: [makeToolResultContent("abcY")],
      }),
    ];
    expect(isAgentCompleted("Y", events)).toBe(true);
    expect(isAgentCompleted("X", events)).toBe(false);
  });

  it("T-SIG3-STRICT-3 subagent with no attributable dispatching tool_use → weak fallback applies", () => {
    // Safety net: if no main Task tool_use can be temporally bound to this
    // agentId (no tool_use dispatching it, or the tool_use is outside the
    // event window), fall back to the weak form.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "orphan",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeUserEvent({
        timestamp: "2026-01-01T00:00:02Z",
        content: [makeToolResultContent("unrelated")],
      }),
    ];
    expect(isAgentCompleted("orphan", events)).toBe(true);
  });
});

describe("isAgentCompleted — transitive SDK invariant (property)", () => {
  it("T-PROP-1 fixture A: main end_turn + subagent end_turn → both completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:05Z",
        stopReason: "end_turn",
      }),
    ];
    expect(isAgentCompleted("main", events)).toBe(true);
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-PROP-1 fixture B: main end_turn + subagent Signal 3 only (tool_use + parent ack) → both completed", () => {
    // Critical case: subagent never emitted end_turn. Completion proven by
    // parent ack (Signal 3). This fails under the old timer-based impl.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          {
            type: "tool_use",
            id: "toolu-X",
            name: "Task",
            input: { description: "work" },
          },
        ],
        stopReason: "tool_use",
      }),
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeUserEvent({
        timestamp: "2026-01-01T00:00:02Z",
        content: [makeToolResultContent("toolu-X")],
      }),
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:05Z",
        stopReason: "end_turn",
      }),
    ];
    expect(isAgentCompleted("main", events)).toBe(true);
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-PROP-1 fixture C: main turn_duration + subagent end_turn → both completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subB",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "tool_use",
      }),
      makeSystemEvent({
        subtype: "turn_duration",
        timestamp: "2026-01-01T00:00:03Z",
      }),
    ];
    expect(isAgentCompleted("main", events)).toBe(true);
    expect(isAgentCompleted("subB", events)).toBe(true);
  });

  it("T-PROP-1 fixture D: main end_turn + multiple descendants via mixed signals → all completed", () => {
    const events: SessionEvent[] = [
      // subA finishes normally (Signal 1)
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
      // main dispatches subB
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:02Z",
        content: [
          {
            type: "tool_use",
            id: "toolu-B",
            name: "Task",
            input: { description: "subB work" },
          },
        ],
        stopReason: "tool_use",
      }),
      // subB exits on tool_use (Signal 3 will cover it)
      makeAssistantEvent({
        agentId: "subB",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:03Z",
        stopReason: "tool_use",
      }),
      // main ack for subB
      makeUserEvent({
        timestamp: "2026-01-01T00:00:04Z",
        content: [makeToolResultContent("toolu-B")],
      }),
      // main end_turn
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:05Z",
        stopReason: "end_turn",
      }),
    ];
    // Property: main completed ⇒ every descendant completed
    expect(isAgentCompleted("main", events)).toBe(true);
    const descendants = ["subA", "subB"];
    for (const d of descendants) {
      expect(isAgentCompleted(d, events)).toBe(true);
    }
  });
});

describe("isAgentCompleted — purity (no timer)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("T-PROP-2 result is independent of current time (mocked one year forward)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
    ];

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const resultNow = isAgentCompleted("subA", events);
    expect(resultNow).toBe(false);

    vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
    const resultLater = isAgentCompleted("subA", events);
    expect(resultLater).toBe(false);

    expect(resultNow).toBe(resultLater);
  });

  it("T-PROP-2a same events different calls → same output (completed case)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
    ];
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
    const first = isAgentCompleted("main", events);
    vi.setSystemTime(new Date("2099-06-15T12:00:00Z"));
    const second = isAgentCompleted("main", events);
    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(first).toBe(second);
  });
});

describe("isAgentCompleted — edge cases", () => {
  it("T-EDGE-1 empty events array → not completed", () => {
    expect(isAgentCompleted("main", [])).toBe(false);
    expect(isAgentCompleted("subA", [])).toBe(false);
  });

  it("T-EDGE-2 only user events → not completed", () => {
    const events: SessionEvent[] = [
      makeUserEvent({ timestamp: "2026-01-01T00:00:00Z" }),
    ];
    expect(isAgentCompleted("main", events)).toBe(false);
    // subagent with no owned events at all → Signal 3 guard returns false
    expect(isAgentCompleted("subA", events)).toBe(false);
  });

  it("T-EDGE-3 agent with events but no terminal signal → not completed (running)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: null,
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(false);
  });

  it("T-EDGE-4 stop_reason 'max_tokens' is terminal → completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "max_tokens",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-EDGE-5 stop_reason 'stop_sequence' is terminal → completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "stop_sequence",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-EDGE-6 stop_reason 'refusal' is terminal → completed", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "refusal",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-EDGE-7 stop_reason 'pause_turn' is NOT terminal → not completed (extended thinking in flight)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "pause_turn",
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(false);
  });
});

describe("getAgentStatus", () => {
  it("T-STATUS-1 returns 'completed' when any signal present", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
    ];
    expect(getAgentStatus("main", events, true)).toBe("completed");
    expect(getAgentStatus("main", events, false)).toBe("completed");
  });

  it("T-STATUS-2 returns 'running' when no signal AND sessionIsActive", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
    ];
    expect(getAgentStatus("main", events, true)).toBe("running");
  });

  it("T-STATUS-3 returns 'indeterminate' when no signal AND !sessionIsActive", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
    ];
    expect(getAgentStatus("subA", events, false)).toBe("indeterminate");
  });
});

describe("parity with dashboard/src/lib/agentStatus", () => {
  // Symbolic parity check: both implementations were hand-crafted from the
  // same three-signal spec. This fixture stream exercises all three signals
  // in one call. If either implementation drifts away from the spec, its
  // mirror test file (same T-IDs) will fail, and the shared expected outputs
  // below make divergence visible at review time.
  it("T-PARITY three signals are recognized identically", () => {
    const events: SessionEvent[] = [
      // Signal 1 for subA — explicit end_turn
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "end_turn",
      }),
      // Main dispatches subB
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:02Z",
        content: [
          {
            type: "tool_use",
            id: "toolu-B",
            name: "Task",
            input: { description: "subB work" },
          },
        ],
        stopReason: "tool_use",
      }),
      // subB never end_turns (Signal 3 will cover it via ack)
      makeAssistantEvent({
        agentId: "subB",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:03Z",
        stopReason: "tool_use",
      }),
      // Main emits tool_result AFTER subB's last event (Signal 3 ack)
      makeUserEvent({
        timestamp: "2026-01-01T00:00:04Z",
        content: [makeToolResultContent("toolu-B")],
      }),
      // Signal 2 for main — turn_duration
      makeSystemEvent({
        subtype: "turn_duration",
        timestamp: "2026-01-01T00:00:05Z",
      }),
    ];

    // Hardcoded expected outputs derived from the spec. Dashboard's mirror
    // test file contains the same expectations against its own SessionEvent
    // type. Drift on either side surfaces as a failed expectation here.
    expect(isAgentCompleted("main", events)).toBe(true); // Signal 2
    expect(isAgentCompleted("subA", events)).toBe(true); // Signal 1
    expect(isAgentCompleted("subB", events)).toBe(true); // Signal 3
  });
});
