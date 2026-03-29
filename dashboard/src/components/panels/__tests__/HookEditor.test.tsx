import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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
