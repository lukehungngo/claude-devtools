import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
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

describe("SessionManager.sendMessage busy guard (F2)", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
  });

  afterEach(() => {
    manager.dispose();
  });

  it("rejects a second sendMessage while the session is waiting-permission and does NOT replace the live AbortController", async () => {
    const sessionId = await manager.startSession("/tmp");
    const session = manager.getStatus(sessionId)!;
    // First turn is parked on a permission / AskUserQuestion prompt.
    session.status = "waiting-permission";
    const liveController = session.abortController;

    // sendMessage is an async generator — the guard runs on first .next().
    const gen = manager.sendMessage(sessionId, "second");
    await expect(gen.next()).rejects.toThrow(/already streaming|busy/i);

    // The live turn's controller must be untouched (no concurrent query()).
    expect(session.abortController).toBe(liveController);
    expect(session.abortController.signal.aborted).toBe(false);
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

describe("SessionManager.getContextUsage", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("delegates to activeQuery.getContextUsage() when session is live", async () => {
    const fakeUsage = {
      totalTokens: 12345,
      maxTokens: 200000,
      percentage: 6.1,
      autoCompactThreshold: 0.92,
      isAutoCompactEnabled: true,
      categories: [],
      gridRows: [],
      model: "claude-sonnet-4-6",
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      apiUsage: null,
    } as const;
    const mockGetContextUsage = vi.fn().mockResolvedValue(fakeUsage);
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).getContextUsage = mockGetContextUsage;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.getContextUsage(sessionId);
    expect(mockGetContextUsage).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fakeUsage);

    resolveYield!();
    await iterPromise;
  });

  it("returns null when session has no activeQuery (not live)", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = await manager.getContextUsage(sessionId);
    expect(result).toBeNull();
  });

  it("returns null when session is unknown", async () => {
    const result = await manager.getContextUsage("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when SDK getContextUsage throws", async () => {
    const mockGetContextUsage = vi.fn().mockRejectedValue(new Error("SDK boom"));
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).getContextUsage = mockGetContextUsage;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.getContextUsage(sessionId);
    expect(result).toBeNull();

    resolveYield!();
    await iterPromise;
  });
});

describe("SessionManager.getSupportedAgents", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("delegates to activeQuery.supportedAgents() when session is live", async () => {
    const fakeAgents = [
      { name: "Explore", description: "Search the codebase", model: "claude-sonnet-4-6" },
      { name: "Reviewer", description: "Code review" },
    ];
    const mockSupportedAgents = vi.fn().mockResolvedValue(fakeAgents);
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).supportedAgents = mockSupportedAgents;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.getSupportedAgents(sessionId);
    expect(mockSupportedAgents).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fakeAgents);

    resolveYield!();
    await iterPromise;
  });

  it("returns null when session has no activeQuery (not live)", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = await manager.getSupportedAgents(sessionId);
    expect(result).toBeNull();
  });

  it("returns null when session is unknown", async () => {
    const result = await manager.getSupportedAgents("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when SDK supportedAgents throws", async () => {
    const mockSupportedAgents = vi.fn().mockRejectedValue(new Error("SDK boom"));
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).supportedAgents = mockSupportedAgents;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.getSupportedAgents(sessionId);
    expect(result).toBeNull();

    resolveYield!();
    await iterPromise;
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

// NEW-4 — query.mcpServerStatus() surface
describe("SessionManager.getMcpServerStatus", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
    mockDiscoverSessions.mockReset();
    mockDiscoverSessions.mockReturnValue([]);
  });

  afterEach(() => {
    manager.dispose();
  });

  it("delegates to activeQuery.mcpServerStatus() when session is live", async () => {
    const fakeServers = [
      {
        name: "exa",
        status: "connected",
        serverInfo: { name: "exa", version: "1.0.0" },
        scope: "user",
        config: { type: "http", url: "https://exa.example.com" },
      },
      {
        name: "broken",
        status: "failed",
        error: "ECONNREFUSED",
        scope: "project",
        config: { type: "stdio", command: "broken-server" },
      },
    ];
    const mockMcpStatus = vi.fn().mockResolvedValue(fakeServers);
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).mcpServerStatus = mockMcpStatus;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.getMcpServerStatus(sessionId);
    expect(mockMcpStatus).toHaveBeenCalledTimes(1);
    expect(result).toEqual(fakeServers);

    resolveYield!();
    await iterPromise;
  });

  it("returns empty list when session has no activeQuery and no on-disk MCP config (Bug F fallback)", async () => {
    // Bug F: a cold session (no activeQuery) used to return null, blanking
    // the dashboard MCP tab. Now we fall back to disk; if disk has nothing
    // we return [] (still empty, but a non-null signal that we tried).
    const tmpEmpty = mkdtempSync(join(tmpdir(), "mcp-empty-"));
    try {
      const sessionId = await manager.startSession("/tmp");
      mockDiscoverSessions.mockReturnValue([
        { id: sessionId, path: join(tmpEmpty, "session.jsonl"), cwd: tmpEmpty },
      ]);
      const result = await manager.getMcpServerStatus(sessionId);
      expect(result).toEqual([]);
    } finally {
      rmSync(tmpEmpty, { recursive: true, force: true });
    }
  });

  it("returns null when session is unknown", async () => {
    const result = await manager.getMcpServerStatus("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when SDK mcpServerStatus throws", async () => {
    const mockMcpStatus = vi.fn().mockRejectedValue(new Error("SDK boom"));
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).mcpServerStatus = mockMcpStatus;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.getMcpServerStatus(sessionId);
    expect(result).toBeNull();

    resolveYield!();
    await iterPromise;
  });
});

// Bug F — disk fallback for cold (CLI-launched) sessions
describe("SessionManager.getMcpServerStatus — disk fallback (Bug F)", () => {
  let manager: SessionManager;
  let tmpDir: string;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
    mockDiscoverSessions.mockReset();
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-disk-fallback-"));
  });

  afterEach(() => {
    manager.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads servers from <cwd>/.mcp.json when session has no activeQuery", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([
      { id: sessionId, path: join(tmpDir, "session.jsonl"), cwd: tmpDir },
    ]);
    writeFileSync(
      join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "claude-devtools": {
            type: "http",
            url: "http://localhost:5557/mcp",
          },
          "exa": {
            command: "exa-mcp",
            args: ["--api-key", "xxx"],
          },
        },
      }),
      "utf-8"
    );

    const result = await manager.getMcpServerStatus(sessionId);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const byName = Object.fromEntries((result ?? []).map((s) => [s.name, s]));
    expect(byName["claude-devtools"].status).toBe("configured");
    expect(byName["claude-devtools"].scope).toBe("project");
    expect(byName["claude-devtools"].config?.type).toBe("http");
    expect((byName["claude-devtools"].config as { url?: string }).url).toBe("http://localhost:5557/mcp");
    expect(byName["exa"].status).toBe("configured");
    expect(byName["exa"].scope).toBe("project");
    expect((byName["exa"].config as { command?: string }).command).toBe("exa-mcp");
  });

  it("merges servers from <cwd>/.claude/settings.json with project precedence", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([
      { id: sessionId, path: join(tmpDir, "session.jsonl"), cwd: tmpDir },
    ]);
    // project-level .mcp.json defines "a"
    writeFileSync(
      join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          a: { type: "http", url: "http://example.com/a" },
        },
      }),
      "utf-8"
    );
    // project-local settings.json defines "b"
    const claudeDir = join(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        mcpServers: {
          b: { command: "b-cmd", args: [] },
        },
      }),
      "utf-8"
    );

    const result = await manager.getMcpServerStatus(sessionId);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    const names = (result ?? []).map((s) => s.name).sort();
    expect(names).toEqual(["a", "b"]);
  });

  it("project .mcp.json wins on name conflict with .claude/settings.local.json", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([
      { id: sessionId, path: join(tmpDir, "session.jsonl"), cwd: tmpDir },
    ]);
    writeFileSync(
      join(tmpDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          dup: { type: "http", url: "http://project.example.com" },
        },
      }),
      "utf-8"
    );
    const claudeDir = join(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.local.json"),
      JSON.stringify({
        mcpServers: {
          dup: { command: "local-cmd" },
        },
      }),
      "utf-8"
    );

    const result = await manager.getMcpServerStatus(sessionId);
    expect(result).toHaveLength(1);
    const dup = (result ?? [])[0];
    expect(dup.name).toBe("dup");
    expect(dup.scope).toBe("project");
    expect((dup.config as { url?: string }).url).toBe("http://project.example.com");
  });

  it("skips malformed .mcp.json without crashing", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([
      { id: sessionId, path: join(tmpDir, "session.jsonl"), cwd: tmpDir },
    ]);
    writeFileSync(join(tmpDir, ".mcp.json"), "{not valid json", "utf-8");

    const result = await manager.getMcpServerStatus(sessionId);
    expect(result).toEqual([]);
  });

  it("returns null when session has no cwd in discovery", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([
      { id: sessionId, path: join(tmpDir, "session.jsonl") }, // no cwd
    ]);
    const result = await manager.getMcpServerStatus(sessionId);
    expect(result).toBeNull();
  });

  it("returns null when session not found in discovery and no activeQuery", async () => {
    const sessionId = await manager.startSession("/tmp");
    mockDiscoverSessions.mockReturnValue([]); // not discovered
    const result = await manager.getMcpServerStatus(sessionId);
    expect(result).toBeNull();
  });
});

// NEW-5 — query.backgroundTasks() surface
describe("SessionManager.backgroundTask", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("delegates to activeQuery.backgroundTasks() and forwards toolUseId", async () => {
    const mockBackgroundTasks = vi.fn().mockResolvedValue(true);
    let resolveYield: (() => void) | null = null;
    const yieldPromise = new Promise<void>((resolve) => { resolveYield = resolve; });

    async function* slowStream() {
      yield* [];
      await yieldPromise;
    }
    const queryObj = slowStream();
    (queryObj as unknown as Record<string, unknown>).backgroundTasks = mockBackgroundTasks;
    mockQuery.mockReturnValue(queryObj);

    const sessionId = await manager.startSession("/tmp");
    const gen = manager.sendMessage(sessionId, "hello");
    const iterPromise = (async () => {
      for await (const _msg of gen) { /* drain */ }
    })();
    await new Promise((r) => setTimeout(r, 10));

    const result = await manager.backgroundTask(sessionId, "toolu_abc");
    expect(mockBackgroundTasks).toHaveBeenCalledWith("toolu_abc");
    expect(result).toBe(true);

    resolveYield!();
    await iterPromise;
  });

  it("returns false when session has no activeQuery", async () => {
    const sessionId = await manager.startSession("/tmp");
    const result = await manager.backgroundTask(sessionId, "toolu_abc");
    expect(result).toBe(false);
  });
});
