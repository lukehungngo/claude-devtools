import { describe, it, expect } from "vitest";
import { parseRange, cutoffMs } from "./range.js";

describe("parseRange", () => {
  it.each(["24h", "7d", "30d", "90d", "all"] as const)("accepts %s", (v) => {
    expect(parseRange(v)).toBe(v);
  });
  it("throws on invalid", () => {
    expect(() => parseRange("bogus")).toThrow(/range/);
  });
});

describe("cutoffMs", () => {
  it("returns 0 for 'all'", () => {
    expect(cutoffMs("all", Date.now())).toBe(0);
  });
  it("returns now-7d for '7d'", () => {
    const now = 1_700_000_000_000;
    expect(cutoffMs("7d", now)).toBe(now - 7 * 86_400_000);
  });
  it("returns now-24h for '24h'", () => {
    const now = 1_700_000_000_000;
    expect(cutoffMs("24h", now)).toBe(now - 24 * 3_600_000);
  });
});
