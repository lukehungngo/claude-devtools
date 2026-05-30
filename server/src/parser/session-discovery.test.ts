import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  discoverSessions,
  discoverRepoGroups,
  invalidateDiscoveryCache,
  groupSessionsIntoRepos,
  loadFullSession,
  enrichSessionsWithDaemon,
} from "./session-discovery.js";
import type { SessionInfo } from "../types.js";
import type { DaemonSession } from "./daemon-session-discovery.js";

describe("discoverSessions caching", () => {
  beforeEach(() => {
    invalidateDiscoveryCache();
  });

  it("returns same reference on rapid successive calls (cache hit)", () => {
    const result1 = discoverSessions();
    const result2 = discoverSessions();
    expect(result1).toBe(result2); // same array reference = cache hit
  });

  it("invalidateDiscoveryCache forces fresh scan", () => {
    const result1 = discoverSessions();
    invalidateDiscoveryCache();
    const result2 = discoverSessions();
    expect(result1).not.toBe(result2); // different reference = cache miss
    expect(result1.length).toBe(result2.length); // same content
  });
});

describe("discoverRepoGroups caching", () => {
  beforeEach(() => {
    invalidateDiscoveryCache();
  });

  it("returns same reference on rapid successive calls (cache hit)", () => {
    const result1 = discoverRepoGroups();
    const result2 = discoverRepoGroups();
    expect(result1).toBe(result2); // same array reference = cache hit
  });

  it("invalidateDiscoveryCache clears repo groups cache", () => {
    const result1 = discoverRepoGroups();
    invalidateDiscoveryCache();
    const result2 = discoverRepoGroups();
    expect(result1).not.toBe(result2); // different reference = cache miss
    expect(result1.length).toBe(result2.length); // same content
  });

  it("invalidateDiscoveryCache clears both session and repo groups caches", () => {
    const sessions1 = discoverSessions();
    const groups1 = discoverRepoGroups();
    invalidateDiscoveryCache();
    const sessions2 = discoverSessions();
    const groups2 = discoverRepoGroups();
    expect(sessions1).not.toBe(sessions2);
    expect(groups1).not.toBe(groups2);
  });
});

// ---------------------------------------------------------------------------
// Pure helper: groupSessionsIntoRepos
// Fixture-driven tests — no filesystem required.
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<SessionInfo> & { id: string }): SessionInfo {
  return {
    projectHash: "",
    path: `/tmp/${overrides.id}.jsonl`,
    startTime: "2026-04-17T10:00:00Z",
    lastModified: "2026-04-17T10:00:00Z",
    eventCount: 1,
    subagentCount: 0,
    isActive: false,
    isRunning: false,
    ...overrides,
  };
}

describe("groupSessionsIntoRepos — repo name and gitBranch derivation", () => {
  it("T-REPO-1: hyphenated folder name preserves the basename (conny-com-app stays as conny-com-app)", () => {
    // PRE-FIX BUG: decodeProjectHash replaced every "-" with "/", so
    // "-Users-soh-working-cpcx0-conny-com-app" decoded to
    // "/Users/soh/working/cpcx0/conny/com/app" and basename() returned "app".
    // POST-FIX: we key by cwd (populated from JSONL content), so basename
    // returns the real folder name — including its hyphens.
    const session = makeSession({
      id: "s-with-cwd",
      projectHash: "-Users-soh-working-cpcx0-conny-com-app",
      cwd: "/Users/soh/working/cpcx0/conny-com-app",
    });

    const groups = groupSessionsIntoRepos([session]);
    expect(groups).toHaveLength(1);
    expect(groups[0].repoName).toBe("conny-com-app");
  });

  it("T-REPO-1b: session with truly missing cwd falls back to projectHash (ugly but honest)", () => {
    // Edge case: a session whose head AND backward tail scan both fail to
    // surface a `cwd`. With the backward-scan-to-EOF tail extraction in
    // `session-cache.ts` this path is close to never-hit in practice — every
    // real JSONL event carries `cwd`, and the scan walks chunks back until
    // one is found or the 256 KB cap is hit. We deliberately do NOT
    // reintroduce the lossy `decodeProjectHash` here: the honest, non-lossy
    // behavior is to group under the raw projectHash. The display name is
    // ugly but accurate; a dedup'd debug message is logged via `parserLog`.
    const session = makeSession({
      id: "s-no-cwd",
      projectHash: "-Users-soh-working-cpcx0-conny-com-app",
      cwd: undefined,
    });

    const groups = groupSessionsIntoRepos([session]);
    expect(groups).toHaveLength(1);
    expect(groups[0].cwd).toBe("-Users-soh-working-cpcx0-conny-com-app");
    expect(groups[0].repoName).toBe("-Users-soh-working-cpcx0-conny-com-app");
  });

  it("T-REPO-2: gitBranch reflects most recent session, not first-with-branch", () => {
    // Scenario: newest session is on "master", older session is on "feat/demo-catch-up".
    // Current buggy behavior: returns either branch depending on ordering. The first
    // session with ANY gitBranch wins — which, if the newest sorted session happens
    // to have an older extracted branch, produces stale data.
    // We prove the bug here: if the *older* session has branch "stale-branch" and
    // the *newest* has "master", then master must win.
    const newest = makeSession({
      id: "newest",
      projectHash: "-Users-soh-honeywell",
      cwd: "/Users/soh/honeywell",
      gitBranch: "master",
      lastModified: "2026-04-17T12:00:00Z",
    });
    const older = makeSession({
      id: "older",
      projectHash: "-Users-soh-honeywell",
      cwd: "/Users/soh/honeywell",
      gitBranch: "feat/demo-catch-up",
      lastModified: "2026-04-10T09:00:00Z",
    });

    // groupSessionsIntoRepos expects sessions sorted newest-first (matches discoverSessions)
    const groups = groupSessionsIntoRepos([newest, older]);
    expect(groups).toHaveLength(1);
    expect(groups[0].gitBranch).toBe("master");
  });

  it("T-REPO-2b: when newest session is missing gitBranch, fall back to any session's branch", () => {
    // Edge case: newest has no gitBranch (extraction missed it). Fallback to first-with-branch.
    const newest = makeSession({
      id: "newest",
      projectHash: "-Users-soh-honeywell",
      cwd: "/Users/soh/honeywell",
      gitBranch: undefined,
      lastModified: "2026-04-17T12:00:00Z",
    });
    const older = makeSession({
      id: "older",
      projectHash: "-Users-soh-honeywell",
      cwd: "/Users/soh/honeywell",
      gitBranch: "feat/demo-catch-up",
      lastModified: "2026-04-10T09:00:00Z",
    });

    const groups = groupSessionsIntoRepos([newest, older]);
    expect(groups).toHaveLength(1);
    // Fallback — documented trade-off in plan
    expect(groups[0].gitBranch).toBe("feat/demo-catch-up");
  });

  it("groups sessions sharing a cwd into a single repo group", () => {
    const s1 = makeSession({
      id: "s1",
      projectHash: "-Users-soh-working-foo",
      cwd: "/Users/soh/working/foo",
      lastModified: "2026-04-17T12:00:00Z",
    });
    const s2 = makeSession({
      id: "s2",
      projectHash: "-Users-soh-working-foo",
      cwd: "/Users/soh/working/foo",
      lastModified: "2026-04-10T09:00:00Z",
    });

    const groups = groupSessionsIntoRepos([s1, s2]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[0].repoName).toBe("foo");
  });

  it("merges a no-cwd session into an existing group by projectHash", () => {
    const withCwd = makeSession({
      id: "with-cwd",
      projectHash: "-Users-soh-working-foo-bar-baz",
      cwd: "/Users/soh/working/foo-bar-baz",
      lastModified: "2026-04-17T12:00:00Z",
    });
    const noCwd = makeSession({
      id: "no-cwd",
      projectHash: "-Users-soh-working-foo-bar-baz",
      cwd: undefined,
      lastModified: "2026-04-16T09:00:00Z",
    });

    const groups = groupSessionsIntoRepos([withCwd, noCwd]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[0].repoName).toBe("foo-bar-baz"); // preserves hyphens — basename of cwd
  });

  it("sorts active repos first, then by lastActive descending", () => {
    const inactive = makeSession({
      id: "inactive",
      projectHash: "-inactive",
      cwd: "/inactive",
      isActive: false,
      lastModified: "2026-04-17T12:00:00Z",
    });
    const active = makeSession({
      id: "active",
      projectHash: "-active",
      cwd: "/active",
      isActive: true,
      lastModified: "2026-04-10T09:00:00Z",
    });

    const groups = groupSessionsIntoRepos([inactive, active]);
    expect(groups).toHaveLength(2);
    expect(groups[0].repoName).toBe("active"); // active first regardless of lastActive
    expect(groups[1].repoName).toBe("inactive");
  });
});

// ---------------------------------------------------------------------------
// loadFullSession cross-project subagent merging
// Exercises the case where a session (same sessionId) exists under multiple
// projectHash directories because the user's cwd changed mid-session (e.g.
// switched from the main repo into a .claude worktree). Claude Code scatters
// subagent JSONLs across both projectHash dirs; the dashboard must merge them.
// ---------------------------------------------------------------------------

describe("loadFullSession cross-project", () => {
  let tmpHome: string;
  let originalHome: string | undefined;

  /** Real JSONL event shape — the parser filters out non-session events, so
   *  use a plausible `user` event to survive `isRelevantEvent`. */
  function makeUserEventLine(sessionId: string, uuid: string): string {
    return JSON.stringify({
      type: "user",
      uuid,
      timestamp: "2026-04-17T10:00:00Z",
      sessionId,
      message: {
        role: "user",
        content: [{ type: "text", text: "hi" }],
      },
      userType: "external",
    });
  }

  function writeJsonl(filePath: string, lines: string[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
  }

  function writeMeta(
    filePath: string,
    meta: { agentType: string; description: string }
  ): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(meta));
  }

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "session-discovery-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tmpHome;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function makeSessionInfo(
    id: string,
    projectHash: string,
    jsonlPath: string
  ): SessionInfo {
    return {
      id,
      projectHash,
      path: jsonlPath,
      startTime: "2026-04-17T10:00:00Z",
      lastModified: "2026-04-17T10:00:00Z",
      eventCount: 1,
      subagentCount: 0,
      isActive: false,
      isRunning: false,
    };
  }

  it("T-CROSS-1: merges subagents from all project dirs containing the sessionId", () => {
    const sessionId = "sess-xyz";
    const projectsRoot = path.join(tmpHome, ".claude", "projects");

    // project-a: 5 real lines of main content + 1 subagent
    const projectA = path.join(projectsRoot, "project-a");
    const mainA = path.join(projectA, `${sessionId}.jsonl`);
    writeJsonl(mainA, [
      makeUserEventLine(sessionId, "u1"),
      makeUserEventLine(sessionId, "u2"),
      makeUserEventLine(sessionId, "u3"),
      makeUserEventLine(sessionId, "u4"),
      makeUserEventLine(sessionId, "u5"),
    ]);
    writeJsonl(path.join(projectA, sessionId, "subagents", "agent-aaa.jsonl"), [
      makeUserEventLine(sessionId, "sa-aaa-1"),
    ]);
    writeMeta(
      path.join(projectA, sessionId, "subagents", "agent-aaa.meta.json"),
      { agentType: "explore", description: "AAA agent" }
    );

    // project-b: 1-line stub main + 2 subagents
    const projectB = path.join(projectsRoot, "project-b");
    const mainB = path.join(projectB, `${sessionId}.jsonl`);
    writeJsonl(mainB, [makeUserEventLine(sessionId, "u-stub")]);
    writeJsonl(path.join(projectB, sessionId, "subagents", "agent-bbb.jsonl"), [
      makeUserEventLine(sessionId, "sa-bbb-1"),
    ]);
    writeMeta(
      path.join(projectB, sessionId, "subagents", "agent-bbb.meta.json"),
      { agentType: "plan", description: "BBB agent" }
    );
    writeJsonl(path.join(projectB, sessionId, "subagents", "agent-ccc.jsonl"), [
      makeUserEventLine(sessionId, "sa-ccc-1"),
    ]);
    writeMeta(
      path.join(projectB, sessionId, "subagents", "agent-ccc.meta.json"),
      { agentType: "general-purpose", description: "CCC agent" }
    );

    // sessionInfo points at project-a (the "discovered" one); fix must also
    // find subagents that live under project-b.
    const info = makeSessionInfo(sessionId, "project-a", mainA);
    const result = loadFullSession(info);

    expect(result.subagentEvents.size).toBe(3);
    expect(result.subagentEvents.has("aaa")).toBe(true);
    expect(result.subagentEvents.has("bbb")).toBe(true);
    expect(result.subagentEvents.has("ccc")).toBe(true);
    expect(result.subagentMeta.size).toBe(3);
    expect(result.subagentMeta.get("aaa")?.agentType).toBe("explore");
    expect(result.subagentMeta.get("bbb")?.agentType).toBe("plan");
    expect(result.subagentMeta.get("ccc")?.agentType).toBe("general-purpose");
  });

  it("T-NESTED: discovers agents in nested subagents/workflows/<wf>/ dirs and ignores non-agent files", () => {
    const sessionId = "sess-nested";
    const projectsRoot = path.join(tmpHome, ".claude", "projects");
    const projectA = path.join(projectsRoot, "project-a");
    const mainA = path.join(projectA, `${sessionId}.jsonl`);
    writeJsonl(mainA, [makeUserEventLine(sessionId, "u1")]);

    // Top-level subagent.
    writeJsonl(path.join(projectA, sessionId, "subagents", "agent-top.jsonl"), [
      makeUserEventLine(sessionId, "t1"),
    ]);
    // NESTED workflow agents — previously dropped by the non-recursive scan.
    const wfDir = path.join(projectA, sessionId, "subagents", "workflows", "wf_abc");
    writeJsonl(path.join(wfDir, "agent-wf1.jsonl"), [makeUserEventLine(sessionId, "w1")]);
    writeJsonl(path.join(wfDir, "agent-wf2.jsonl"), [makeUserEventLine(sessionId, "w2")]);
    // A non-agent bookkeeping file that must NOT become an agent node.
    writeJsonl(path.join(wfDir, "journal.jsonl"), [makeUserEventLine(sessionId, "j1")]);

    const info = makeSessionInfo(sessionId, "project-a", mainA);
    const result = loadFullSession(info);

    expect(result.subagentEvents.has("top")).toBe(true);
    expect(result.subagentEvents.has("wf1")).toBe(true);
    expect(result.subagentEvents.has("wf2")).toBe(true);
    expect(result.subagentEvents.has("journal")).toBe(false);
    expect(result.subagentEvents.size).toBe(3);
  });

  it("T-CROSS-2: picks the larger main JSONL when session exists in multiple project dirs", () => {
    const sessionId = "sess-bigger";
    const projectsRoot = path.join(tmpHome, ".claude", "projects");

    // project-a: 1-line stub (~120 bytes)
    const projectA = path.join(projectsRoot, "project-a");
    const mainA = path.join(projectA, `${sessionId}.jsonl`);
    writeJsonl(mainA, [makeUserEventLine(sessionId, "u-stub")]);

    // project-b: 100 lines of real content (~12-20 KB)
    const projectB = path.join(projectsRoot, "project-b");
    const mainB = path.join(projectB, `${sessionId}.jsonl`);
    const manyLines: string[] = [];
    for (let i = 0; i < 100; i++) {
      manyLines.push(makeUserEventLine(sessionId, `u-${i}`));
    }
    writeJsonl(mainB, manyLines);

    // sessionInfo targets the stub under project-a.
    const info = makeSessionInfo(sessionId, "project-a", mainA);
    const result = loadFullSession(info);

    // Fix should upgrade the main path to project-b's bigger file.
    expect(result.mainEvents.length).toBe(100);
  });

  it("T-CROSS-3: loads correctly when session exists in only one project dir (no regression)", () => {
    const sessionId = "sess-solo";
    const projectsRoot = path.join(tmpHome, ".claude", "projects");

    const projectA = path.join(projectsRoot, "project-a");
    const mainA = path.join(projectA, `${sessionId}.jsonl`);
    writeJsonl(mainA, [
      makeUserEventLine(sessionId, "u1"),
      makeUserEventLine(sessionId, "u2"),
      makeUserEventLine(sessionId, "u3"),
      makeUserEventLine(sessionId, "u4"),
      makeUserEventLine(sessionId, "u5"),
    ]);
    writeJsonl(path.join(projectA, sessionId, "subagents", "agent-aaa.jsonl"), [
      makeUserEventLine(sessionId, "sa-aaa-1"),
    ]);
    writeMeta(
      path.join(projectA, sessionId, "subagents", "agent-aaa.meta.json"),
      { agentType: "explore", description: "AAA agent" }
    );

    const info = makeSessionInfo(sessionId, "project-a", mainA);
    const result = loadFullSession(info);

    expect(result.mainEvents.length).toBe(5);
    expect(result.subagentEvents.size).toBe(1);
    expect(result.subagentEvents.has("aaa")).toBe(true);
    expect(result.subagentMeta.get("aaa")?.agentType).toBe("explore");
  });
});

// ---------------------------------------------------------------------------
// enrichSessionsWithDaemon — pure overlay helper (TASK-R2B2 / NEW-1).
// Tests verify the merge contract without touching the filesystem or the
// module-level sessionCache singleton — keeps the suite fast and
// deterministic.
// ---------------------------------------------------------------------------

describe("enrichSessionsWithDaemon — pure overlay", () => {
  function makeDaemon(overrides: Partial<DaemonSession> & { pid: number; sessionId: string }): DaemonSession {
    return {
      cwd: "/tmp",
      startedAt: 0,
      version: "2.1.143",
      alive: true,
      ...overrides,
    };
  }

  it("merges pid, daemonStatus, bridgeSessionId, daemonAlive when a daemon entry matches", () => {
    const sessions: SessionInfo[] = [
      {
        id: "sess-1",
        projectHash: "ph",
        path: "/tmp/sess-1.jsonl",
        startTime: "2026-04-17T10:00:00Z",
        lastModified: "2026-04-17T10:00:00Z",
        eventCount: 1,
        subagentCount: 0,
      },
    ];

    const daemon = makeDaemon({
      pid: 42,
      sessionId: "sess-1",
      status: "busy",
      bridgeSessionId: "bridge-abc",
      alive: true,
    });

    const lookup = (sid: string): DaemonSession[] =>
      sid === "sess-1" ? [daemon] : [];

    const enriched = enrichSessionsWithDaemon(sessions, lookup);
    expect(enriched).toHaveLength(1);
    expect(enriched[0].pid).toBe(42);
    expect(enriched[0].daemonStatus).toBe("busy");
    expect(enriched[0].bridgeSessionId).toBe("bridge-abc");
    expect(enriched[0].daemonAlive).toBe(true);
  });

  it("leaves daemon fields undefined when no daemon entry matches", () => {
    const sessions: SessionInfo[] = [
      {
        id: "sess-orphan",
        projectHash: "ph",
        path: "/tmp/sess-orphan.jsonl",
        startTime: "2026-04-17T10:00:00Z",
        lastModified: "2026-04-17T10:00:00Z",
        eventCount: 1,
        subagentCount: 0,
      },
    ];

    const enriched = enrichSessionsWithDaemon(sessions, () => []);
    expect(enriched[0].pid).toBeUndefined();
    expect(enriched[0].daemonStatus).toBeUndefined();
    expect(enriched[0].bridgeSessionId).toBeUndefined();
    expect(enriched[0].daemonAlive).toBeUndefined();
  });

  it("prefers the alive daemon entry when multiple match", () => {
    // If both a dead and an alive daemon entry share the sessionId
    // (resumed across processes), we MUST overlay from the alive one.
    const sessions: SessionInfo[] = [
      {
        id: "sess-resumed",
        projectHash: "ph",
        path: "/tmp/sess-resumed.jsonl",
        startTime: "2026-04-17T10:00:00Z",
        lastModified: "2026-04-17T10:00:00Z",
        eventCount: 1,
        subagentCount: 0,
      },
    ];

    const deadDaemon = makeDaemon({
      pid: 100,
      sessionId: "sess-resumed",
      status: "idle",
      alive: false,
    });
    const aliveDaemon = makeDaemon({
      pid: 200,
      sessionId: "sess-resumed",
      status: "busy",
      alive: true,
    });

    const enriched = enrichSessionsWithDaemon(sessions, () => [deadDaemon, aliveDaemon]);
    expect(enriched[0].pid).toBe(200);
    expect(enriched[0].daemonStatus).toBe("busy");
    expect(enriched[0].daemonAlive).toBe(true);
  });

  it("falls back to the first entry when none are alive", () => {
    // Surface the stale daemon's status so callers (route layer) can
    // explicitly detect daemonAlive === false and fall through to mtime.
    const sessions: SessionInfo[] = [
      {
        id: "sess-stale",
        projectHash: "ph",
        path: "/tmp/sess-stale.jsonl",
        startTime: "2026-04-17T10:00:00Z",
        lastModified: "2026-04-17T10:00:00Z",
        eventCount: 1,
        subagentCount: 0,
      },
    ];

    const stale1 = makeDaemon({
      pid: 11,
      sessionId: "sess-stale",
      status: "idle",
      alive: false,
    });
    const stale2 = makeDaemon({
      pid: 12,
      sessionId: "sess-stale",
      status: "busy",
      alive: false,
    });

    const enriched = enrichSessionsWithDaemon(sessions, () => [stale1, stale2]);
    expect(enriched[0].pid).toBe(11);
    expect(enriched[0].daemonStatus).toBe("idle");
    expect(enriched[0].daemonAlive).toBe(false);
  });

  it("returns NEW SessionInfo objects (does not mutate the input array)", () => {
    // Immutability invariant — coding-style.md requires non-mutation. The
    // upstream sessionCache returns the same SessionInfo ref across calls;
    // mutating those refs would leak daemon state into the cache.
    const original: SessionInfo = {
      id: "sess-imm",
      projectHash: "ph",
      path: "/tmp/sess-imm.jsonl",
      startTime: "2026-04-17T10:00:00Z",
      lastModified: "2026-04-17T10:00:00Z",
      eventCount: 1,
      subagentCount: 0,
    };
    const sessions = [original];
    const daemon = makeDaemon({ pid: 7, sessionId: "sess-imm", status: "busy" });

    const enriched = enrichSessionsWithDaemon(sessions, () => [daemon]);
    expect(enriched[0]).not.toBe(original);
    expect(original.pid).toBeUndefined();
    expect(original.daemonStatus).toBeUndefined();
  });
});
