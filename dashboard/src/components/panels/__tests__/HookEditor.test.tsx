import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HookEditor } from "../HookEditor";

describe("HookEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empty state when API returns no hooks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks: {} }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("No hooks configured")).toBeTruthy();
    });
  });

  it("renders hooks grouped by event type", async () => {
    const hooks = {
      PreToolUse: [
        { matcher: "Bash", command: "check-allowlist.sh" },
        { matcher: "Write", command: "lint-on-save.sh" },
      ],
      PostToolUse: [
        { matcher: "*", command: "log-tool-use.sh" },
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
    expect(screen.getByText("check-allowlist.sh")).toBeTruthy();
    expect(screen.getByText("lint-on-save.sh")).toBeTruthy();
    expect(screen.getByText("log-tool-use.sh")).toBeTruthy();
  });

  it("shows loading state initially", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    render(<HookEditor />);
    expect(screen.getByText("Loading hooks...")).toBeTruthy();
  });

  it("collapses and expands hook groups on click", async () => {
    const hooks = {
      PreToolUse: [
        { matcher: "Bash", command: "check.sh" },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ hooks }),
    } as Response);

    render(<HookEditor />);
    await waitFor(() => {
      expect(screen.getByText("check.sh")).toBeTruthy();
    });

    // Command should be visible initially (expanded by default)
    expect(screen.getByText("check.sh")).toBeTruthy();

    // Click the toggle button to collapse
    const preToolUseButton = screen.getAllByRole("button").find(
      (btn) => btn.getAttribute("aria-expanded") === "true"
    )!;
    expect(preToolUseButton).toBeTruthy();

    fireEvent.click(preToolUseButton);

    // Button should now be collapsed
    await waitFor(() => {
      expect(preToolUseButton.getAttribute("aria-expanded")).toBe("false");
    });
  });
});
