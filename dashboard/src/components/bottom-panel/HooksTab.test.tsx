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
    terminalSequence: string;
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
      terminalSequence: overrides.terminalSequence,
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

  it("ignores non-hook attachments and queued_command prompts (but renders task-notifications)", () => {
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
      // Regular user-input queued_command (commandMode === "prompt") is NOT
      // a hook execution — keep it filtered out.
      {
        type: "attachment",
        uuid: "q2",
        parentUuid: "p1",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "s1",
        attachment: { type: "queued_command", prompt: "/ctx-stats", commandMode: "prompt" },
      } as AttachmentEvent,
    ];
    render(<HooksTab events={events} />);
    expect(screen.getByTestId("hook-row-h1")).toBeDefined();
    expect(screen.queryByTestId("hook-row-q1")).toBeNull();
    expect(screen.queryByTestId("hook-row-q2")).toBeNull();
  });

  it("renders task-notification queued_command attachments with extracted <summary> (LX-4)", () => {
    const events: SessionEvent[] = [
      {
        type: "attachment",
        uuid: "tn1",
        parentUuid: "p1",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "s1",
        attachment: {
          type: "queued_command",
          commandMode: "task-notification",
          prompt:
            '<task-notification>\n<task-id>b0hzris9r</task-id>\n<summary>Monitor event: "stream-resume test progress"</summary>\n<event>Running 2 tests using 1 worker</event>\n</task-notification>',
        },
      } as AttachmentEvent,
    ];
    const { getByTestId, container } = render(<HooksTab events={events} />);
    const row = getByTestId("hook-row-tn1");
    // Source column says Monitor (task-notification origin).
    expect(row.textContent).toContain("Monitor");
    // Summary text is extracted and rendered as the output preview.
    expect(row.textContent).toContain('Monitor event: "stream-resume test progress"');
    // The verbose <event> body is NOT rendered (we only show the summary).
    expect(row.textContent ?? "").not.toContain("Running 2 tests using 1 worker");
    // Stats include the task-notification in the hook count.
    expect(container.textContent).toContain("1 hook");
  });

  it("renders bell indicator when hook_success carries terminalSequence (P2-4)", () => {
    const events: SessionEvent[] = [
      hookSuccess("ts1", {
        hookName: "PostToolUse:Build",
        terminalSequence: "\\x1b]9;1;Build complete\\x07",
      }),
    ];
    render(<HooksTab events={events} />);
    const bell = screen.getByTestId("hook-row-ts1-terminal-bell");
    expect(bell).toBeDefined();
    expect(bell.getAttribute("title")).toBe("\\x1b]9;1;Build complete\\x07");
  });

  it("does not render bell when terminalSequence is absent (P2-4)", () => {
    const events: SessionEvent[] = [
      hookSuccess("ts2", { hookName: "PostToolUse:Build" }),
    ];
    render(<HooksTab events={events} />);
    expect(screen.queryByTestId("hook-row-ts2-terminal-bell")).toBeNull();
  });

  it("truncates terminalSequence tooltip to 80 chars (P2-4)", () => {
    const longSeq = "\\x1b]9;1;" + "A".repeat(200) + "\\x07";
    const events: SessionEvent[] = [
      hookSuccess("ts3", {
        hookName: "PostToolUse:Build",
        terminalSequence: longSeq,
      }),
    ];
    render(<HooksTab events={events} />);
    const bell = screen.getByTestId("hook-row-ts3-terminal-bell");
    const title = bell.getAttribute("title") ?? "";
    expect(title.length).toBeLessThanOrEqual(80);
    // Confirm truncation actually happened (last char is the ellipsis).
    expect(title.endsWith("…")).toBe(true);
  });

  it("source column distinguishes hooks from task-notifications", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { hookName: "PreToolUse:Read" }),
      {
        type: "attachment",
        uuid: "tn1",
        parentUuid: "p1",
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "s1",
        attachment: {
          type: "queued_command",
          commandMode: "task-notification",
          prompt:
            "<task-notification><task-id>abc</task-id><summary>build complete</summary></task-notification>",
        },
      } as AttachmentEvent,
    ];
    render(<HooksTab events={events} />);
    const hookRow = screen.getByTestId("hook-row-h1");
    const tnRow = screen.getByTestId("hook-row-tn1");
    expect(hookRow.textContent).toContain("hook");
    expect(tnRow.textContent).toContain("Monitor");
  });
});
