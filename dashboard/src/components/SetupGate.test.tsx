import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { SetupGate } from "./SetupGate";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SetupGate", () => {
  it("renders children when all checks pass", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          valid: true,
          checks: [
            { name: "cli", ok: true, detail: "Found" },
            { name: "projects_dir", ok: true, detail: "/home/.claude/projects" },
            { name: "sessions", ok: true, detail: "5 sessions found" },
          ],
        }),
    });

    const { container } = render(
      <SetupGate>
        <div data-testid="dashboard">Dashboard Content</div>
      </SetupGate>
    );

    await act(async () => {});

    expect(container.textContent).toContain("Dashboard Content");
  });

  it("shows validation errors when checks fail", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          valid: false,
          checks: [
            { name: "cli", ok: false, detail: "Claude Code CLI not found in PATH" },
            { name: "projects_dir", ok: true, detail: "/home/.claude/projects" },
            { name: "sessions", ok: false, detail: "0 sessions found" },
          ],
        }),
    });

    const { container } = render(
      <SetupGate>
        <div>Dashboard Content</div>
      </SetupGate>
    );

    await act(async () => {});

    expect(container.textContent).not.toContain("Dashboard Content");
    expect(container.textContent).toContain("Claude Code CLI");
    expect(container.textContent).toContain("Retry");
  });

  it("shows connection error on fetch failure", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    const { container } = render(
      <SetupGate>
        <div>Dashboard Content</div>
      </SetupGate>
    );

    await act(async () => {});

    expect(container.textContent).not.toContain("Dashboard Content");
    expect(container.textContent).toContain("Connection refused");
    expect(container.textContent).toContain("Retry");
  });
});
