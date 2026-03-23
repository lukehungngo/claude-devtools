import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "./session-manager.js";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it("should start with no sessions", () => {
    expect(manager.getSession("nonexistent")).toBeUndefined();
  });

  it("closeSession should not throw for nonexistent session", () => {
    expect(() => manager.closeSession("nonexistent")).not.toThrow();
  });

  it("closeAll should not throw when empty", () => {
    expect(() => manager.closeAll()).not.toThrow();
  });

  it("startCleanup and stopCleanup should not throw", () => {
    expect(() => manager.startCleanup()).not.toThrow();
    expect(() => manager.stopCleanup()).not.toThrow();
  });

  it("setState should not throw", () => {
    const mockState = { clients: new Set() } as never;
    expect(() => manager.setState(mockState)).not.toThrow();
  });
});
