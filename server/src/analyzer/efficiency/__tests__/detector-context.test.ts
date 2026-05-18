import { describe, it, expect, vi } from "vitest";
import { buildDetectorContext } from "../detector-context.js";

vi.mock("../../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => [
    { id: "s1", startTime: new Date(Date.now() - 3_600_000).toISOString(), lastModified: new Date().toISOString(), path: "/tmp/s1.jsonl", projectHash: "proj-a", cwd: "/repo-a", eventCount: 50, subagentCount: 0 },
    { id: "s2", startTime: new Date(Date.now() - 86_400_000 * 3).toISOString(), lastModified: new Date(Date.now() - 86_400_000 * 3).toISOString(), path: "/tmp/s2.jsonl", projectHash: "proj-a", cwd: "/repo-b", eventCount: 30, subagentCount: 0 },
    { id: "s3", startTime: new Date(Date.now() - 86_400_000 * 10).toISOString(), lastModified: new Date(Date.now() - 86_400_000 * 10).toISOString(), path: "/tmp/s3.jsonl", projectHash: "proj-b", cwd: "/repo-a", eventCount: 20, subagentCount: 0 },
  ]),
}));

describe("buildDetectorContext", () => {
  it("splits sessions into current and prior period", () => {
    const ctx = buildDetectorContext("7d");
    // s1 (1h ago) and s2 (3d ago) are within 7d window
    expect(ctx.sessions.length).toBe(2);
    // s3 (10d ago) is in prior 7d window (7d-14d ago)
    expect(ctx.priorSessions.length).toBe(1);
    expect(ctx.range).toBe("7d");
  });

  it("filters current and prior sessions by repo cwd", () => {
    const ctx = buildDetectorContext("7d", "/repo-a");
    expect(ctx.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(ctx.priorSessions.map((s) => s.id)).toEqual(["s3"]);
    expect(ctx.repo).toBe("/repo-a");
  });

  it("returns empty arrays when no sessions", async () => {
    const { discoverSessions } = await import("../../../parser/session-discovery.js");
    (discoverSessions as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    const ctx = buildDetectorContext("7d");
    expect(ctx.sessions).toEqual([]);
    expect(ctx.priorSessions).toEqual([]);
  });
});
