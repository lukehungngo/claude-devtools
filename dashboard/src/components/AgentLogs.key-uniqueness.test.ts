import { describe, it, expect } from "vitest";
import { eventsToLogEntries } from "./AgentLogs";
import type { SessionEvent, AgentNode } from "../lib/types";

describe("AgentLogs key uniqueness (bug fix)", () => {
  const agents: AgentNode[] = [];

  it("produces duplicate uuids when a user event has multiple text content items", () => {
    // A user event with two text content items — both get uuid = event.uuid
    const events: SessionEvent[] = [
      {
        type: "user",
        uuid: "u1",
        timestamp: "2026-03-23T00:00:00Z",
        sessionId: "s1",
        userType: "external",
        message: {
          role: "user",
          content: [
            { type: "text", text: "First message" },
            { type: "text", text: "Second message" },
          ],
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBe(2);

    // Both entries get uuid = "u1" — causes React key warning
    const uuids = entries.map((e) => e.uuid);
    const hasDuplicate = uuids.length !== new Set(uuids).size;
    expect(hasDuplicate).toBe(true);
  });

  it("produces duplicate uuids when assistant event has multiple text blocks", () => {
    // Assistant event with two text content items — both get uuid = `${event.uuid}-text`
    const events: SessionEvent[] = [
      {
        type: "assistant",
        uuid: "a1",
        timestamp: "2026-03-23T00:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "First paragraph" },
            { type: "text", text: "Second paragraph" },
          ],
          model: "claude-opus-4-20250514",
          id: "msg_1",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      },
    ];

    const entries = eventsToLogEntries(events, agents);
    expect(entries.length).toBe(2);

    // Both entries get uuid = "a1-text" — causes React key warning
    const uuids = entries.map((e) => e.uuid);
    const hasDuplicate = uuids.length !== new Set(uuids).size;
    expect(hasDuplicate).toBe(true);
  });
});
