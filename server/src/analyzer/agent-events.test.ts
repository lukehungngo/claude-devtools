import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo, SessionEvent, AssistantEvent, UserEvent, ProgressEvent, QueueOperationEvent } from "../types.js";

// Mock the jsonl-reader and fs modules before importing
vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlFile: vi.fn(() => []),
}));

vi.mock("../parser/session-discovery.js", () => ({
  getClaudeProjectsDir: () => "/projects",
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  // statSync returns a unique (mtimeMs,size) per call so the module-level
  // entry cache in getAgentEvents always misses across tests (no stale-cache
  // contamination); parseJsonlFile (also mocked) is therefore always consulted.
  let n = 0;
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ mtimeMs: ++n, size: ++n })),
  };
});

import { getAgentEvents } from "./agent-events.js";
import { parseJsonlFile } from "../parser/jsonl-reader.js";
import { existsSync, readdirSync } from "node:fs";

const mockedParseJsonlFile = vi.mocked(parseJsonlFile);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);

/** Minimal Dirent for readdirSync({ withFileTypes: true }) mocks. */
function dirent(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir } as unknown as import("node:fs").Dirent;
}

/**
 * Make readdirSync resolve a subagent transcript at a given path layout.
 * `layout` maps a directory-path suffix → its entries.
 */
function mockTree(layout: Array<{ endsWith: string; entries: ReturnType<typeof dirent>[] }>) {
  mockedReaddirSync.mockImplementation((p: Parameters<typeof readdirSync>[0]) => {
    const s = String(p);
    for (const { endsWith, entries } of layout) {
      if (s.endsWith(endsWith)) return entries as unknown as ReturnType<typeof readdirSync>;
    }
    return [] as unknown as ReturnType<typeof readdirSync>;
  });
}

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

  it("returns log entries for a flat subagent (subagents/agent-<id>.jsonl)", () => {
    const events: SessionEvent[] = [
      makeAssistantEvent("a1", "2026-03-23T10:00:00Z"),
    ];
    mockedExistsSync.mockReturnValue(true);
    mockedParseJsonlFile.mockReturnValue(events);
    mockTree([
      { endsWith: "/projects", entries: [dirent("abc123", true)] },
      { endsWith: "/subagents", entries: [dirent("agent-sub-1.jsonl", false)] },
    ]);

    const result = getAgentEvents(makeSessionInfo(), "sub-1");

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("sub-1");
  });

  it("finds a NESTED workflow subagent (subagents/workflows/<wf>/agent-<id>.jsonl)", () => {
    // Regression: workflow-dispatched child nodes returned an empty log because
    // the lookup only checked the flat subagents/ path. [2026-05-30]
    const events: SessionEvent[] = [
      makeAssistantEvent("w1", "2026-03-23T10:00:00Z"),
    ];
    mockedExistsSync.mockReturnValue(true);
    mockedParseJsonlFile.mockReturnValue(events);
    mockTree([
      { endsWith: "/projects", entries: [dirent("abc123", true)] },
      { endsWith: "/subagents", entries: [dirent("workflows", true)] },
      { endsWith: "/workflows", entries: [dirent("wf_x", true)] },
      { endsWith: "/wf_x", entries: [dirent("agent-wf-agent-1.jsonl", false)] },
    ]);

    const result = getAgentEvents(makeSessionInfo(), "wf-agent-1");

    expect(result).toHaveLength(1);
    expect(result[0].agentId).toBe("wf-agent-1");
  });

  it("returns empty array when the subagent file is not found anywhere", () => {
    mockedExistsSync.mockReturnValue(true);
    mockTree([
      { endsWith: "/projects", entries: [dirent("abc123", true)] },
      { endsWith: "/subagents", entries: [dirent("agent-someone-else.jsonl", false)] },
    ]);

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

  it("includes the FULL untruncated content (with newlines) in the `content` field", () => {
    const longText = "L".repeat(300) + "\nsecond line";
    const event: AssistantEvent = {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "test-session",
      message: {
        role: "assistant",
        content: [{ type: "text", text: longText }],
        model: "claude-sonnet-4-6",
        id: "msg-1",
        type: "message",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    mockedParseJsonlFile.mockReturnValue([event]);

    const result = getAgentEvents(makeSessionInfo(), "main");

    // contentPreview stays truncated (≤120 + no newlines); content is the full text.
    expect(result[0].contentPreview.length).toBeLessThanOrEqual(120);
    expect(result[0].content).toBe(longText);
    expect(result[0].content).toContain("\nsecond line");
    expect(result[0].content.length).toBeGreaterThan(300);
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
