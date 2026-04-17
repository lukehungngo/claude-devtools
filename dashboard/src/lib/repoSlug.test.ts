import { describe, it, expect } from "vitest";
import {
  makeRepoSlug,
  resolveSlugToProjectHash,
  buildSlugMap,
  resolveProjectHashForFetch,
} from "./repoSlug";
import type { RepoGroup } from "./types";

describe("makeRepoSlug", () => {
  it("extracts basename from cwd", () => {
    expect(makeRepoSlug("/Users/soh/working/ai/claude-devtools")).toBe(
      "claude-devtools",
    );
  });

  it("handles single-segment paths", () => {
    expect(makeRepoSlug("/myproject")).toBe("myproject");
  });

  it("handles trailing slashes", () => {
    expect(makeRepoSlug("/Users/soh/working/ai/claude-devtools/")).toBe(
      "claude-devtools",
    );
  });

  it("returns fallback for empty or root path", () => {
    expect(makeRepoSlug("/")).toBe("root");
    expect(makeRepoSlug("")).toBe("root");
  });
});

describe("buildSlugMap", () => {
  const makeRepo = (cwd: string, projectHash: string): RepoGroup => ({
    cwd,
    repoName: cwd.split("/").pop() || cwd,
    sessions: [
      {
        id: "sess-1",
        projectHash,
        path: "/tmp/test.jsonl",
        startTime: "2026-01-01T00:00:00Z",
        lastModified: "2026-01-01T00:00:00Z",
        eventCount: 1,
        subagentCount: 0,
      },
    ],
    lastActive: "2026-01-01T00:00:00Z",
    hasActiveSessions: false,
  });

  it("creates slug-to-projectHash mapping for unique basenames", () => {
    const repos = [
      makeRepo("/Users/soh/ai/claude-devtools", "-Users-soh-ai-claude-devtools"),
      makeRepo("/Users/soh/ai/mas-template", "-Users-soh-ai-mas-template"),
    ];
    const map = buildSlugMap(repos);
    expect(map.get("claude-devtools")).toBe("-Users-soh-ai-claude-devtools");
    expect(map.get("mas-template")).toBe("-Users-soh-ai-mas-template");
  });

  it("resolves collisions by appending projectHash prefix", () => {
    const repos = [
      makeRepo("/Users/alice/work/myapp", "-Users-alice-work-myapp"),
      makeRepo("/Users/bob/work/myapp", "-Users-bob-work-myapp"),
    ];
    const map = buildSlugMap(repos);
    // Both have basename "myapp" -- should get disambiguated
    const slugs = [...map.keys()];
    expect(slugs).toHaveLength(2);
    // Each slug should be unique and resolve correctly
    for (const [slug, hash] of map) {
      expect(slug).toContain("myapp");
      expect(hash).toBeTruthy();
    }
    // The two slugs should be different
    expect(slugs[0]).not.toBe(slugs[1]);
  });

  it("returns empty map for empty repos", () => {
    const map = buildSlugMap([]);
    expect(map.size).toBe(0);
  });

  it("handles repos with multiple sessions (uses first session projectHash)", () => {
    const repo: RepoGroup = {
      cwd: "/Users/soh/ai/claude-devtools",
      repoName: "claude-devtools",
      sessions: [
        {
          id: "sess-1",
          projectHash: "-Users-soh-ai-claude-devtools",
          path: "/tmp/test1.jsonl",
          startTime: "2026-01-01T00:00:00Z",
          lastModified: "2026-01-01T00:00:00Z",
          eventCount: 1,
          subagentCount: 0,
        },
        {
          id: "sess-2",
          projectHash: "-Users-soh-ai-claude-devtools",
          path: "/tmp/test2.jsonl",
          startTime: "2026-01-01T00:00:00Z",
          lastModified: "2026-01-01T00:00:00Z",
          eventCount: 1,
          subagentCount: 0,
        },
      ],
      lastActive: "2026-01-01T00:00:00Z",
      hasActiveSessions: false,
    };
    const map = buildSlugMap([repo]);
    expect(map.get("claude-devtools")).toBe("-Users-soh-ai-claude-devtools");
  });
});

describe("resolveSlugToProjectHash", () => {
  it("resolves a known slug", () => {
    const map = new Map([["claude-devtools", "-Users-soh-ai-claude-devtools"]]);
    expect(resolveSlugToProjectHash("claude-devtools", map)).toBe(
      "-Users-soh-ai-claude-devtools",
    );
  });

  it("returns null for unknown slug", () => {
    const map = new Map([["claude-devtools", "-Users-soh-ai-claude-devtools"]]);
    expect(resolveSlugToProjectHash("unknown-repo", map)).toBeNull();
  });
});

describe("resolveProjectHashForFetch", () => {
  // Guards the slug->projectHash race on reload. SessionPage fires a fetch
  // as soon as it renders. If repos haven't loaded yet the slugMap is empty,
  // and falling back to the URL slug produces /api/sessions/<slug>/<id> which
  // 404s because the slug is not a valid projectHash.

  it("T-RELOAD-1: returns null while repos are loading and slugMap is empty", () => {
    // Reload case: SessionPage mounts before /api/repos resolves. We must
    // hold the fetch instead of firing it with a URL slug the server will 404.
    const emptyMap = new Map<string, string>();
    const result = resolveProjectHashForFetch("claude-devtools", emptyMap, true);
    expect(result).toBeNull();
  });

  it("T-RELOAD-2: returns mapped projectHash once slugMap is populated", () => {
    // After /api/repos resolves, SessionPage re-renders and the fetch
    // fires correctly on the first try with the real projectHash.
    const slugMap = new Map([
      ["claude-devtools", "-Users-soh-working-ai-claude-devtools"],
    ]);
    const result = resolveProjectHashForFetch("claude-devtools", slugMap, false);
    expect(result).toBe("-Users-soh-working-ai-claude-devtools");
  });

  it("T-RELOAD-3: last-ditch fallback when repos finished loading but slug is unknown", () => {
    // Preserves pre-fix behavior for genuinely unknown projects: if repos
    // have finished loading and no matching slug exists, pass through the
    // URL slug so the server can respond (even if with a 404).
    const emptyMap = new Map<string, string>();
    const result = resolveProjectHashForFetch("claude-devtools", emptyMap, false);
    expect(result).toBe("claude-devtools");
  });

  it("returns mapped hash even while reposLoading=true if slugMap already has the slug", () => {
    // If a previous load populated the map (e.g. route change, not reload),
    // we should use the known mapping regardless of loading flag.
    const slugMap = new Map([
      ["claude-devtools", "-Users-soh-working-ai-claude-devtools"],
    ]);
    const result = resolveProjectHashForFetch("claude-devtools", slugMap, true);
    expect(result).toBe("-Users-soh-working-ai-claude-devtools");
  });
});
