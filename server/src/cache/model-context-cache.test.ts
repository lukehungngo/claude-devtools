import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";

vi.mock("node:fs/promises");
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(),
  };
});

describe("model-context-cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.mocked(readFileSync).mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  });

  it("returns undefined for unknown model when cache file missing", async () => {
    const { getModelContextWindow } = await import("./model-context-cache.js");
    expect(getModelContextWindow("claude-opus-4-7")).toBeUndefined();
  });

  it("returns contextWindow after updateModelContextWindows", async () => {
    const { getModelContextWindow, updateModelContextWindows } = await import("./model-context-cache.js");
    await updateModelContextWindows({ "claude-opus-4-7": { contextWindow: 1_000_000 } });
    expect(getModelContextWindow("claude-opus-4-7")).toBe(1_000_000);
  });

  it("loads existing cache from disk on first access", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ "claude-opus-4-7": 1_000_000 }) as unknown as ReturnType<typeof readFileSync>
    );
    const { getModelContextWindow } = await import("./model-context-cache.js");
    expect(getModelContextWindow("claude-opus-4-7")).toBe(1_000_000);
  });

  it("persists to disk on update", async () => {
    const { updateModelContextWindows } = await import("./model-context-cache.js");
    await updateModelContextWindows({ "claude-sonnet-4-6": { contextWindow: 200_000 } });
    expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
      expect.stringContaining("model-context-window.json"),
      expect.any(String),
      "utf-8",
    );
    const written = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(JSON.parse(written)).toEqual({ "claude-sonnet-4-6": 200_000 });
  });

  it("merges new entries without losing existing ones", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ "claude-opus-4-7": 1_000_000 }) as unknown as ReturnType<typeof readFileSync>
    );
    const { getModelContextWindow, updateModelContextWindows } = await import("./model-context-cache.js");
    await updateModelContextWindows({ "claude-haiku-4-5": { contextWindow: 200_000 } });
    expect(getModelContextWindow("claude-opus-4-7")).toBe(1_000_000);
    expect(getModelContextWindow("claude-haiku-4-5")).toBe(200_000);
  });

  it("skips write when nothing changed", async () => {
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ "claude-opus-4-7": 1_000_000 }) as unknown as ReturnType<typeof readFileSync>
    );
    const { updateModelContextWindows } = await import("./model-context-cache.js");
    await updateModelContextWindows({ "claude-opus-4-7": { contextWindow: 1_000_000 } });
    expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled();
  });
});
