import { describe, it, expect } from "vitest";
import { detectWastedRetries } from "../wasted-retries.js";
import type { SessionWithEvents } from "../types.js";
import type { SessionInfo, AssistantEvent } from "../../../types.js";

function makeToolUse(name: string, input: Record<string, unknown>, uuid: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    sessionId: "test-session",
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: `tu_${uuid}`, name, input }],
      model: "claude-sonnet-4-6",
      id: `msg_${uuid}`,
      type: "message",
      stop_reason: "tool_use",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeSession(id: string, events: AssistantEvent[]): SessionWithEvents {
  return {
    info: { id, projectHash: "proj", path: `/tmp/${id}.jsonl`, startTime: new Date().toISOString(), lastModified: new Date().toISOString(), eventCount: events.length, subagentCount: 0 } as SessionInfo,
    mainEvents: events,
  };
}

describe("detectWastedRetries", () => {
  it("flags 3 consecutive identical tool calls as a retry loop", () => {
    const events = [
      makeToolUse("Bash", { command: "npm test" }, "1"),
      makeToolUse("Bash", { command: "npm test" }, "2"),
      makeToolUse("Bash", { command: "npm test" }, "3"),
    ];
    const result = detectWastedRetries([makeSession("s1", events)]);
    expect(result.detected).toBe(true);
    expect(result.category).toBe("wasted_retries");
    expect(result.evidence.sessions).toHaveLength(1);
  });

  it("does not flag 2 consecutive calls (below threshold)", () => {
    const events = [
      makeToolUse("Bash", { command: "npm test" }, "1"),
      makeToolUse("Bash", { command: "npm test" }, "2"),
    ];
    const result = detectWastedRetries([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("does not flag different commands", () => {
    const events = [
      makeToolUse("Bash", { command: "npm test" }, "1"),
      makeToolUse("Bash", { command: "npm run build" }, "2"),
      makeToolUse("Bash", { command: "npm test" }, "3"),
    ];
    const result = detectWastedRetries([makeSession("s1", events)]);
    expect(result.detected).toBe(false);
  });

  it("returns not detected for empty sessions", () => {
    const result = detectWastedRetries([]);
    expect(result.detected).toBe(false);
    expect(result.category).toBe("wasted_retries");
  });
});
