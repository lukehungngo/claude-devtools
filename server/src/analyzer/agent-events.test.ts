import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo, SessionEvent, AssistantEvent, UserEvent, ProgressEvent, QueueOperationEvent } from "../types.js";

// Mock the jsonl-reader and fs modules before importing
vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlFile: vi.fn(() => []),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

import { getAgentEvents } from "./agent-events.js";
import { parseJsonlFile } from "../parser/jsonl-reader.js";
import { existsSync } from "node:fs";

const mockedParseJsonlFile = vi.mocked(parseJsonlFile);
const mockedExistsSync = vi.mocked(existsSync);

function makeSessionInfo(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "test-session",
    projectHash: "abc123",
    path: "/tmp/test.jsonl",
    startTime: "2026-03-23T10:00:00Z",
    lastModified: "2026-03-23T10:05:00Z",
    eventCount: 5,
    subagentCount: 1,
    ...overrides,
  };
}

function makeAssistantEvent(uuid: string, timestamp: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp,
    sessionId: "test-session",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      model: "claude-sonnet-4-6",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  };
}

function makeUserEvent(uuid: string, timestamp: string): UserEvent {
  return {
    type: "user",
    uuid,
    timestamp,
    sessionId: "test-session",
    userType: "external",
    message: {
      role: "user",
      content: [{ type: "text", text: "do something" }],
    },
  };
}

function makeProgressEvent(uuid: string, timestamp: string): ProgressEvent {
  return {
    type: "progress",
    uuid,
    timestamp,
    sessionId: "test-session",
    data: { type: "hook" },
  };
}

function makeQueueEvent(uuid: string, timestamp: string): QueueOperationEvent {
  return {
    type: "queue-operation",
    uuid,
    timestamp,
    sessionId: "test-session",
    operation: "enqueue",
    content: "start agent",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAgentEvents", () => {
  it("returns log entries for main agent from main session file", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent("a1", "2026-03-23T10:00:00Z"),
      makeUserEvent("u1", "2026-03-23T10:00:01Z"),
    ];
    mockedParseJsonlFile.mockReturnValue(events);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result).toHaveLength(2);
    expect(result[0].agentId).toBe("main");
    expect(result[0].eventType).toBe("assistant");
    expect(result[1].eventType).toBe("user");
  });

  it("returns log entries for a subagent from its specific file", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent("a1", "2026-03-23T10:00:00Z"),
    ];
    mockedExistsSync.mockReturnValue(true);
    mockedParseJsonlFile.mockReturnValue(events);

    const result = getAgentEvents(makeSessionInfo(), "sub-1");

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("sub-1");
  });

  it("returns empty array when subagent file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const result = getAgentEvents(makeSessionInfo(), "nonexistent-agent");

    expect(result).toEqual([]);
  });

  it("includes timestamp and uuid in log entries", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent("a1", "2026-03-23T10:00:00Z"),
    ];
    mockedParseJsonlFile.mockReturnValue(events);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result[0].timestamp).toBe("2026-03-23T10:00:00Z");
    expect(result[0].uuid).toBe("a1");
  });

  it("extracts content preview from text content", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent("a1", "2026-03-23T10:00:00Z"),
    ];
    mockedParseJsonlFile.mockReturnValue(events);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result[0].contentPreview).toContain("hello");
  });

  it("extracts content preview from tool_use content", () => {
    const event: AssistantEvent = {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "test-session",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/foo.ts" } },
        ],
        model: "claude-sonnet-4-6",
        id: "msg-1",
        type: "message",
        stop_reason: "tool_use",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    mockedParseJsonlFile.mockReturnValue([event]);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result[0].contentPreview).toContain("Read");
  });

  it("extracts content preview from tool_result content", () => {
    const event: UserEvent = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "test-session",
      userType: "internal",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "file contents here", is_error: false },
        ],
      },
    };
    mockedParseJsonlFile.mockReturnValue([event]);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result[0].contentPreview).toContain("file contents here");
  });

  it("extracts content preview from thinking content", () => {
    const event: AssistantEvent = {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "test-session",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Let me analyze this problem" },
        ],
        model: "claude-sonnet-4-6",
        id: "msg-1",
        type: "message",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    mockedParseJsonlFile.mockReturnValue([event]);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result[0].contentPreview).toContain("thinking");
  });

  it("handles progress events", () => {
    const events: SessionEvent[] = [
      makeProgressEvent("p1", "2026-03-23T10:00:00Z"),
    ];
    mockedParseJsonlFile.mockReturnValue(events);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe("progress");
  });

  it("handles queue-operation events", () => {
    const events: SessionEvent[] = [
      makeQueueEvent("q1", "2026-03-23T10:00:00Z"),
    ];
    mockedParseJsonlFile.mockReturnValue(events);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result).toHaveLength(1);
    expect(result[0].eventType).toBe("queue-operation");
    expect(result[0].contentPreview).toContain("queue");
  });

  it("handles error tool_result with [ERROR] prefix", () => {
    const event: UserEvent = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "test-session",
      userType: "internal",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "command not found", is_error: true },
        ],
      },
    };
    mockedParseJsonlFile.mockReturnValue([event]);

    const result = getAgentEvents(makeSessionInfo(), "main");

    expect(result[0].contentPreview).toContain("ERROR");
  });
});
