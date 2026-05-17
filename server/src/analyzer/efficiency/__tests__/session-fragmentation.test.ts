import { describe, it, expect } from "vitest";
import { detectSessionFragmentation } from "../session-fragmentation.js";
import type { SessionInfo } from "../../../types.js";

function makeInfo(id: string, projectHash: string, startTime: number, eventCount: number): SessionInfo {
  return { id, projectHash, path: `/tmp/${id}.jsonl`, startTime: new Date(startTime).toISOString(), lastModified: new Date(startTime + 600_000).toISOString(), eventCount, subagentCount: 0 } as SessionInfo;
}

describe("detectSessionFragmentation", () => {
  it("flags multiple short sessions on same project same day", () => {
    const now = Date.now();
    const sessions = [
      makeInfo("s1", "proj-a", now - 3600_000, 10),
      makeInfo("s2", "proj-a", now - 1800_000, 8),
      makeInfo("s3", "proj-a", now - 900_000, 12),
    ];
    const result = detectSessionFragmentation(sessions);
    expect(result.detected).toBe(true);
    expect(result.punchline).toContain("3");
  });

  it("does not flag sessions on different projects", () => {
    const now = Date.now();
    const sessions = [
      makeInfo("s1", "proj-a", now - 3600_000, 10),
      makeInfo("s2", "proj-b", now - 1800_000, 8),
    ];
    const result = detectSessionFragmentation(sessions);
    expect(result.detected).toBe(false);
  });

  it("does not flag sessions with many events", () => {
    const now = Date.now();
    const sessions = [
      makeInfo("s1", "proj-a", now - 3600_000, 50),
      makeInfo("s2", "proj-a", now - 1800_000, 40),
      makeInfo("s3", "proj-a", now - 900_000, 30),
    ];
    const result = detectSessionFragmentation(sessions);
    expect(result.detected).toBe(false);
  });

  it("returns not detected for empty sessions", () => {
    const result = detectSessionFragmentation([]);
    expect(result.detected).toBe(false);
  });
});
