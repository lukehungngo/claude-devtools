import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionCache, RUNNING_THRESHOLD_MS } from "./session-cache.js";

it("exports RUNNING_THRESHOLD_MS as 2 minutes", () => {
  expect(RUNNING_THRESHOLD_MS).toBe(2 * 60 * 1000);
});
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

  // T-REPO-3: gitBranch extraction prefers the most recent event.
  // Previously extracted only from the first 10 head lines — stale for long-lived
  // sessions whose branch changed over time.
  it("detects most recent gitBranch from tail (not first-seen in head)", () => {
    const projectDir = path.join(tmpDir, "proj9");
    const filePath = path.join(projectDir, "session9.jsonl");

    const events: string[] = [];
    // First event with the "stale" branch.
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u0",
        timestamp: "2026-03-23T09:00:00Z",
        sessionId: "session9",
        cwd: "/Users/soh/project",
        gitBranch: "feat/demo-catch-up",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
        userType: "external",
      })
    );
    // Large filler events to push past HEAD_BYTES (4096).
    for (let i = 1; i <= 30; i++) {
      events.push(
        JSON.stringify({
          type: "user",
          uuid: `u${i}`,
          timestamp: "2026-03-23T09:01:00Z",
          sessionId: "session9",
          cwd: "/Users/soh/project",
          gitBranch: "feat/demo-catch-up",
          message: { role: "user", content: [{ type: "text", text: "padding content repeated enough times to ensure we exceed four kilobytes of head so that we are forced into the tail scan for the most recent branch" }] },
          userType: "external",
        })
      );
    }
    // Most recent event — on "master".
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u-last",
        timestamp: "2026-03-23T10:05:00Z",
        sessionId: "session9",
        cwd: "/Users/soh/project",
        gitBranch: "master",
        message: { role: "user", content: [{ type: "text", text: "newest" }] },
        userType: "external",
      })
    );
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj9");
    expect(info!.gitBranch).toBe("master");
  });

  // FU-2: entrypoint reflects the MOST RECENT seen value, not the first.
  // A session retired as `cli` and resumed as `sdk-cli` must report `sdk-cli`.
  it("FU-2: entrypoint reflects most-recent tail value when head and tail differ", () => {
    const projectDir = path.join(tmpDir, "proj-fu2");
    const filePath = path.join(projectDir, "session-fu2.jsonl");

    const events: string[] = [];
    // Head event carries the original entrypoint.
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u0",
        timestamp: "2026-05-15T09:00:00Z",
        sessionId: "session-fu2",
        cwd: "/Users/soh/proj",
        gitBranch: "main",
        entrypoint: "cli",
        message: { role: "user", content: [{ type: "text", text: "first" }] },
        userType: "external",
      })
    );
    // Filler events pushing past HEAD_BYTES (4096) so the tail scan must run.
    for (let i = 1; i <= 30; i++) {
      events.push(
        JSON.stringify({
          type: "user",
          uuid: `u${i}`,
          timestamp: "2026-05-15T09:01:00Z",
          sessionId: "session-fu2",
          cwd: "/Users/soh/proj",
          gitBranch: "main",
          entrypoint: "cli",
          message: { role: "user", content: [{ type: "text", text: "padding content repeated to ensure we exceed four kilobytes of head data so entrypoint detection falls through to the tail scan" }] },
          userType: "external",
        })
      );
    }
    // Most-recent event: resumed under a different entrypoint.
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u-last",
        timestamp: "2026-05-15T11:00:00Z",
        sessionId: "session-fu2",
        cwd: "/Users/soh/proj",
        gitBranch: "main",
        entrypoint: "sdk-cli",
        message: { role: "user", content: [{ type: "text", text: "newest" }] },
        userType: "external",
      })
    );
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj-fu2");
    expect(info!.entrypoint).toBe("sdk-cli");
  });

  it("FU-2: falls back to head entrypoint when tail has none (back-compat)", () => {
    const projectDir = path.join(tmpDir, "proj-fu2b");
    const filePath = path.join(projectDir, "session-fu2b.jsonl");

    const events: string[] = [];
    // Head event carries the entrypoint.
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u0",
        timestamp: "2026-05-15T09:00:00Z",
        sessionId: "session-fu2b",
        cwd: "/Users/soh/proj",
        gitBranch: "main",
        entrypoint: "cli",
        message: { role: "user", content: [{ type: "text", text: "first" }] },
        userType: "external",
      })
    );
    // Filler events (no entrypoint) pushing past HEAD_BYTES so the tail scan runs
    // but finds no entrypoint value.
    for (let i = 1; i <= 30; i++) {
      events.push(
        JSON.stringify({
          type: "user",
          uuid: `u${i}`,
          timestamp: "2026-05-15T09:01:00Z",
          sessionId: "session-fu2b",
          cwd: "/Users/soh/proj",
          gitBranch: "main",
          message: { role: "user", content: [{ type: "text", text: "padding content repeated to ensure we exceed four kilobytes of head data so tail scan executes but finds no entrypoint" }] },
          userType: "external",
        })
      );
    }
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj-fu2b");
    expect(info!.entrypoint).toBe("cli");
  });

  it("extracts cwd from tail when head has no cwd-bearing events", () => {
    const projectDir = path.join(tmpDir, "proj10");
    const filePath = path.join(projectDir, "session10.jsonl");

    const events: string[] = [];
    // Head event — intentionally no cwd/gitBranch (e.g. permission-mode event).
    events.push(
      JSON.stringify({
        type: "permission-mode",
        uuid: "p0",
        timestamp: "2026-03-23T09:00:00Z",
        sessionId: "session10",
        permissionMode: "default",
      })
    );
    // Large filler events — still no cwd in head.
    for (let i = 1; i <= 30; i++) {
      events.push(
        JSON.stringify({
          type: "system",
          uuid: `s${i}`,
          timestamp: "2026-03-23T09:01:00Z",
          sessionId: "session10",
          subtype: "note",
          message: "padding content repeated many times to push past head bytes four kilobytes so cwd detection falls through to tail scan",
        })
      );
    }
    // Most recent event with cwd populated.
    events.push(
      JSON.stringify({
        type: "user",
        uuid: "u-last",
        timestamp: "2026-03-23T10:05:00Z",
        sessionId: "session10",
        cwd: "/Users/soh/working/foo-bar-baz",
        gitBranch: "main",
        message: { role: "user", content: [{ type: "text", text: "newest" }] },
        userType: "external",
      })
    );
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj10");
    expect(info!.cwd).toBe("/Users/soh/working/foo-bar-baz");
    expect(info!.gitBranch).toBe("main");
  });

  // T-TAIL-1 through T-TAIL-4: regression tests for backward tail scan.
  // Empirically, 10.4% of real sessions have a single JSONL event larger than
  // 4 KB. The previous bounded-window tail scan (TAIL_BYTES = 4096) wiped those
  // sessions' extractable metadata because the partial-line discard swallowed
  // the only usable line. A backward line-scan from EOF fixes this.

  it("T-TAIL-1: tail scan finds gitBranch when the latest event is ~16 KB", () => {
    const projectDir = path.join(tmpDir, "proj-tail-1");
    const filePath = path.join(projectDir, "session-tail-1.jsonl");

    // Early event with the "old" branch.
    const first = JSON.stringify({
      type: "user",
      uuid: "u0",
      timestamp: "2026-04-17T09:00:00Z",
      sessionId: "session-tail-1",
      cwd: "/Users/soh/repo",
      gitBranch: "old-branch",
      message: { role: "user", content: [{ type: "text", text: "first" }] },
      userType: "external",
    });

    // A single ~16 KB event carrying the newest gitBranch. Use an explicit
    // 16-KB filler string so the event's JSONL line far exceeds 4 KB — this
    // is the exact shape that breaks the legacy tail scan.
    const largeText = "x".repeat(16 * 1024);
    const big = JSON.stringify({
      type: "user",
      uuid: "u-big",
      timestamp: "2026-04-17T10:00:00Z",
      sessionId: "session-tail-1",
      cwd: "/Users/soh/repo",
      gitBranch: "new-branch",
      message: { role: "user", content: [{ type: "text", text: largeText }] },
      userType: "external",
    });

    writeJsonlFile(filePath, [first, big]);
    expect(big.length).toBeGreaterThan(16 * 1024);

    const info = cache.getSessionInfo(filePath, "proj-tail-1");
    expect(info!.gitBranch).toBe("new-branch");
  });

  it("T-TAIL-2: tail scan finds cwd when the latest event is ~32 KB", () => {
    const projectDir = path.join(tmpDir, "proj-tail-2");
    const filePath = path.join(projectDir, "session-tail-2.jsonl");

    // Head event with no cwd/gitBranch — forces tail scan to do the work.
    const head = JSON.stringify({
      type: "permission-mode",
      uuid: "p0",
      timestamp: "2026-04-17T09:00:00Z",
      sessionId: "session-tail-2",
      permissionMode: "default",
    });

    const filler = "y".repeat(32 * 1024);
    const big = JSON.stringify({
      type: "user",
      uuid: "u-big",
      timestamp: "2026-04-17T10:00:00Z",
      sessionId: "session-tail-2",
      cwd: "/Users/soh/working/deep-nested-project",
      gitBranch: "feature/x",
      message: { role: "user", content: [{ type: "text", text: filler }] },
      userType: "external",
    });

    writeJsonlFile(filePath, [head, big]);
    expect(big.length).toBeGreaterThan(32 * 1024);

    const info = cache.getSessionInfo(filePath, "proj-tail-2");
    expect(info!.cwd).toBe("/Users/soh/working/deep-nested-project");
    expect(info!.gitBranch).toBe("feature/x");
  });

  it("T-TAIL-3: backward scan is bounded by the 256 KB cap on degenerate files", () => {
    const projectDir = path.join(tmpDir, "proj-tail-3");
    const filePath = path.join(projectDir, "session-tail-3.jsonl");

    // A single corrupted / metadata-free event larger than the 256 KB cap.
    // No `cwd`, no `gitBranch`, no extractable fields — the scan must not
    // run away reading arbitrarily far. It must terminate within the cap.
    fs.mkdirSync(projectDir, { recursive: true });
    const huge = "z".repeat(512 * 1024); // 512 KB, double the cap
    fs.writeFileSync(filePath, `{"type":"pad","data":"${huge}"}` + "\n");

    // We don't want to assert on the exact byte count (implementation detail),
    // but we DO want to ensure this returns quickly and without crashing.
    // A broken cap would read the whole file; that's O(fileSize) work per call.
    const start = Date.now();
    const info = cache.getSessionInfo(filePath, "proj-tail-3");
    const elapsedMs = Date.now() - start;

    expect(info).not.toBeNull();
    expect(info!.gitBranch).toBeUndefined();
    expect(info!.cwd).toBeUndefined();
    // Generous bound — the cap keeps us well under this. Broken-cap readers
    // scanning 512 KB + JSON parsing can still finish in <200ms, but this
    // also doubles as a smoke check.
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("T-TAIL-4: backward scan picks the MOST RECENT gitBranch when many events span >4 KB", () => {
    const projectDir = path.join(tmpDir, "proj-tail-4");
    const filePath = path.join(projectDir, "session-tail-4.jsonl");

    // 10 events, each ~800 bytes, combined size > 4KB but within 256 KB cap.
    // Each carries a distinct gitBranch. The backward scan must pick the LAST.
    const filler = "q".repeat(600);
    const events: string[] = [];
    for (let i = 0; i < 10; i++) {
      events.push(
        JSON.stringify({
          type: "user",
          uuid: `u${i}`,
          timestamp: `2026-04-17T10:0${i}:00Z`,
          sessionId: "session-tail-4",
          cwd: "/Users/soh/repo",
          gitBranch: `branch-${i}`,
          message: { role: "user", content: [{ type: "text", text: filler }] },
          userType: "external",
        })
      );
    }
    writeJsonlFile(filePath, events);

    const info = cache.getSessionInfo(filePath, "proj-tail-4");
    expect(info!.gitBranch).toBe("branch-9");
  });

  // T-RUNNING-1 through T-RUNNING-4: isRunning must be derived from JSONL
  // terminal signals, not file modification time.

  it("T-RUNNING-1: isRunning=false when last event has stop_reason=end_turn, even if mtime is 1s ago", () => {
    const projectDir = path.join(tmpDir, "proj-running-1");
    const filePath = path.join(projectDir, "session-running-1.jsonl");
    writeJsonlFile(filePath, [
      JSON.stringify({
        type: "assistant",
        uuid: "u1",
        timestamp: "2026-04-19T10:00:00Z",
        sessionId: "session-running-1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
          model: "claude-sonnet-4-6",
          id: "msg-1",
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
    ]);
    // Set mtime to 1 second ago — old heuristic would mark isRunning=true
    const oneSecAgo = new Date(Date.now() - 1000);
    fs.utimesSync(filePath, oneSecAgo, oneSecAgo);

    const info = cache.getSessionInfo(filePath, "proj-running-1");
    expect(info!.isRunning).toBe(false);
  });

  it("T-RUNNING-2: isRunning=false when last event has subtype=turn_duration", () => {
    const projectDir = path.join(tmpDir, "proj-running-2");
    const filePath = path.join(projectDir, "session-running-2.jsonl");
    writeJsonlFile(filePath, [
      JSON.stringify({
        type: "system",
        uuid: "u1",
        timestamp: "2026-04-19T10:00:00Z",
        sessionId: "session-running-2",
        subtype: "turn_duration",
        durationMs: 3000,
      }),
    ]);
    // Set mtime to 1 second ago — old heuristic would mark isRunning=true
    const oneSecAgo = new Date(Date.now() - 1000);
    fs.utimesSync(filePath, oneSecAgo, oneSecAgo);

    const info = cache.getSessionInfo(filePath, "proj-running-2");
    expect(info!.isRunning).toBe(false);
  });

  it("T-RUNNING-3: isRunning=true when no terminal signal and mtime is 5 seconds ago", () => {
    const projectDir = path.join(tmpDir, "proj-running-3");
    const filePath = path.join(projectDir, "session-running-3.jsonl");
    // An event that is NOT a terminal signal
    writeJsonlFile(filePath, [
      JSON.stringify({
        type: "assistant",
        uuid: "u1",
        timestamp: "2026-04-19T10:00:00Z",
        sessionId: "session-running-3",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
          model: "claude-sonnet-4-6",
          id: "msg-1",
          type: "message",
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
    ]);
    // Set mtime to 5 seconds ago — within the 30s active window
    const fiveSecAgo = new Date(Date.now() - 5000);
    fs.utimesSync(filePath, fiveSecAgo, fiveSecAgo);

    const info = cache.getSessionInfo(filePath, "proj-running-3");
    expect(info!.isRunning).toBe(true);
  });

  it("T-RUNNING-4: isRunning=false when no terminal signal and mtime is 10 minutes ago", () => {
    const projectDir = path.join(tmpDir, "proj-running-4");
    const filePath = path.join(projectDir, "session-running-4.jsonl");
    // An event that is NOT a terminal signal
    writeJsonlFile(filePath, [
      JSON.stringify({
        type: "assistant",
        uuid: "u1",
        timestamp: "2026-04-19T10:00:00Z",
        sessionId: "session-running-4",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }],
          model: "claude-sonnet-4-6",
          id: "msg-1",
          type: "message",
          stop_reason: "tool_use",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
    ]);
    // Set mtime to 10 minutes ago — far outside the 30s active window
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(filePath, tenMinAgo, tenMinAgo);

    const info = cache.getSessionInfo(filePath, "proj-running-4");
    expect(info!.isRunning).toBe(false);
  });
});
