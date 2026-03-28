import { describe, it, expect } from "vitest";
import { extractSessionIdFromPath, buildNewEventsMessage, buildNewSessionMessage } from "./watcher.js";

describe("extractSessionIdFromPath", () => {
  it("extracts session ID from main JSONL file path", () => {
    const path =
      "/Users/test/.claude/projects/abc123/session-uuid-here.jsonl";
    expect(extractSessionIdFromPath(path)).toBe("session-uuid-here");
  });

  it("extracts session ID from subagent JSONL file path", () => {
    const path =
      "/Users/test/.claude/projects/abc123/session-uuid-here/subagents/agent-sub1.jsonl";
    expect(extractSessionIdFromPath(path)).toBe("session-uuid-here");
  });

  it("returns basename without .jsonl for unknown paths", () => {
    const path = "/some/other/path/myfile.jsonl";
    expect(extractSessionIdFromPath(path)).toBe("myfile");
  });

  it("handles paths with subagents directory correctly", () => {
    const path =
      "/home/user/.claude/projects/hash/my-session/subagents/agent-xyz.jsonl";
    expect(extractSessionIdFromPath(path)).toBe("my-session");
  });
});

describe("buildNewEventsMessage", () => {
  it("includes sessionId extracted from main session file path", () => {
    const filePath = "/Users/test/.claude/projects/abc123/session-uuid-here.jsonl";
    const events: import("../types.js").SessionEvent[] = [];
    const msg = buildNewEventsMessage(filePath, events);
    expect(msg).toEqual({
      type: "new-events",
      filePath,
      sessionId: "session-uuid-here",
      events: [],
    });
  });

  it("includes sessionId extracted from subagent file path", () => {
    const filePath = "/Users/test/.claude/projects/abc123/my-session/subagents/agent-sub1.jsonl";
    const events: import("../types.js").SessionEvent[] = [];
    const msg = buildNewEventsMessage(filePath, events);
    expect(msg).toEqual({
      type: "new-events",
      filePath,
      sessionId: "my-session",
      events: [],
    });
  });
});

describe("buildNewSessionMessage", () => {
  it("includes sessionId extracted from file path", () => {
    const filePath = "/Users/test/.claude/projects/abc123/new-session.jsonl";
    const msg = buildNewSessionMessage(filePath);
    expect(msg).toEqual({
      type: "new-session",
      filePath,
      sessionId: "new-session",
    });
  });

  it("includes sessionId extracted from subagent file path", () => {
    const filePath = "/home/user/.claude/projects/hash/parent-sess/subagents/agent-abc.jsonl";
    const msg = buildNewSessionMessage(filePath);
    expect(msg).toEqual({
      type: "new-session",
      filePath,
      sessionId: "parent-sess",
    });
  });
});
