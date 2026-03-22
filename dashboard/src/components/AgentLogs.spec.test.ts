import { describe, it, expect } from "vitest";
import { eventsToLogEntries } from "./AgentLogs";
import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
  QueueOperationEvent,
  AgentNode,
  AggregatedTokens,
} from "../lib/types";

const zeroTokens: AggregatedTokens = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  totalCost: 0,
};

function makeAgent(id: string, type: string): AgentNode {
  return {
    id,
    type,
    tokenUsage: zeroTokens,
    toolCalls: 0,
    mcpToolCalls: 0,
    status: "completed",
  };
}

function makeAssistantEvent(
  content: AssistantEvent["message"]["content"],
  overrides: Partial<AssistantEvent> = {}
): AssistantEvent {
  return {
    type: "assistant",
    uuid: overrides.uuid || "a-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp || "2026-03-23T10:00:00Z",
    sessionId: "s1",
    ...overrides,
    message: {
      role: "assistant",
      content,
      model: "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeUserEvent(
  content: UserEvent["message"]["content"],
  overrides: Partial<UserEvent> = {}
): UserEvent {
  return {
    type: "user",
    uuid: overrides.uuid || "u-" + Math.random().toString(36).slice(2),
    timestamp: overrides.timestamp || "2026-03-23T10:00:00Z",
    sessionId: "s1",
    userType: "external",
    ...overrides,
    message: {
      role: "user",
      content,
    },
  };
}

describe("eventsToLogEntries — SPEC-driven tests", () => {
  describe("transforms assistant events correctly", () => {
    it("transforms tool_use content into log entries", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent([
          {
            type: "tool_use",
            id: "t1",
            name: "Read",
            input: { file_path: "/foo.ts" },
          },
        ]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(1);
      expect(entries[0].toolName).toBe("Read");
      expect(entries[0].message).toContain("Read");
      expect(entries[0].message).toContain("/foo.ts");
    });

    it("transforms text content into log entries", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent([
          { type: "text", text: "Here is the analysis result" },
        ]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toContain("Here is the analysis result");
    });

    it("transforms thinking content into log entries", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent([
          { type: "thinking", thinking: "Let me think about this" },
        ]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(1);
      expect(entries[0].toolName).toBe("thinking");
      expect(entries[0].message).toContain("Let me think about this");
    });
  });

  describe("transforms user events correctly", () => {
    it("transforms tool_result content into log entries", () => {
      const events: SessionEvent[] = [
        makeUserEvent([
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "file contents here",
            is_error: false,
          },
        ]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toContain("file contents here");
    });

    it("transforms user text content into log entries", () => {
      const events: SessionEvent[] = [
        makeUserEvent([{ type: "text", text: "Fix the bug in main.ts" }]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(1);
      expect(entries[0].message).toContain("Fix the bug");
    });

    it("marks error tool_results with isError=true", () => {
      const events: SessionEvent[] = [
        makeUserEvent([
          {
            type: "tool_result",
            tool_use_id: "t1",
            content: "command failed",
            is_error: true,
          },
        ]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries[0].isError).toBe(true);
    });
  });

  describe("transforms queue-operation events", () => {
    it("maps enqueue operation to 'spawn' toolName", () => {
      const events: SessionEvent[] = [
        {
          type: "queue-operation",
          uuid: "q1",
          timestamp: "2026-03-23T10:00:00Z",
          sessionId: "s1",
          operation: "enqueue",
          content: "starting subagent",
        } as QueueOperationEvent,
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(1);
      expect(entries[0].toolName).toBe("spawn");
    });

    it("maps dequeue operation to 'completed' toolName", () => {
      const events: SessionEvent[] = [
        {
          type: "queue-operation",
          uuid: "q2",
          timestamp: "2026-03-23T10:00:00Z",
          sessionId: "s1",
          operation: "dequeue",
          content: "agent finished",
        } as QueueOperationEvent,
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(1);
      expect(entries[0].toolName).toBe("completed");
    });
  });

  describe("skips progress events", () => {
    it("does not produce log entries for progress events", () => {
      const events: SessionEvent[] = [
        {
          type: "progress",
          uuid: "p1",
          timestamp: "2026-03-23T10:00:00Z",
          sessionId: "s1",
          data: { type: "hook" },
        } as SessionEvent,
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries).toHaveLength(0);
    });
  });

  describe("agent attribution", () => {
    it("defaults agentId to 'main' when not specified", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent([{ type: "text", text: "hello" }]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries[0].agentId).toBe("main");
    });

    it("uses event.agentId when specified", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent(
          [{ type: "text", text: "hello" }],
          { agentId: "agent-42" }
        ),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries[0].agentId).toBe("agent-42");
    });

    it("resolves agentType from AgentNode map", () => {
      const agents = [makeAgent("agent-42", "Explore")];
      const events: SessionEvent[] = [
        makeAssistantEvent(
          [{ type: "text", text: "hello" }],
          { agentId: "agent-42" }
        ),
      ];

      const entries = eventsToLogEntries(events, agents);

      expect(entries[0].agentType).toBe("Explore");
    });

    it("falls back to 'main' for unknown agentId", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent(
          [{ type: "text", text: "hello" }],
          { agentId: "unknown-agent" }
        ),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries[0].agentType).toBe("main");
    });
  });

  describe("MCP tool name stripping", () => {
    it("strips mcp__ prefix to show only last segment", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent([
          {
            type: "tool_use",
            id: "t1",
            name: "mcp__devtools__open_dashboard",
            input: {},
          },
        ]),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries[0].toolName).toBe("open_dashboard");
    });
  });

  describe("timestamp preservation", () => {
    it("preserves event timestamp in log entry", () => {
      const events: SessionEvent[] = [
        makeAssistantEvent(
          [{ type: "text", text: "hello" }],
          { timestamp: "2026-03-23T15:30:45Z" }
        ),
      ];

      const entries = eventsToLogEntries(events, []);

      expect(entries[0].timestamp).toBe("2026-03-23T15:30:45Z");
    });
  });
});
