import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSlashCommand } from "./slashCommandHandler";
import type { SlashCommandContext } from "./slashCommandHandler";

function makeCtx(overrides: Partial<SlashCommandContext> = {}): SlashCommandContext {
  return {
    activeSessionId: "sess-1",
    sessionCwd: "/foo",
    sessionId: "sess-1",
    onSessionStarted: vi.fn(),
    ...overrides,
  };
}

describe("/fork command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls fork endpoint and shows new session ID", async () => {
    const showOutput = vi.fn();
    const ctx = makeCtx();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessionId: "new-sess-abc" }),
      })
    );

    const result = await handleSlashCommand("/fork", ctx, showOutput);
    expect(result).toBe(true);
    expect(showOutput).toHaveBeenCalledWith(expect.stringContaining("new-sess-abc"));
  });

  it("shows error when no active session", async () => {
    const showOutput = vi.fn();
    const noSessionCtx = makeCtx({ activeSessionId: undefined, sessionId: undefined });

    const result = await handleSlashCommand("/fork", noSessionCtx, showOutput);
    expect(result).toBe(true);
    expect(showOutput).toHaveBeenCalledWith(expect.stringContaining("No active session"));
  });
});

describe("/bug command", () => {
  it("opens GitHub issues page", async () => {
    const showOutput = vi.fn();
    const ctx = makeCtx();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);

    const result = await handleSlashCommand("/bug", ctx, showOutput);
    expect(result).toBe(true);
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("github.com"),
      "_blank"
    );
    expect(showOutput).toHaveBeenCalledWith(expect.stringContaining("issue"));

    openSpy.mockRestore();
  });
});

describe("slashCommandHandler — response.ok guard (P3 pattern)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("/clear: non-2xx with sessionId body does NOT call onSessionStarted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ sessionId: "bad-id" }),
      })
    );

    const showOutput = vi.fn();
    const ctx = makeCtx();
    await handleSlashCommand("/clear", ctx, showOutput);

    expect(ctx.onSessionStarted).not.toHaveBeenCalled();
  });

  it("/fast: non-2xx shows error output, does not silently succeed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: true }),
      })
    );

    const showOutput = vi.fn();
    const ctx = makeCtx();
    await handleSlashCommand("/fast on", ctx, showOutput);

    // showOutput must be called with failure message, not success
    expect(showOutput).toHaveBeenCalled();
    const output = (showOutput as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // "Failed to set fast mode." is the catch-block message — not the success path
    expect(output.toLowerCase()).toContain("fast mode");
    expect(output.toLowerCase()).not.toBe("fast mode enabled");
    expect(output.toLowerCase()).not.toBe("fast mode disabled");
  });
});
