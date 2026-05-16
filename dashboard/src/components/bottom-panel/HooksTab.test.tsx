import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { HooksTab } from "./HooksTab";
import type { SessionEvent, AttachmentEvent } from "../../lib/types";

function hookSuccess(
  uuid: string,
  overrides: Partial<{
    hookEvent: string;
    hookName: string;
    toolUseID: string;
    command: string;
    exitCode: number;
    durationMs: number;
    stdout: string;
    stderr: string;
  }> = {},
): AttachmentEvent {
  return {
    type: "attachment",
    uuid,
    parentUuid: "p1",
    timestamp: "2026-05-16T10:00:00Z",
    sessionId: "s1",
    isSidechain: false,
    cwd: "/x",
    version: "2.1.143",
    gitBranch: "main",
    userType: "external",
    entrypoint: "sdk-cli",
    attachment: {
      type: "hook_success",
      hookEvent: overrides.hookEvent ?? "PreToolUse",
      hookName: overrides.hookName ?? "PreToolUse:Read",
      toolUseID: overrides.toolUseID,
      command: overrides.command ?? "node hook.js",
      stdout: overrides.stdout ?? "",
      stderr: overrides.stderr ?? "",
      exitCode: overrides.exitCode ?? 0,
      content: "",
      durationMs: overrides.durationMs ?? 24,
    },
  };
}

function hookCancelled(uuid: string, reason: string): AttachmentEvent {
  return {
    type: "attachment",
    uuid,
    parentUuid: "p1",
    timestamp: "2026-05-16T10:00:00Z",
    sessionId: "s1",
    isSidechain: false,
    cwd: "/x",
    version: "2.1.143",
    gitBranch: "main",
    userType: "external",
    entrypoint: "sdk-cli",
    attachment: {
      type: "hook_cancelled",
      hookEvent: "PreToolUse",
      hookName: "PreToolUse:Edit",
      reason,
    },
  };
}

describe("HooksTab", () => {
  afterEach(() => cleanup());

  it("shows empty state when no hook events", () => {
    render(<HooksTab events={[]} />);
    expect(screen.getByText(/No hook executions/i)).toBeDefined();
  });

  it("renders one row per hook_success attachment", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { hookName: "PreToolUse:Read", durationMs: 24 }),
      hookSuccess("h2", { hookName: "PreToolUse:Bash", durationMs: 56 }),
      hookSuccess("h3", { hookName: "PostToolUse:Write", durationMs: 12 }),
    ];
    render(<HooksTab events={events} />);
    expect(screen.getByTestId("hook-row-h1")).toBeDefined();
    expect(screen.getByTestId("hook-row-h2")).toBeDefined();
    expect(screen.getByTestId("hook-row-h3")).toBeDefined();
  });

  it("shows summary with hook count and avg duration", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { durationMs: 20 }),
      hookSuccess("h2", { durationMs: 30 }),
      hookSuccess("h3", { durationMs: 40 }),
    ];
    const { container } = render(<HooksTab events={events} />);
    const text = container.textContent ?? "";
    expect(text).toContain("3 hooks");
    expect(text).toContain("avg 30ms");
  });

  it("flags non-zero exit codes as failures", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { exitCode: 0 }),
      hookSuccess("h2", { exitCode: 2, stderr: "permission denied" }),
    ];
    const { container } = render(<HooksTab events={events} />);
    expect(container.textContent).toContain("1 failed");
  });

  it("counts cancelled hooks separately", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1"),
      hookCancelled("h2", "user-cancelled"),
    ];
    const { container } = render(<HooksTab events={events} />);
    expect(container.textContent).toContain("1 cancelled");
  });

  it("filters by hook event type", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { hookEvent: "PreToolUse", hookName: "PreToolUse:Read" }),
      hookSuccess("h2", { hookEvent: "PostToolUse", hookName: "PostToolUse:Read" }),
      hookSuccess("h3", { hookEvent: "PreToolUse", hookName: "PreToolUse:Bash" }),
    ];
    render(<HooksTab events={events} />);
    const filter = screen.getByTestId("hooks-event-filter") as HTMLSelectElement;
    fireEvent.change(filter, { target: { value: "PostToolUse" } });
    expect(screen.queryByTestId("hook-row-h1")).toBeNull();
    expect(screen.getByTestId("hook-row-h2")).toBeDefined();
    expect(screen.queryByTestId("hook-row-h3")).toBeNull();
  });

  it("filters by free-text search across name and stdout", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { hookName: "PreToolUse:Read", stdout: "alpha" }),
      hookSuccess("h2", { hookName: "PreToolUse:Bash", stdout: "beta" }),
    ];
    render(<HooksTab events={events} />);
    const search = screen.getByTestId("hooks-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "beta" } });
    expect(screen.queryByTestId("hook-row-h1")).toBeNull();
    expect(screen.getByTestId("hook-row-h2")).toBeDefined();
  });

  it("surfaces async_hook_response with tool execution duration (P2-3)", () => {
    const events: SessionEvent[] = [
      {
        type: "attachment",
        uuid: "ah1",
        parentUuid: "p1",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "s1",
        attachment: {
          type: "async_hook_response",
          hookEvent: "PostToolUse",
          hookName: "PostToolUse:Bash",
          processId: "async_hook_53285",
          response: {
            tool_name: "Bash",
            duration_ms: 3587,
            tool_input: { command: "ls" },
            tool_response: { stdout: "file.txt\n", stderr: "" },
          },
        },
      } as AttachmentEvent,
    ];
    const { getByTestId, container } = render(<HooksTab events={events} />);
    const row = getByTestId("hook-row-ah1");
    expect(row.textContent).toContain("PostToolUse");
    expect(row.textContent).toContain("Bash");
    expect(row.textContent).toContain("3587");
    expect(container.textContent).toContain("avg 3587ms");
  });

  it("shows total time spent in hooks across session", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { durationMs: 1000 }),
      hookSuccess("h2", { durationMs: 2500 }),
    ];
    const { container } = render(<HooksTab events={events} />);
    expect(container.textContent).toContain("total 3.5s");
  });

  it("ignores non-hook attachments and other event types", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1"),
      {
        type: "attachment",
        uuid: "q1",
        parentUuid: "p1",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "s1",
        attachment: { type: "skill_listing", skills: [] },
      } as AttachmentEvent,
    ];
    render(<HooksTab events={events} />);
    expect(screen.getByTestId("hook-row-h1")).toBeDefined();
    expect(screen.queryByTestId("hook-row-q1")).toBeNull();
  });
});
