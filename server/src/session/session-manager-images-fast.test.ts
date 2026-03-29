import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK
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

import { SessionManager } from "./session-manager.js";

describe("SessionManager.sendMessage image support (P0-03)", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("passes content blocks when images are provided", async () => {
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    const images = [
      { mediaType: "image/png", data: "base64data1" },
      { mediaType: "image/jpeg", data: "base64data2" },
    ];

    const gen = manager.sendMessage(sessionId, "describe this", images);
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    // When images are provided, prompt should be an array of content blocks
    expect(Array.isArray(callArgs.prompt)).toBe(true);
    const blocks = callArgs.prompt as Array<{ type: string }>;
    expect(blocks[0]).toEqual({ type: "text", text: "describe this" });
    expect(blocks[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "base64data1" },
    });
    expect(blocks[2]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "base64data2" },
    });
  });

  it("passes plain string prompt when no images provided", async () => {
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.prompt).toBe("hello");
  });

  it("defaults image mediaType to image/png when not specified", async () => {
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    const images = [{ data: "base64data" }];

    const gen = manager.sendMessage(sessionId, "look at this", images);
    for await (const _msg of gen) {
      // drain
    }

    const callArgs = mockQuery.mock.calls[0][0];
    const blocks = callArgs.prompt as Array<Record<string, unknown>>;
    expect(blocks[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "base64data" },
    });
  });
});

describe("SessionManager.sendMessage passes fastMode to SDK query() (P0-04)", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(vi.fn());
    mockQuery.mockReset();
  });

  afterEach(() => {
    manager.dispose();
  });

  it("passes settings.fastMode=true to query() when fastMode is enabled", async () => {
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    manager.setFastMode(sessionId, true);

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    expect(callArgs.options.settings).toBeDefined();
    expect(callArgs.options.settings.fastMode).toBe(true);
  });

  it("does not pass settings.fastMode when fastMode is false", async () => {
    async function* emptyStream() {
      // no messages
    }
    mockQuery.mockReturnValue(emptyStream());

    const sessionId = await manager.startSession("/tmp");
    // fastMode defaults to false

    const gen = manager.sendMessage(sessionId, "hello");
    for await (const _msg of gen) {
      // drain
    }

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const callArgs = mockQuery.mock.calls[0][0];
    // settings should not include fastMode when it's false
    expect(callArgs.options.settings?.fastMode).toBeUndefined();
  });
});
