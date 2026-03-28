import { describe, it, expect } from "vitest";
import { extractSessionIdFromPath } from "./watcher.js";

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
