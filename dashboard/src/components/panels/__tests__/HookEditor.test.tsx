import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { HOOK_EVENTS } from "@anthropic-ai/claude-agent-sdk";
import { HOOK_EVENTS_LOCAL } from "../../../lib/hookEvents";
import { HookEditor } from "../HookEditor";

describe("HookEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state initially", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    render(<HookEditor />);
    expect(screen.getByText("Loading hooks...")).toBeTruthy();
  });

  it("renders event type groups even when API returns no hooks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {} }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeTruthy();
      expect(screen.getByText("PostToolUse")).toBeTruthy();
    });
  });

  // SDK 0.3.143 exports HOOK_EVENTS as the authoritative list of 29 hook types.
  // Devtools must surface all of them so users can attach hooks to any.
  it("SDK HOOK_EVENTS contains 29 entries", () => {
    expect(HOOK_EVENTS.length).toBe(29);
  });

  // Drift guard: dashboard ships a local mirror of HOOK_EVENTS to keep the
  // SDK out of the Vite bundle (sdk.mjs has a shebang Vite cannot parse).
  // If the SDK adds or removes an event, this test fails loudly.
  it("HOOK_EVENTS_LOCAL mirrors the SDK list", () => {
    expect([...HOOK_EVENTS_LOCAL]).toEqual([...HOOK_EVENTS]);
  });

  it("lists all 29 SDK HOOK_EVENTS in the editor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {} }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      for (const eventType of HOOK_EVENTS) {
        expect(screen.getByText(eventType)).toBeTruthy();
      }
    });
  });

  // PostCompact and FileChanged are proxies for the 17 events added beyond
  // the legacy hardcoded 12 — assert they render to prove no regression.
  it("renders PostCompact and FileChanged (new SDK events beyond the legacy 12)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {} }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PostCompact")).toBeTruthy();
      expect(screen.getByText("FileChanged")).toBeTruthy();
    });
  });

  it("renders hooks grouped by event type", async () => {
    const hooks = {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "check-allowlist.sh" }] },
        { matcher: "Write", hooks: [{ type: "command", command: "lint-on-save.sh" }] },
      ],
      PostToolUse: [
        { matcher: "*", hooks: [{ type: "command", command: "log-tool-use.sh" }] },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeTruthy();
    });
    expect(screen.getByText("PostToolUse")).toBeTruthy();
  });

  it("renders legacy flat hook format", async () => {
    const hooks = {
      PreToolUse: [
        { matcher: "Bash", command: "check-allowlist.sh" },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeTruthy();
    });
    // Should show the hook with delete button (normalized from legacy format)
    expect(screen.getByLabelText("Delete hook matcher")).toBeTruthy();
  });

  it("has add hook button per event type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {} }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByLabelText("Add hook to PreToolUse")).toBeTruthy();
      expect(screen.getByLabelText("Add hook to PostToolUse")).toBeTruthy();
    });
  });

  it("adds a new matcher when add button is clicked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {} }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByLabelText("Add hook to PreToolUse")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Add hook to PreToolUse"));

    await waitFor(() => {
      expect(screen.getByLabelText("Delete hook matcher")).toBeTruthy();
    });
  });

  it("shows save button when hooks are modified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {} }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeTruthy();
    });

    // Initially no save button
    expect(screen.queryByLabelText("Save hooks")).toBeNull();

    fireEvent.click(screen.getByLabelText("Add hook to PreToolUse"));

    await waitFor(() => {
      expect(screen.getByLabelText("Save hooks")).toBeTruthy();
    });
  });

  it("calls PUT endpoint on save", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hooks: {} }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Add hook to PreToolUse"));

    await waitFor(() => {
      expect(screen.getByLabelText("Save hooks")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("Save hooks"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/settings/hooks",
        expect.objectContaining({
          method: "PUT",
        }),
      );
    });
  });

  it("renders directory hooks section when directoryHooks are present", async () => {
    const hooks = {};
    const directoryHooks = [
      {
        filename: "my-hooks.json",
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "dir-check.sh" }] },
          ],
        },
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks, directoryHooks }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("Directory Hooks")).toBeTruthy();
    });
    expect(screen.getByText("my-hooks.json")).toBeTruthy();
    expect(screen.getByText("dir-check.sh")).toBeTruthy();
  });

  it("does not render directory hooks section when directoryHooks is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {}, directoryHooks: [] }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeTruthy();
    });
    expect(screen.queryByText("Directory Hooks")).toBeNull();
  });

  it("renders multiple directory hook files", async () => {
    const directoryHooks = [
      {
        filename: "security.json",
        hooks: {
          PreToolUse: [
            { matcher: "*", hooks: [{ type: "command", command: "security-check.sh" }] },
          ],
        },
      },
      {
        filename: "logging.json",
        hooks: {
          PostToolUse: [
            { matcher: "*", hooks: [{ type: "command", command: "log.sh" }] },
          ],
        },
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {}, directoryHooks }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("Directory Hooks")).toBeTruthy();
    });
    expect(screen.getByText("security.json")).toBeTruthy();
    expect(screen.getByText("logging.json")).toBeTruthy();
  });

  it("directory hooks are read-only (no delete or add buttons)", async () => {
    const directoryHooks = [
      {
        filename: "my-hooks.json",
        hooks: {
          PreToolUse: [
            { matcher: "Bash", hooks: [{ type: "command", command: "dir-check.sh" }] },
          ],
        },
      },
    ];

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {}, directoryHooks }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("Directory Hooks")).toBeTruthy();
    });

    // The directory hooks section should not have any delete or add buttons
    const dirSection = screen.getByTestId("directory-hooks-section");
    expect(dirSection.querySelector("[aria-label='Delete hook matcher']")).toBeNull();
    expect(dirSection.querySelector("[aria-label*='Add hook']")).toBeNull();
  });

  it("collapses and expands hook groups on click", async () => {
    const hooks = {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: "check.sh" }] },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("PreToolUse")).toBeTruthy();
    });

    // Find the toggle button for PreToolUse
    const preToolUseButton = screen.getAllByRole("button").find(
      (btn) => btn.getAttribute("aria-expanded") === "true" && btn.textContent?.includes("PreToolUse"),
    )!;
    expect(preToolUseButton).toBeTruthy();

    // Collapse
    fireEvent.click(preToolUseButton);
    await waitFor(() => {
      expect(preToolUseButton.getAttribute("aria-expanded")).toBe("false");
    });
  });
});
