import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { computeInsightsBreakdown } from "./breakdown-aggregator.js";
import type { SessionInfo } from "../types.js";

const TEMP_DIRS: string[] = [];

function makeSession(events: object[], overrides: Partial<SessionInfo> = {}): SessionInfo {
  const dir = mkdtempSync(join(tmpdir(), "test-breakdown-"));
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

function assistantEvent(model: string, inputTokens: number, outputTokens: number, toolNames: string[] = []) {
  return {
    type: "assistant",
    uuid: `uuid-${Math.random()}`,
    timestamp: new Date().toISOString(),
    sessionId: "sess-1",
    message: {
      id: "msg-1",
      model,
      role: "assistant",
      stop_reason: "end_turn",
      type: "message",
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      content: [
        { type: "text", text: "response" },
        ...toolNames.map((name) => ({ type: "tool_use", id: `tu-${name}`, name, input: {} })),
      ],
    },
  };
}

afterAll(() => {
  for (const dir of TEMP_DIRS) {
    try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  }
});

describe("computeInsightsBreakdown", () => {
  it("returns empty arrays for no sessions", () => {
    const result = computeInsightsBreakdown([], "7d", "all");
    expect(result.models).toEqual([]);
    expect(result.topRepos).toEqual([]);
    expect(result.topSessions).toEqual([]);
    expect(result.topTools).toEqual([]);
  });

  it("aggregates model token usage across sessions", () => {
    const sessions = [
      makeSession([assistantEvent("claude-sonnet-4-6", 1000, 500)], { id: "s1", cwd: "/a" }),
      makeSession([assistantEvent("claude-sonnet-4-6", 2000, 800)], { id: "s2", cwd: "/b" }),
    ];
    const result = computeInsightsBreakdown(sessions, "all", "all");
    expect(result.models).toHaveLength(1);
    expect(result.models[0].model).toBe("claude-sonnet-4-6");
    expect(result.models[0].tokensIn).toBe(3000);
    expect(result.models[0].tokensOut).toBe(1300);
    expect(result.models[0].turns).toBe(2);
    expect(result.models[0].share).toBeCloseTo(100, 0);
  });

  it("assigns share proportionally across multiple models", () => {
    const sessions = [
      makeSession([
        assistantEvent("claude-sonnet-4-6", 1000, 500),
        assistantEvent("claude-haiku-4-5-20251001", 1000, 500),
      ], { id: "s1" }),
    ];
    const result = computeInsightsBreakdown(sessions, "all", "all");
    expect(result.models).toHaveLength(2);
    const shares = result.models.map((m) => m.share);
    expect(shares[0] + shares[1]).toBeCloseTo(100, 1);
  });

  it("counts tool calls correctly", () => {
    const sessions = [
      makeSession([
        assistantEvent("claude-sonnet-4-6", 100, 50, ["Read", "Read", "Edit"]),
      ], { id: "s1" }),
    ];
    const result = computeInsightsBreakdown(sessions, "all", "all");
    const readTool = result.topTools.find((t) => t.name === "Read");
    const editTool = result.topTools.find((t) => t.name === "Edit");
    expect(readTool?.calls).toBe(2);
    expect(editTool?.calls).toBe(1);
  });

  it("ranks top sessions by cost desc", () => {
    const now = new Date().toISOString();
    const sessions = [
      makeSession([assistantEvent("claude-sonnet-4-6", 100, 50)], { id: "cheap", cwd: "/p", startTime: now }),
      makeSession([assistantEvent("claude-sonnet-4-6", 10000, 5000)], { id: "expensive", cwd: "/p", startTime: now }),
    ];
    const result = computeInsightsBreakdown(sessions, "all", "all");
    expect(result.topSessions[0].id).toBe("expensive");
    expect(result.topSessions[1].id).toBe("cheap");
  });

  it("filters by timeRange", () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const sessions = [
      makeSession([assistantEvent("claude-sonnet-4-6", 1000, 500)], { id: "old", startTime: old }),
    ];
    const result = computeInsightsBreakdown(sessions, "7d", "all");
    expect(result.models).toHaveLength(0);
  });

  it("filters by repo when repo != all", () => {
    const now = new Date().toISOString();
    const sessions = [
      makeSession([assistantEvent("claude-sonnet-4-6", 1000, 500)], { id: "s1", cwd: "/home/user/my-project", startTime: now }),
      makeSession([assistantEvent("claude-sonnet-4-6", 1000, 500)], { id: "s2", cwd: "/home/user/other-project", startTime: now }),
    ];
    const result = computeInsightsBreakdown(sessions, "all", "/home/user/my-project");
    expect(result.topSessions).toHaveLength(1);
    expect(result.topSessions[0].id).toBe("s1");
  });

  it("aggregates repos by cwd", () => {
    const now = new Date().toISOString();
    const sessions = [
      makeSession([assistantEvent("claude-sonnet-4-6", 1000, 500)], { id: "s1", cwd: "/project-a", startTime: now }),
      makeSession([assistantEvent("claude-sonnet-4-6", 2000, 1000)], { id: "s2", cwd: "/project-a", startTime: now }),
      makeSession([assistantEvent("claude-sonnet-4-6", 500, 200)], { id: "s3", cwd: "/project-b", startTime: now }),
    ];
    const result = computeInsightsBreakdown(sessions, "all", "all");
    expect(result.topRepos[0].slug).toBe("/project-a");
    expect(result.topRepos[1].slug).toBe("/project-b");
  });
});
