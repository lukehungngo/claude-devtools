import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { computeInsightsTrends } from "./trends-aggregator.js";
import type { SessionInfo } from "../types.js";

const TEMP_DIRS: string[] = [];

function makeSession(events: object[], overrides: Partial<SessionInfo> = {}): SessionInfo {
  const dir = mkdtempSync(join(tmpdir(), "test-trends-"));
  TEMP_DIRS.push(dir);
  const path = join(dir, "session.jsonl");
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return {
    id: overrides.id ?? "sess-1",
    projectHash: "hash-1",
    path,
    startTime: overrides.startTime ?? new Date().toISOString(),
    lastModified: new Date().toISOString(),
    eventCount: events.length,
    subagentCount: 0,
    cwd: overrides.cwd ?? "/home/user/project",
    ...overrides,
  };
}

function userTextEvent(text: string) {
  return {
    type: "user",
    uuid: `uuid-${Math.random()}`,
    timestamp: new Date().toISOString(),
    sessionId: "sess-1",
    userType: "external",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  };
}

function assistantWithTools(tools: Array<{ name: string; input?: Record<string, unknown> }>, inputTokens = 100, outputTokens = 50) {
  return {
    type: "assistant",
    uuid: `uuid-${Math.random()}`,
    timestamp: new Date().toISOString(),
    sessionId: "sess-1",
    message: {
      id: "msg-1",
      model: "claude-sonnet-4-6",
      role: "assistant",
      stop_reason: "tool_use",
      type: "message",
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      content: tools.map((t) => ({ type: "tool_use", id: `tu-${t.name}`, name: t.name, input: t.input ?? {} })),
    },
  };
}

afterAll(() => {
  for (const dir of TEMP_DIRS) {
    try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  }
});

describe("computeInsightsTrends", () => {
  it("returns empty arrays when no sessions", () => {
    const result = computeInsightsTrends([], "7d", "all");
    expect(result.commands).toEqual([]);
    expect(result.agents).toEqual([]);
    expect(result.skills).toEqual([]);
  });

  it("detects commands from user events starting with /", () => {
    const sessions = [
      makeSession([userTextEvent("/review some code")]),
      makeSession([userTextEvent("/review another thing")]),
      makeSession([userTextEvent("/build the project")]),
    ];
    const result = computeInsightsTrends(sessions, "all", "all");
    const reviewCmd = result.commands.find((c) => c.name === "/review");
    const buildCmd = result.commands.find((c) => c.name === "/build");
    expect(reviewCmd?.calls).toBe(2);
    expect(buildCmd?.calls).toBe(1);
  });

  it("does not count non-command user text as commands", () => {
    const sessions = [
      makeSession([userTextEvent("just a normal message")]),
    ];
    const result = computeInsightsTrends(sessions, "all", "all");
    expect(result.commands).toHaveLength(0);
  });

  it("detects Agent tool invocations", () => {
    const sessions = [
      makeSession([assistantWithTools([{ name: "Agent", input: { subagent_type: "engineer", description: "do stuff" } }])]),
      makeSession([assistantWithTools([{ name: "Agent", input: { subagent_type: "engineer", description: "do more" } }])]),
    ];
    const result = computeInsightsTrends(sessions, "all", "all");
    expect(result.agents.length).toBeGreaterThan(0);
    const engineerAgent = result.agents.find((a) => a.name.toLowerCase().includes("engineer"));
    expect(engineerAgent?.calls).toBe(2);
  });

  it("detects Skill tool invocations", () => {
    const sessions = [
      makeSession([assistantWithTools([{ name: "Skill", input: { skill: "verification" } }])]),
      makeSession([assistantWithTools([{ name: "Skill", input: { skill: "verification" } }])]),
      makeSession([assistantWithTools([{ name: "Skill", input: { skill: "tdd" } }])]),
    ];
    const result = computeInsightsTrends(sessions, "all", "all");
    const verifySkill = result.skills.find((s) => s.name === "verification");
    const tddSkill = result.skills.find((s) => s.name === "tdd");
    expect(verifySkill?.calls).toBe(2);
    expect(tddSkill?.calls).toBe(1);
  });

  it("filters by timeRange", () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = [
      makeSession([userTextEvent("/review old")], { startTime: old }),
    ];
    const result = computeInsightsTrends(sessions, "7d", "all");
    expect(result.commands).toHaveLength(0);
  });

  it("verdict is stable for single-week data", () => {
    const sessions = [makeSession([userTextEvent("/review")])];
    const result = computeInsightsTrends(sessions, "all", "all");
    if (result.commands.length > 0) {
      expect(result.commands[0].verdict).toBe("stable");
    }
  });

  it("produces weekly array with at least one entry per week bucket", () => {
    const sessions = [makeSession([userTextEvent("/review")])];
    const result = computeInsightsTrends(sessions, "7d", "all");
    if (result.commands.length > 0) {
      expect(result.commands[0].weekly.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("cache invalidation", () => {
  it("P2-1: returns fresh data when file is rewritten with same size but different content (mtime changed)", () => {
    const dir = mkdtempSync(join(tmpdir(), "test-trends-cache-"));
    TEMP_DIRS.push(dir);
    const path = join(dir, "session.jsonl");

    // Write file with /review command, set mtime to t=1000
    const event1 = JSON.stringify(userTextEvent("/review"));
    writeFileSync(path, event1 + "\n");
    utimesSync(path, new Date(1000), new Date(1000));

    const session: SessionInfo = {
      id: "cache-test-1",
      projectHash: "hash-cache",
      path,
      startTime: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      eventCount: 1,
      subagentCount: 0,
      cwd: "/home/user/proj",
    };

    // Prime the cache
    const result1 = computeInsightsTrends([session], "all", "all");
    expect(result1.commands.find((c) => c.name === "/review")?.calls).toBe(1);

    // Rewrite with SAME byte length but /build command, and advance mtime to t=2000
    const event2 = JSON.stringify(userTextEvent("/build"));
    // Pad to same byte length as event1 so fileSize doesn't change
    const padded = event2.padEnd(event1.length, " ");
    writeFileSync(path, padded + "\n");
    utimesSync(path, new Date(2000), new Date(2000));

    // Must see /build, not /review — cache must have been invalidated
    const result2 = computeInsightsTrends([session], "all", "all");
    expect(result2.commands.find((c) => c.name === "/build")).toBeDefined();
    expect(result2.commands.find((c) => c.name === "/review")).toBeUndefined();
  });

  it("P2-2: does not return stale entries when file is truncated", () => {
    const dir = mkdtempSync(join(tmpdir(), "test-trends-trunc-"));
    TEMP_DIRS.push(dir);
    const path = join(dir, "session.jsonl");

    // Write file with /review command
    const event1 = JSON.stringify(userTextEvent("/review"));
    writeFileSync(path, event1 + "\n");

    const session: SessionInfo = {
      id: "trunc-test-1",
      projectHash: "hash-trunc",
      path,
      startTime: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      eventCount: 1,
      subagentCount: 0,
      cwd: "/home/user/proj2",
    };

    // Prime the cache
    const result1 = computeInsightsTrends([session], "all", "all");
    expect(result1.commands.find((c) => c.name === "/review")?.calls).toBe(1);

    // Truncate to smaller file containing /build (completely different command, smaller file)
    const event2 = JSON.stringify(userTextEvent("/build"));
    writeFileSync(path, event2 + "\n");

    // Must see /build, not the stale /review
    const result2 = computeInsightsTrends([session], "all", "all");
    expect(result2.commands.find((c) => c.name === "/build")).toBeDefined();
    expect(result2.commands.find((c) => c.name === "/review")).toBeUndefined();
  });
});

describe("linear regression verdict", () => {
  it("improving trend detected when values increase week over week", async () => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    const sessions = [
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 3.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 2.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 2.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 1.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 1.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 1.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 0.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 0.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 0.5 * week).toISOString() }),
      makeSession([userTextEvent("/review")], { startTime: new Date(now - 0.5 * week).toISOString() }),
    ];
    const result = computeInsightsTrends(sessions, "30d", "all");
    const cmd = result.commands.find((c) => c.name === "/review");
    expect(cmd?.verdict).toBe("improving");
  });
});
