import { describe, it, expect } from "vitest";
import { buildWorkflowSummary, type WorkflowJournal } from "./workflows.js";
import type { SessionEvent, AssistantEvent } from "../types.js";

function asst(over: { stopReason?: "end_turn" | "tool_use"; model?: string; tools?: number; ts?: string } = {}): AssistantEvent {
  const content = Array.from({ length: over.tools ?? 0 }, (_, i) => ({
    type: "tool_use" as const,
    id: `t${i}`,
    name: "Read",
    input: {},
  }));
  return {
    type: "assistant",
    uuid: "u-" + Math.random().toString(36).slice(2),
    timestamp: over.ts ?? "2026-05-30T00:00:00Z",
    sessionId: "s",
    message: {
      role: "assistant",
      content: content.length ? content : [{ type: "text", text: "hi" }],
      model: over.model ?? "claude-opus-4-8",
      id: "m1",
      type: "message",
      stop_reason: over.stopReason ?? "end_turn",
      usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  };
}

const events = (n: { tools?: number; model?: string }): SessionEvent[] => [asst(n)];

describe("buildWorkflowSummary", () => {
  const journal: WorkflowJournal = {
    id: "wf_abc",
    started: [
      { agentId: "a1", phase: null, label: null },
      { agentId: "a2", phase: null, label: null },
    ],
    results: new Map<string, unknown>([
      ["a1", { area: "server-side flow", summary: "Did the thing across many files" }],
    ]),
  };

  it("marks an agent with a journal result as finished, one without as running (live session)", () => {
    const byId = new Map<string, SessionEvent[]>([
      ["a1", events({ tools: 3 })],
      ["a2", events({ tools: 1 })],
    ]);
    const s = buildWorkflowSummary(journal, byId, true);
    const a1 = s.agents.find((a) => a.agentId === "a1")!;
    const a2 = s.agents.find((a) => a.agentId === "a2")!;
    expect(a1.status).toBe("finished");
    expect(a2.status).toBe("running");
    expect(s.agentCount).toBe(2);
    expect(s.running).toBe(1);
    expect(s.finished).toBe(1);
  });

  it("marks a result-less agent finished when the session is NOT running", () => {
    const byId = new Map<string, SessionEvent[]>([["a1", events({})], ["a2", events({})]]);
    const s = buildWorkflowSummary(journal, byId, false);
    expect(s.agents.find((a) => a.agentId === "a2")!.status).toBe("finished");
    expect(s.running).toBe(0);
    expect(s.finished).toBe(2);
  });

  it("derives a human label from the result JSON (area), falling back to short id", () => {
    const byId = new Map<string, SessionEvent[]>([["a1", events({})], ["a2", events({})]]);
    const s = buildWorkflowSummary(journal, byId, true);
    expect(s.agents.find((a) => a.agentId === "a1")!.label).toBe("server-side flow");
    // a2 has no result → short-id label
    expect(s.agents.find((a) => a.agentId === "a2")!.label).toContain("a2");
  });

  it("computes per-agent model, tokens, and tool calls from the agent's events", () => {
    const byId = new Map<string, SessionEvent[]>([["a1", events({ tools: 3, model: "claude-opus-4-8" })], ["a2", events({})]]);
    const s = buildWorkflowSummary(journal, byId, true);
    const a1 = s.agents.find((a) => a.agentId === "a1")!;
    expect(a1.model).toBe("claude-opus-4-8");
    expect(a1.toolCalls).toBe(3);
    expect(a1.tokens.inputTokens).toBeGreaterThan(0);
  });

  it("returns null phases when the journal has no phase data", () => {
    const byId = new Map<string, SessionEvent[]>([["a1", events({})], ["a2", events({})]]);
    const s = buildWorkflowSummary(journal, byId, true);
    expect(s.phases).toBeNull();
  });

  it("groups by phase and orders agents by phase when phase data is present", () => {
    const phased: WorkflowJournal = {
      id: "wf_ph",
      started: [
        { agentId: "b1", phase: "Diagnose", label: "A:visibility" },
        { agentId: "b2", phase: "Fix", label: "fixer" },
        { agentId: "b3", phase: "Diagnose", label: "B:tension" },
      ],
      results: new Map(),
    };
    const byId = new Map<string, SessionEvent[]>([["b1", events({})], ["b2", events({})], ["b3", events({})]]);
    const s = buildWorkflowSummary(phased, byId, true);
    expect(s.phases).toEqual(["Diagnose", "Fix"]);
    // agents ordered by phase (Diagnose first: b1, b3) then Fix (b2)
    expect(s.agents.map((a) => a.agentId)).toEqual(["b1", "b3", "b2"]);
    expect(s.agents[0].label).toBe("A:visibility");
  });

  it("handles a missing agent-events entry without crashing (zeroed metrics)", () => {
    const s = buildWorkflowSummary(journal, new Map(), true);
    const a1 = s.agents.find((a) => a.agentId === "a1")!;
    expect(a1.toolCalls).toBe(0);
    expect(a1.tokens.inputTokens).toBe(0);
    expect(a1.model).toBeNull();
  });

  it("aggregates total tokens across all of the workflow's agents", () => {
    // each asst() carries input_tokens 10 / output_tokens 5; 2 agents → 20 / 10
    const byId = new Map<string, SessionEvent[]>([["a1", events({})], ["a2", events({})]]);
    const s = buildWorkflowSummary(journal, byId, true);
    expect(s.tokens.inputTokens).toBe(20);
    expect(s.tokens.outputTokens).toBe(10);
  });

  it("computes durationMs as wall-clock from the earliest to the latest agent event", () => {
    const byId = new Map<string, SessionEvent[]>([
      ["a1", [asst({ ts: "2026-05-29T17:11:58.000Z" }), asst({ ts: "2026-05-29T17:13:00.000Z" })]],
      ["a2", [asst({ ts: "2026-05-29T17:12:00.000Z" }), asst({ ts: "2026-05-29T17:15:48.000Z" })]],
    ]);
    const s = buildWorkflowSummary(journal, byId, true);
    // earliest 17:11:58 → latest 17:15:48 = 230s
    expect(s.durationMs).toBe(230_000);
  });

  it("returns null durationMs when no agent events have timestamps", () => {
    const s = buildWorkflowSummary(journal, new Map(), true);
    expect(s.durationMs).toBeNull();
  });
});
