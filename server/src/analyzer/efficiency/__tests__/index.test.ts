import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeHints, getEvidence, __resetCache } from "../index.js";

vi.mock("../../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => []),
  loadFullSession: vi.fn(() => ({ mainEvents: [], subagentEvents: new Map(), subagentMeta: new Map() })),
}));

describe("computeHints", () => {
  beforeEach(() => {
    __resetCache();
  });

  it("returns a valid HintsResponse with empty sessions", () => {
    const result = computeHints("7d");
    expect(result.range).toBe("7d");
    expect(result.hints).toEqual([]);
    expect(result.sessionCount).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it("accepts different valid ranges", () => {
    const result24h = computeHints("24h");
    expect(result24h.range).toBe("24h");

    const result30d = computeHints("30d");
    expect(result30d.range).toBe("30d");
  });
});

describe("getEvidence", () => {
  beforeEach(() => {
    __resetCache();
  });

  it("returns undefined for unknown hint", () => {
    expect(getEvidence("nonexistent-7d")).toBeUndefined();
  });

  it("returns undefined when cache is empty", () => {
    expect(getEvidence("wasted_retries-7d")).toBeUndefined();
  });
});
