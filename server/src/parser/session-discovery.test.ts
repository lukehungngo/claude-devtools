import { describe, it, expect, beforeEach } from "vitest";
import {
  discoverSessions,
  discoverRepoGroups,
  invalidateDiscoveryCache,
  groupSessionsIntoRepos,
} from "./session-discovery.js";
import type { SessionInfo } from "../types.js";

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
