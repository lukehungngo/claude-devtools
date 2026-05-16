import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAgentCompleted, getAgentStatus } from "./agentStatus";
import type {
  SessionEvent,
  UserEvent,
  AssistantEvent,
  SystemEvent,
  ContentItem,
} from "./types";

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
  } as AssistantEvent;
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
  } as UserEvent;
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
  } as SystemEvent;
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
      // Main dispatches subA
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
      // subA runs, never end_turns
      makeAssistantEvent({
        agentId: "subA",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      // Main acks subA by tool_use_id=abc
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
      // Main dispatches X
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
      // subagent X runs (temporal-proximity match: first sidechain after main's
      // Task tool_use with matching/new agentId)
      makeAssistantEvent({
        agentId: "X",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      // Main dispatches Y (hypothetical concurrent — Claude Code is blocking
      // today, but the predicate must not false-positive if it ever changes).
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
      // subagent Y runs and finishes with end_turn
      makeAssistantEvent({
        agentId: "Y",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:03Z",
        stopReason: "end_turn",
      }),
      // Main acks Y only (tool_use_id = abcY, NOT abcX)
      makeUserEvent({
        timestamp: "2026-01-01T00:00:04Z",
        content: [makeToolResultContent("abcY")],
      }),
    ];
    // Y is completed via Signal 1 (own end_turn) regardless of Signal 3.
    expect(isAgentCompleted("Y", events)).toBe(true);
    // X has a dispatching tool_use (abcX) we can resolve via temporal proximity.
    // Strict Signal 3 requires tool_result.tool_use_id === "abcX" — there isn't
    // one, so X is NOT acknowledged. Weak form would have false-positived here.
    expect(isAgentCompleted("X", events)).toBe(false);
  });

  it("T-SIG3-STRICT-3 subagent with no attributable dispatching tool_use → weak fallback applies", () => {
    // Safety net: if no main Task tool_use can be temporally bound to this
    // agentId (no tool_use dispatching it, or the tool_use is outside the
    // event window due to streaming batch boundary), fall back to the weak
    // form — any tool_result postdating the subagent's last event counts.
    const events: SessionEvent[] = [
      // Subagent's last event — no preceding Task tool_use in the window
      makeAssistantEvent({
        agentId: "orphan",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:01Z",
        stopReason: "tool_use",
      }),
      // Main emits SOME tool_result later (for an unrelated tool).
      // Weak fallback: postdates subagent's last event → acknowledged.
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

// ─── R-1: structured parent_tool_use_id replaces temporal heuristic ──
//
// When the SDK sets parent_tool_use_id on the sidechain event, dispatcher
// attribution becomes authoritative — no temporal window required. These
// tests pin the contract:
//   (a) structured field present → temporal scan is bypassed entirely.
//   (b) mixed events → structured wins where present, temporal where absent.
//   (c) stress (3 concurrent dispatches, sidechain timestamps > 5s past the
//       main tool_use): temporal would mis-attribute; structured doesn't.

describe("isAgentCompleted — Signal 3 structured parent_tool_use_id (R-1)", () => {
  it("T-SIG3-STRUCT-1: parent_tool_use_id wins over temporal window (sidechain ts > 5s after main)", () => {
    // Main tool_use at T=0; subA sidechain at T=10s (well outside the 5s
    // temporal window). Without the structured field this would NOT bind to
    // toolu-struct via the temporal scan. With parent_tool_use_id set, the
    // dispatcher resolves and the matching tool_result acks subA.
    const events: SessionEvent[] = [
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          {
            type: "tool_use",
            id: "toolu-struct",
            name: "Task",
            input: { description: "structured dispatch" },
          },
        ],
        stopReason: "tool_use",
      }),
      // Sidechain assistant 10s later (outside 5s temporal window) with
      // structured parent_tool_use_id pointing at the dispatching tool_use.
      {
        ...makeAssistantEvent({
          agentId: "subA",
          isSidechain: true,
          timestamp: "2026-01-01T00:00:10Z",
          stopReason: "tool_use",
        }),
        parent_tool_use_id: "toolu-struct",
      } as AssistantEvent,
      // Main acks subA by tool_use_id=toolu-struct
      makeUserEvent({
        timestamp: "2026-01-01T00:00:11Z",
        content: [makeToolResultContent("toolu-struct")],
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
  });

  it("T-SIG3-STRUCT-2: mixed — structured wins for subA, temporal still works for subB", () => {
    // Two dispatches in the same turn. subA has structured parent_tool_use_id.
    // subB has none, but its sidechain arrives inside the 5s temporal window
    // and gets attributed via the fallback. Both acks present → both completed.
    const events: SessionEvent[] = [
      // Main dispatches subA (structured-attributable)
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          {
            type: "tool_use",
            id: "toolu-A",
            name: "Task",
            input: { description: "A work" },
          },
          {
            type: "tool_use",
            id: "toolu-B",
            name: "Task",
            input: { description: "B work" },
          },
        ],
        stopReason: "tool_use",
      }),
      // subA: structured field 10s later (outside temporal window)
      {
        ...makeAssistantEvent({
          agentId: "subA",
          isSidechain: true,
          timestamp: "2026-01-01T00:00:10Z",
          stopReason: "tool_use",
        }),
        parent_tool_use_id: "toolu-A",
      } as AssistantEvent,
      // subB: no structured field, sidechain at T=2s (inside 5s window)
      makeAssistantEvent({
        agentId: "subB",
        isSidechain: true,
        timestamp: "2026-01-01T00:00:02Z",
        stopReason: "tool_use",
      }),
      // Acks for both
      makeUserEvent({
        timestamp: "2026-01-01T00:00:15Z",
        content: [makeToolResultContent("toolu-A")],
      }),
      makeUserEvent({
        timestamp: "2026-01-01T00:00:16Z",
        content: [makeToolResultContent("toolu-B")],
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
    expect(isAgentCompleted("subB", events)).toBe(true);
  });

  it("T-SIG3-STRUCT-3: stress — 3 concurrent dispatches with > 5s flush delay, structured field disambiguates", () => {
    // Three Task dispatches in one main assistant turn. JSONL flush is delayed
    // > 5s for every sidechain (timestamps T+10s..T+12s), so the temporal scan
    // would bind each sidechain to no dispatcher (all main tool_uses are > 5s
    // away). Concretely: the temporal path's `result` set for any of subA/B/C
    // would be empty — Signal 3 strict form would fail and fall to the weak
    // postdating ack, which would mis-attribute (any ack would close any
    // subagent).
    //
    // With the structured field, every sidechain carries the exact dispatching
    // tool_use.id, so each subagent's `dispatchingToolUseIds` resolves
    // correctly. Only the matching ack closes the matching subagent.
    const events: SessionEvent[] = [
      // Main dispatches A, B, C simultaneously
      makeAssistantEvent({
        timestamp: "2026-01-01T00:00:00Z",
        content: [
          { type: "tool_use", id: "tu-A", name: "Task", input: { description: "A" } },
          { type: "tool_use", id: "tu-B", name: "Task", input: { description: "B" } },
          { type: "tool_use", id: "tu-C", name: "Task", input: { description: "C" } },
        ],
        stopReason: "tool_use",
      }),
      // All sidechains flush > 5s later (outside the temporal window)
      {
        ...makeAssistantEvent({
          agentId: "subA",
          isSidechain: true,
          timestamp: "2026-01-01T00:00:10Z",
          stopReason: "tool_use",
        }),
        parent_tool_use_id: "tu-A",
      } as AssistantEvent,
      {
        ...makeAssistantEvent({
          agentId: "subB",
          isSidechain: true,
          timestamp: "2026-01-01T00:00:11Z",
          stopReason: "tool_use",
        }),
        parent_tool_use_id: "tu-B",
      } as AssistantEvent,
      {
        ...makeAssistantEvent({
          agentId: "subC",
          isSidechain: true,
          timestamp: "2026-01-01T00:00:12Z",
          stopReason: "tool_use",
        }),
        parent_tool_use_id: "tu-C",
      } as AssistantEvent,
      // Only A and C are acked; B is still in flight.
      makeUserEvent({
        timestamp: "2026-01-01T00:00:20Z",
        content: [makeToolResultContent("tu-A"), makeToolResultContent("tu-C")],
      }),
    ];
    expect(isAgentCompleted("subA", events)).toBe(true);
    expect(isAgentCompleted("subC", events)).toBe(true);
    // subB has NO matching ack — structured form must NOT fall back to the
    // weak postdating ack (which would let tu-A or tu-C's ack close subB).
    expect(isAgentCompleted("subB", events)).toBe(false);
  });
});
