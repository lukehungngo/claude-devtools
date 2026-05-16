import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// NEW-6 — Isolated test file for SessionManager.stopTask. Lives in a
// dedicated file because the main session-manager.test.ts is concurrently
// being appended-to by other Wave 1 agents (NEW-3/4/5), causing race-y
// reverts. Keeping NEW-6 tests in their own module sidesteps the race.

const mockQuery = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock("../logger.js", () => ({
  sessionLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockDiscoverSessions = vi.fn();
vi.mock("../parser/session-discovery.js", () => ({
  discoverSessions: () => mockDiscoverSessions(),
}));

import { SessionManager } from "./session-manager.js";

describe("SessionManager.stopTask (NEW-6)", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("delegates to activeQuery.stopTask(taskId) and returns true on success", async () => {
    const mockStopTask = vi.fn().mockResolvedValue(undefined);
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => {
      resolveYield = resolve;
    });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).stopTask = mockStopTask;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) {
        /* drain */
      }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.stopTask(sessionId, "task-abc");
    expect(mockStopTask).toHaveBeenCalledTimes(1);
    expect(mockStopTask).toHaveBeenCalledWith("task-abc");
    expect(result).toBe(true);

    resolveYield!();
    await iterPromise;
  });

  it("returns false when session has no activeQuery (not live)", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = await manager.stopTask(sessionId, "task-xyz");
    expect(result).toBe(false);
  });
});
