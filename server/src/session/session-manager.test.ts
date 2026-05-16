import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock the SDK so sendMessage doesn't need a real Claude session
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

// Mock session discovery so summarizeUpTo can resolve the JSONL path
// to a tempfile we control in tests.
const mockDiscoverSessions = vi.fn();
vi.mock("../parser/session-discovery.js", () => ({
  discoverSessions: () => mockDiscoverSessions(),
}));

import { SessionManager } from "./session-manager.js";

describe("SessionManager permission mode", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
  });

  afterEach(() => {
    manager.dispose();
  });

  it("defaults permissionMode to 'default'", async () => {
    const sessionId = await manager.startSession("/tmp");
    const session = manager.getStatus(sessionId);
    expect(session?.permissionMode).toBe("default");
  });

  it("setPermissionMode changes the mode", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = manager.setPermissionMode(sessionId, "acceptEdits");
    expect(result).toBe(true);
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("acceptEdits");
  });

  it("setPermissionMode returns false for unknown session", () => {
    const result = manager.setPermissionMode("nonexistent", "plan");
    expect(result).toBe(false);
  });

  it("setPermissionMode cycles through all modes", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "acceptEdits");
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("acceptEdits");
    manager.setPermissionMode(sessionId, "plan");
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("plan");
    manager.setPermissionMode(sessionId, "default");
    expect(manager.getStatus(sessionId)?.permissionMode).toBe("default");
  });
});

describe("SessionManager permission mode (SDK-native handling)", () => {
  let manager: SessionManager;
  beforeEach(() => {
    manager = new SessionManager(vi.fn() as (data: unknown) => void);
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("passes permissionMode to query() options when set to acceptEdits", async () => {
    async function* emptyStream() { /* no messages */ }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "acceptEdits");

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) { /* drain */ }

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("acceptEdits");
  });

  it("passes permissionMode to query() options when set to plan", async () => {
    async function* emptyStream() { /* no messages */ }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "plan");

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) { /* drain */ }

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("plan");
  });

  it("passes allowDangerouslySkipPermissions when bypassPermissions mode", async () => {
    async function* emptyStream() { /* no messages */ }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "bypassPermissions");

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) { /* drain */ }

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true);
  });

  it("defaults permissionMode to 'default' in query() options", async () => {
    async function* emptyStream() { /* no messages */ }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) { /* drain */ }

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("default");
  });
});

describe("SessionManager fastMode", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
  });

  afterEach(() => {
    manager.dispose();
  });

  it("defaults fastMode to false", async () => {
    const sessionId = await manager.startSession("/tmp");
    const session = manager.getStatus(sessionId);
    expect(session?.fastMode).toBe(false);
  });

  it("setFastMode toggles fastMode on", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = manager.setFastMode(sessionId, true);
    expect(result).toBe(true);
    expect(manager.getStatus(sessionId)?.fastMode).toBe(true);
  });

  it("setFastMode toggles fastMode off", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setFastMode(sessionId, true);
    manager.setFastMode(sessionId, false);
    expect(manager.getStatus(sessionId)?.fastMode).toBe(false);
  });

  it("setFastMode returns false for unknown session", () => {
    const result = manager.setFastMode("nonexistent", true);
    expect(result).toBe(false);
  });
});

describe("SessionManager effortLevel", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
  });

  afterEach(() => {
    manager.dispose();
  });

  it("defaults effortLevel to undefined", async () => {
    const sessionId = await manager.startSession("/tmp");
    const session = manager.getStatus(sessionId);
    expect(session?.effortLevel).toBeUndefined();
  });

  it("setEffortLevel sets level to low", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = manager.setEffortLevel(sessionId, "low");
    expect(result).toBe(true);
    expect(manager.getStatus(sessionId)?.effortLevel).toBe("low");
  });

  it("setEffortLevel sets level to medium", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setEffortLevel(sessionId, "medium");
    expect(manager.getStatus(sessionId)?.effortLevel).toBe("medium");
  });

  it("setEffortLevel sets level to high", async () => {
    const sessionId = await manager.startSession("/tmp");
    manager.setEffortLevel(sessionId, "high");
    expect(manager.getStatus(sessionId)?.effortLevel).toBe("high");
  });

  it("setEffortLevel returns false for unknown session", () => {
    const result = manager.setEffortLevel("nonexistent", "low");
    expect(result).toBe(false);
  });
});

describe("SessionManager stores activeQuery on ActiveSession", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("stores activeQuery during streaming and clears on completion", async () => {
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      await yieldPromise;
      yield { type: "assistant", message: { content: [] } };
    }
    mockQuery.mockReturnValue(slowStream());

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");

    // Start consuming but don't finish
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();

    // While streaming, activeQuery should be set
    // (We need a small delay for the async generator to start)
    await new Promise((r) => setTimeout(r, 10));
    const sessionDuring = manager.getStatus(sessionId);
    expect(sessionDuring?.activeQuery).toBeDefined();

    // Let it complete
    resolveYield!();
    await iterPromise;

    // After completion, activeQuery should be cleared
    const sessionAfter = manager.getStatus(sessionId);
    expect(sessionAfter?.activeQuery).toBeUndefined();
  });

  it("clears activeQuery on error", async () => {
    async function* errorStream() {
      yield* [];
      throw new Error("SDK error");
    }
    mockQuery.mockReturnValue(errorStream());

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");

    await expect(async () => {
      for await (const _msg of gen) { /* drain */ }
    }).rejects.toThrow("SDK error");

    const session = manager.getStatus(sessionId);
    expect(session?.activeQuery).toBeUndefined();
  });
});

describe("SessionManager.setModel calls SDK method mid-stream", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("calls activeQuery.setModel() when session is streaming", async () => {
    const mockSetModel = vi.fn().mockResolvedValue(undefined);
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).setModel = mockSetModel;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();

    await new Promise((r) => setTimeout(r, 10));

    // Call setModel mid-stream
    const result = manager.setModel(sessionId, "claude-opus-4-6");
    expect(result).toBe(true);
    expect(mockSetModel).toHaveBeenCalledWith("claude-opus-4-6");

    resolveYield!();
    await iterPromise;
  });

  it("falls back to session state when not streaming", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = manager.setModel(sessionId, "claude-opus-4-6");
    expect(result).toBe(true);
    expect(manager.getStatus(sessionId)!.model).toBe("claude-opus-4-6");
  });
});

describe("SessionManager.setPermissionMode with SDK modes", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("accepts all 5 valid SDK permission modes", async () => {
    const sessionId = await manager.startSession("/tmp");
    const modes: Array<import("./session-manager.js").PermissionMode> = [
      "default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"
    ];
    for (const mode of modes) {
      expect(SessionManager.isValidPermissionMode(mode)).toBe(true);
      expect(manager.setPermissionMode(sessionId, mode)).toBe(true);
      expect(manager.getStatus(sessionId)?.permissionMode).toBe(mode);
    }
  });

  it("accepts 'auto' as a valid permission mode", () => {
    expect(SessionManager.isValidPermissionMode("auto")).toBe(true);
  });

  it("rejects invalid permission modes", () => {
    expect(SessionManager.isValidPermissionMode("invalid")).toBe(false);
  });

  it("calls activeQuery.setPermissionMode() when streaming", async () => {
    const mockSetPermissionMode = vi.fn().mockResolvedValue(undefined);
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).setPermissionMode = mockSetPermissionMode;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();

    await new Promise((r) => setTimeout(r, 10));

    manager.setPermissionMode(sessionId, "acceptEdits");
    expect(mockSetPermissionMode).toHaveBeenCalledWith("acceptEdits");

    resolveYield!();
    await iterPromise;
  });

  it("passes permissionMode to query() options", async () => {
    async function* emptyStream() { /* no messages */ }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    manager.setPermissionMode(sessionId, "acceptEdits");

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) { /* drain */ }

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("acceptEdits");
  });
});

describe("SessionManager.rewindFiles", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("calls activeQuery.rewindFiles() when streaming", async () => {
    const mockRewindFiles = vi.fn().mockResolvedValue({
      canRewind: true,
      filesChanged: ["src/App.tsx"],
      insertions: 5,
      deletions: 2,
    });
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).rewindFiles = mockRewindFiles;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();

    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.rewindFiles(sessionId, "msg-123", false);
    expect(result).toEqual({
      canRewind: true,
      filesChanged: ["src/App.tsx"],
      insertions: 5,
      deletions: 2,
    });
    expect(mockRewindFiles).toHaveBeenCalledWith("msg-123", { dryRun: false });

    resolveYield!();
    await iterPromise;
  });

  it("returns error when no activeQuery", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = await manager.rewindFiles(sessionId, "msg-123", false);
    expect(result).toEqual({
      canRewind: false,
      error: "No active query — session must be streaming to rewind files",
    });
  });

  it("returns error for unknown session", async () => {
    const result = await manager.rewindFiles("nonexistent", "msg-123", false);
    expect(result).toEqual({
      canRewind: false,
      error: "Session not found",
    });
  });

  it("passes enableFileCheckpointing to query() options", async () => {
    async function* emptyStream() { /* no messages */ }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) { /* drain */ }

    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.enableFileCheckpointing).toBe(true);
  });
});

describe("SessionManager.sendMessage passes effortLevel to SDK query()", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("passes effort option to query() when effortLevel is set", async () => {
    // Create an async generator that yields nothing (empty stream)
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    manager.setEffortLevel(sessionId, "low");

    // Consume the async generator
    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.effort).toBe("low");
  });

  it("does not pass effort option when effortLevel is undefined", async () => {
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    // effortLevel is undefined by default

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.effort).toBeUndefined();
  });
});

describe("SessionManager.summarizeUpTo bounds /compact at picked messageId", () => {
  let manager: SessionManager;
  let tmpDir: string;
  let jsonlPath: string;

  // Three real user prompts (string content) interleaved with an isMeta
  // wrapper and a tool_result reply — both must be skipped by the counter.
  const lines = [
    JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "first prompt" } }),
    JSON.stringify({ type: "assistant", uuid: "a1" }),
    JSON.stringify({ type: "user", uuid: "meta1", isMeta: true, message: { role: "user", content: [{ type: "text", text: "skill expansion" }] } }),
    JSON.stringify({ type: "user", uuid: "tr1", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "out" }] } }),
    JSON.stringify({ type: "user", uuid: "u2", message: { role: "user", content: "second prompt" } }),
    JSON.stringify({ type: "assistant", uuid: "a2" }),
    JSON.stringify({ type: "user", uuid: "u3", message: { role: "user", content: "third prompt" } }),
  ];

  beforeEach(async () => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
    mockDiscoverSessions.mockReset();

    tmpDir = mkdtempSync(join(tmpdir(), "summarize-up-to-"));
    jsonlPath = join(tmpDir, "session.jsonl");
    writeFileSync(jsonlPath, lines.join("\n") + "\n", "utf-8");
  });

  afterEach(() => {
    manager.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("counts user turns and dispatches a bounded /compact prompt", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([
      { id: sessionId, path: jsonlPath },
    ]);

    // Stub sendMessage to capture the bounded prompt without invoking the SDK.
    async function* drainable() { /* no-op */ }
    const sendMessageSpy = vi
      .spyOn(manager, "sendMessage")
      .mockImplementation((..._args: unknown[]) => drainable() as unknown as AsyncGenerator<unknown>);

    // u2 is the 2nd real user prompt (meta + tool_result-only are skipped).
    const { turnNumber, stream } = await manager.summarizeUpTo(sessionId, "u2");
    expect(turnNumber).toBe(2);

    // Drain the returned stream to satisfy the AsyncGenerator contract.
    for await (const _ of stream) { /* drain */ }

    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    const [calledSessionId, calledPrompt] = sendMessageSpy.mock.calls[0] as [string, string];
    expect(calledSessionId).toBe(sessionId);
    expect(calledPrompt.startsWith("/compact ")).toBe(true);
    expect(calledPrompt).toContain("user turn 2");
    expect(calledPrompt).toContain("Preserve verbatim");
  });

  it("returns turnNumber=1 for the first real user prompt", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([{ id: sessionId, path: jsonlPath }]);

    async function* drainable() { /* no-op */ }
    vi.spyOn(manager, "sendMessage").mockImplementation(
      (..._args: unknown[]) => drainable() as unknown as AsyncGenerator<unknown>
    );

    const { turnNumber } = await manager.summarizeUpTo(sessionId, "u1");
    expect(turnNumber).toBe(1);
  });

  it("returns turnNumber=3 when picked uuid is the third real prompt", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([{ id: sessionId, path: jsonlPath }]);

    async function* drainable() { /* no-op */ }
    vi.spyOn(manager, "sendMessage").mockImplementation(
      (..._args: unknown[]) => drainable() as unknown as AsyncGenerator<unknown>
    );

    const { turnNumber } = await manager.summarizeUpTo(sessionId, "u3");
    expect(turnNumber).toBe(3);
  });

  it("throws when messageId is not found in the JSONL", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([{ id: sessionId, path: jsonlPath }]);

    await expect(
      manager.summarizeUpTo(sessionId, "does-not-exist")
    ).rejects.toThrow(/Message does-not-exist not found/);
  });

  it("throws when the session has no JSONL on disk yet", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([]); // no JSONL discovered

    await expect(
      manager.summarizeUpTo(sessionId, "u1")
    ).rejects.toThrow(/Session JSONL not found/);
  });

  it("throws when the session is not registered", async () => {
    mockDiscoverSessions.mockReturnValue([]);
    await expect(
      manager.summarizeUpTo("unknown-session", "u1")
    ).rejects.toThrow(/Session unknown-session not found/);
  });

  it("skips malformed JSONL lines without crashing", async () => {
    const corrupted = [
      JSON.stringify({ type: "user", uuid: "u1", message: { role: "user", content: "a" } }),
      "{not valid json",
      JSON.stringify({ type: "user", uuid: "u2", message: { role: "user", content: "b" } }),
    ].join("\n") + "\n";
    writeFileSync(jsonlPath, corrupted, "utf-8");

    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([{ id: sessionId, path: jsonlPath }]);

    async function* drainable() { /* no-op */ }
    vi.spyOn(manager, "sendMessage").mockImplementation(
      (..._args: unknown[]) => drainable() as unknown as AsyncGenerator<unknown>
    );

    const { turnNumber } = await manager.summarizeUpTo(sessionId, "u2");
    expect(turnNumber).toBe(2);
  });
});
