import { describe, it, expect, beforeEach } from "vitest";
import { discoverSessions, discoverRepoGroups, invalidateDiscoveryCache } from "./session-discovery.js";

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
