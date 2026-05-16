import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listDaemonSessions,
  findDaemonSessionByPid,
  findDaemonSessionsBySessionId,
  _clearDaemonSessionCache,
  type DaemonSession,
} from "./daemon-session-discovery.js";

/**
 * Pid `process.pid` is guaranteed alive (it's us). We use it for "alive=true"
 * fixtures. `STALE_PID` is far outside the OS pid range on macOS/Linux
 * (max pid is typically 2^22 = 4_194_304) so `process.kill(pid, 0)` reliably
 * yields ESRCH.
 */
const STALE_PID = 999_999_999;
const ALIVE_PID = process.pid;

function makeFixture(
  dir: string,
  filename: string,
  payload: Record<string, unknown>,
): void {
  writeFileSync(join(dir, filename), JSON.stringify(payload), "utf-8");
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "daemon-sessions-test-"));
  _clearDaemonSessionCache();
});

afterEach(() => {
  _clearDaemonSessionCache();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("listDaemonSessions", () => {
  it("returns parsed entries for every valid JSON file in the directory", () => {
    makeFixture(tmpDir, `${ALIVE_PID}.json`, {
      pid: ALIVE_PID,
      sessionId: "sess-alive",
      cwd: "/tmp/proj-a",
      startedAt: 1_000,
      version: "2.1.142",
      status: "busy",
    });
    makeFixture(tmpDir, "1001.json", {
      pid: 1001,
      sessionId: "sess-b",
      cwd: "/tmp/proj-b",
      startedAt: 2_000,
      version: "2.1.143",
      kind: "interactive",
      entrypoint: "cli",
    });
    makeFixture(tmpDir, "1002.json", {
      pid: 1002,
      sessionId: "sess-c",
      cwd: "/tmp/proj-c",
      startedAt: 3_000,
      version: "2.1.143",
      bridgeSessionId: "session_bridge_abc",
    });

    const sessions = listDaemonSessions({ dir: tmpDir });
    expect(sessions).toHaveLength(3);

    const aliveSession = sessions.find((s) => s.sessionId === "sess-alive");
    expect(aliveSession).toMatchObject({
      pid: ALIVE_PID,
      sessionId: "sess-alive",
      cwd: "/tmp/proj-a",
      version: "2.1.142",
      status: "busy",
    });

    const bridgeSession = sessions.find((s) => s.sessionId === "sess-c");
    expect(bridgeSession?.bridgeSessionId).toBe("session_bridge_abc");
  });

  it("skips malformed JSON files but returns the readable ones", () => {
    makeFixture(tmpDir, `${ALIVE_PID}.json`, {
      pid: ALIVE_PID,
      sessionId: "sess-ok",
      cwd: "/tmp/ok",
      startedAt: 10,
      version: "2.1.143",
    });
    writeFileSync(join(tmpDir, "broken.json"), "{not valid json", "utf-8");
    makeFixture(tmpDir, "2002.json", {
      pid: 2002,
      sessionId: "sess-ok2",
      cwd: "/tmp/ok2",
      startedAt: 20,
      version: "2.1.143",
    });

    const sessions = listDaemonSessions({ dir: tmpDir });
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionId).sort()).toEqual([
      "sess-ok",
      "sess-ok2",
    ]);
  });

  it("skips files missing required fields", () => {
    makeFixture(tmpDir, "good.json", {
      pid: ALIVE_PID,
      sessionId: "sess-good",
      cwd: "/tmp/g",
      startedAt: 1,
      version: "2.1.143",
    });
    makeFixture(tmpDir, "no-pid.json", {
      sessionId: "x",
      cwd: "/tmp",
      startedAt: 1,
      version: "2.1.143",
    });
    makeFixture(tmpDir, "no-version.json", {
      pid: 555,
      sessionId: "y",
      cwd: "/tmp",
      startedAt: 1,
    });

    const sessions = listDaemonSessions({ dir: tmpDir });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe("sess-good");
  });

  it("ignores non-JSON files in the directory", () => {
    makeFixture(tmpDir, "1.json", {
      pid: ALIVE_PID,
      sessionId: "s",
      cwd: "/tmp",
      startedAt: 1,
      version: "2.1.143",
    });
    writeFileSync(join(tmpDir, "notes.txt"), "hello", "utf-8");
    writeFileSync(join(tmpDir, "README"), "stuff", "utf-8");

    const sessions = listDaemonSessions({ dir: tmpDir });
    expect(sessions).toHaveLength(1);
  });

  it("returns [] when the directory does not exist", () => {
    const missing = join(tmpDir, "does-not-exist");
    expect(listDaemonSessions({ dir: missing })).toEqual([]);
  });
});

describe("alive detection (process.kill(pid, 0))", () => {
  it("marks alive=true for the current process pid", () => {
    makeFixture(tmpDir, `${ALIVE_PID}.json`, {
      pid: ALIVE_PID,
      sessionId: "me",
      cwd: "/tmp",
      startedAt: 1,
      version: "2.1.143",
    });

    const [session] = listDaemonSessions({ dir: tmpDir });
    expect(session.alive).toBe(true);
  });

  it("marks alive=false for a pid that no process owns (stale daemon)", () => {
    makeFixture(tmpDir, `${STALE_PID}.json`, {
      pid: STALE_PID,
      sessionId: "ghost",
      cwd: "/tmp/ghost",
      startedAt: 1,
      version: "2.1.143",
    });

    const [session] = listDaemonSessions({ dir: tmpDir });
    expect(session.pid).toBe(STALE_PID);
    expect(session.alive).toBe(false);
  });
});

describe("findDaemonSessionByPid", () => {
  it("returns the session when present", () => {
    makeFixture(tmpDir, `${ALIVE_PID}.json`, {
      pid: ALIVE_PID,
      sessionId: "s1",
      cwd: "/tmp",
      startedAt: 1,
      version: "2.1.143",
    });

    const found = findDaemonSessionByPid(ALIVE_PID, { dir: tmpDir });
    expect(found?.sessionId).toBe("s1");
  });

  it("returns null when no file matches the pid", () => {
    expect(findDaemonSessionByPid(424242, { dir: tmpDir })).toBeNull();
  });
});

describe("findDaemonSessionsBySessionId", () => {
  it("returns every daemon entry for a sessionId, deduped by pid", () => {
    makeFixture(tmpDir, "10.json", {
      pid: 10,
      sessionId: "shared",
      cwd: "/tmp/a",
      startedAt: 1,
      version: "2.1.143",
      entrypoint: "cli",
    });
    makeFixture(tmpDir, "11.json", {
      pid: 11,
      sessionId: "shared",
      cwd: "/tmp/a",
      startedAt: 2,
      version: "2.1.143",
      entrypoint: "sdk-cli",
    });
    makeFixture(tmpDir, "12.json", {
      pid: 12,
      sessionId: "other",
      cwd: "/tmp/b",
      startedAt: 3,
      version: "2.1.143",
    });

    const matches: DaemonSession[] = findDaemonSessionsBySessionId("shared", {
      dir: tmpDir,
    });
    expect(matches.map((m) => m.pid).sort()).toEqual([10, 11]);
  });

  it("returns [] when no sessionId matches", () => {
    expect(
      findDaemonSessionsBySessionId("nope", { dir: tmpDir }),
    ).toEqual([]);
  });
});
