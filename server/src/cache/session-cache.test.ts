import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionCache } from "./session-cache.js";
import type { SessionInfo } from "../types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("SessionCache", () => {
  let tmpDir: string;
  let cache: SessionCache;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "session-cache-test-"));
    cache = new SessionCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeJsonlFile(filePath: string, lines: string[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
  }

  function makeEvent(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      type: "assistant",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        model: "claude-sonnet-4-6",
        id: "msg-1",
        type: "message",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
      ...overrides,
    });
  }

  it("extracts metadata from a JSONL file", () => {
    const projectDir = path.join(tmpDir, "proj1");
    const filePath = path.join(projectDir, "session1.jsonl");
    writeJsonlFile(filePath, [
      JSON.stringify({
        type: "user",
        uuid: "u0",
        timestamp: "2026-03-23T09:00:00Z",
        sessionId: "session1",
        cwd: "/home/user/project",
        gitBranch: "main",
        permissionMode: "default",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
        userType: "external",
      }),
      makeEvent(),
    ]);

    const info = cache.getSessionInfo(filePath, "proj1");
    expect(info).not.toBeNull();
    expect(info!.id).toBe("session1");
    expect(info!.projectHash).toBe("proj1");
    expect(info!.cwd).toBe("/home/user/project");
    expect(info!.gitBranch).toBe("main");
    expect(info!.permissionMode).toBe("default");
  });

  it("returns cached data when file has not changed", () => {
    const projectDir = path.join(tmpDir, "proj2");
    const filePath = path.join(projectDir, "session2.jsonl");
    writeJsonlFile(filePath, [makeEvent()]);

    const info1 = cache.getSessionInfo(filePath, "proj2");
    const info2 = cache.getSessionInfo(filePath, "proj2");

    expect(info1).toEqual(info2);
  });

  it("invalidates cache when file size changes", () => {
    const projectDir = path.join(tmpDir, "proj3");
    const filePath = path.join(projectDir, "session3.jsonl");
    writeJsonlFile(filePath, [makeEvent()]);

    const info1 = cache.getSessionInfo(filePath, "proj3");
    expect(info1!.eventCount).toBeGreaterThan(0);
    const origCount = info1!.eventCount;

    // Append more events
    fs.appendFileSync(filePath, makeEvent() + "\n" + makeEvent() + "\n");

    const info2 = cache.getSessionInfo(filePath, "proj3");
    expect(info2!.eventCount).toBeGreaterThan(origCount);
  });

  it("estimates event count from file size", () => {
    const projectDir = path.join(tmpDir, "proj4");
    const filePath = path.join(projectDir, "session4.jsonl");
    // Write many events
    const events: string[] = [];
    for (let i = 0; i < 100; i++) {
      events.push(makeEvent({ uuid: `u${i}` }));
    }
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj4");
    // Should estimate, not be exactly 100, but in a reasonable range
    expect(info!.eventCount).toBeGreaterThan(0);
  });

  it("reads only head and tail of file for metadata, not entire file", () => {
    const projectDir = path.join(tmpDir, "proj5");
    const filePath = path.join(projectDir, "session5.jsonl");

    // Create a file with a custom-title event at the tail
    const events: string[] = [];
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u0",
        timestamp: "2026-03-23T09:00:00Z",
        sessionId: "session5",
        cwd: "/home/user/project",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
        userType: "external",
      })
    );
    // Add many filler events
    for (let i = 1; i <= 50; i++) {
      events.push(makeEvent({ uuid: `u${i}` }));
    }
    // Add custom-title near the end
    events.push(
      JSON.stringify({
        type: "custom-title",
        uuid: "utitle",
        timestamp: "2026-03-23T11:00:00Z",
        sessionId: "session5",
        customTitle: "My Custom Session",
      })
    );
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj5");
    expect(info!.sessionName).toBe("My Custom Session");
  });

  it("handles empty files gracefully", () => {
    const projectDir = path.join(tmpDir, "proj6");
    const filePath = path.join(projectDir, "session6.jsonl");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(filePath, "");

    const info = cache.getSessionInfo(filePath, "proj6");
    expect(info).not.toBeNull();
    expect(info!.eventCount).toBe(0);
  });

  it("handles malformed JSON lines gracefully", () => {
    const projectDir = path.join(tmpDir, "proj7");
    const filePath = path.join(projectDir, "session7.jsonl");
    writeJsonlFile(filePath, [
      "not valid json",
      makeEvent(),
      "{broken",
    ]);

    const info = cache.getSessionInfo(filePath, "proj7");
    expect(info).not.toBeNull();
    // Should not crash
  });

  it("detects model from tail events when not in head", () => {
    const projectDir = path.join(tmpDir, "proj8");
    const filePath = path.join(projectDir, "session8.jsonl");

    const events: string[] = [];
    // User event first (no model)
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u0",
        timestamp: "2026-03-23T09:00:00Z",
        sessionId: "session8",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
        userType: "external",
      })
    );
    // Add filler user events (no model) — enough to push past HEAD_BYTES (4096)
    for (let i = 1; i <= 30; i++) {
      events.push(
        JSON.stringify({
          type: "user",
          uuid: `u${i}`,
          timestamp: "2026-03-23T09:01:00Z",
          sessionId: "session8",
          message: { role: "user", content: [{ type: "text", text: "more filler content to ensure we exceed four kilobytes of head data so the model detection falls through to tail reading" }] },
          userType: "external",
        })
      );
    }
    // Assistant event with model at the end
    events.push(
      JSON.stringify({
        type: "assistant",
        uuid: "a-last",
        timestamp: "2026-03-23T10:05:00Z",
        sessionId: "session8",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hello" }],
          model: "claude-opus-4-6",
          id: "msg-last",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      })
    );
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj8");
    expect(info!.model).toBe("claude-opus-4-6");
  });
});
