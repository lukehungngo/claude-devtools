import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { act, render, cleanup, screen, fireEvent } from "@testing-library/react";
import { HooksTab } from "./HooksTab";
import type { SessionEvent, AttachmentEvent } from "../../lib/types";
import type { LiveHookState } from "../../lib/streaming-types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

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

  it("fires onHookHover with toolUseID on row mouseenter (FU-3)", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { toolUseID: "toolu_01ABC" }),
    ];
    const onHookHover = vi.fn();
    render(<HooksTab events={events} onHookHover={onHookHover} />);
    const row = screen.getByTestId("hook-row-h1");
    fireEvent.mouseEnter(row);
    expect(onHookHover).toHaveBeenCalledWith("toolu_01ABC");
  });

  it("fires onHookHover with null on row mouseleave (FU-3)", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { toolUseID: "toolu_01ABC" }),
    ];
    const onHookHover = vi.fn();
    render(<HooksTab events={events} onHookHover={onHookHover} />);
    const row = screen.getByTestId("hook-row-h1");
    fireEvent.mouseLeave(row);
    expect(onHookHover).toHaveBeenCalledWith(null);
  });

  it("does not fire onHookHover when row has no toolUseID (FU-3)", () => {
    const events: SessionEvent[] = [
      // hookCancelled has no toolUseID
      hookCancelled("hc1", "user-cancelled"),
    ];
    const onHookHover = vi.fn();
    render(<HooksTab events={events} onHookHover={onHookHover} />);
    const row = screen.getByTestId("hook-row-hc1");
    fireEvent.mouseEnter(row);
    expect(onHookHover).not.toHaveBeenCalled();
  });

  it("highlights matching row when highlightedHookId equals toolUseID (FU-3)", () => {
    const events: SessionEvent[] = [
      hookSuccess("h1", { toolUseID: "toolu_01ABC" }),
      hookSuccess("h2", { toolUseID: "toolu_02XYZ" }),
    ];
    render(<HooksTab events={events} highlightedHookId="toolu_01ABC" />);
    const row1 = screen.getByTestId("hook-row-h1");
    const row2 = screen.getByTestId("hook-row-h2");
    // The matching row uses cat-purple-bg background tint
    expect(row1.getAttribute("style")).toContain("cat-purple-bg");
    expect(row2.getAttribute("style") ?? "").not.toContain("cat-purple-bg");
  });

  describe("live hook progress (NEW-8)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-16T10:00:00Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function liveHook(overrides: Partial<LiveHookState> & { hook_id: string }): LiveHookState {
      return {
        hook_id: overrides.hook_id,
        hook_name: overrides.hook_name ?? "PreToolUse:Bash",
        hook_event: overrides.hook_event ?? "PreToolUse",
        startedAt: overrides.startedAt ?? Date.now(),
        completed: overrides.completed ?? false,
        outcome: overrides.outcome,
        exit_code: overrides.exit_code,
        durationMs: overrides.durationMs,
        lastOutput: overrides.lastOutput,
      };
    }

    it("renders an in-flight row with a spinner for each liveHooks entry", () => {
      const liveHooks = new Map<string, LiveHookState>([
        ["h-live-1", liveHook({ hook_id: "h-live-1" })],
      ]);
      render(<HooksTab events={[]} liveHooks={liveHooks} />);
      const row = screen.getByTestId("hook-row-live-h-live-1");
      expect(row).toBeDefined();
      // Spinner uses lucide Loader2 with animate-spin — assert the spinner is present
      // via a stable test id we render only for in-flight rows.
      expect(
        screen.getByTestId("hook-row-live-h-live-1-spinner"),
      ).toBeDefined();
    });

    it("updates the elapsed time each second while a hook is in-flight", () => {
      const startedAt = Date.now();
      const liveHooks = new Map<string, LiveHookState>([
        ["h-live-2", liveHook({ hook_id: "h-live-2", startedAt })],
      ]);
      render(<HooksTab events={[]} liveHooks={liveHooks} />);
      // Initially the row shows "0s".
      const initial = screen.getByTestId("hook-row-live-h-live-2-elapsed");
      expect(initial.textContent).toBe("0s");
      // Advance the fake clock past 3s — vitest's advanceTimersByTime moves
      // both Date.now and any pending intervals, so the 1s tick interval
      // re-renders and the LiveHookRow recomputes the elapsed counter.
      act(() => {
        vi.advanceTimersByTime(3_200);
      });
      expect(
        screen.getByTestId("hook-row-live-h-live-2-elapsed").textContent,
      ).toBe("3s");
    });

    it("keeps a completed live row visible briefly then drops it", () => {
      const startedAt = Date.now();
      const liveHooks = new Map<string, LiveHookState>([
        [
          "h-live-3",
          liveHook({
            hook_id: "h-live-3",
            startedAt,
            completed: true,
            outcome: "success",
            durationMs: 42,
          }),
        ],
      ]);
      render(<HooksTab events={[]} liveHooks={liveHooks} />);
      // Completed row stays visible immediately after hook_response — no spinner,
      // duration column populated from durationMs.
      const row = screen.getByTestId("hook-row-live-h-live-3");
      expect(row).toBeDefined();
      expect(screen.queryByTestId("hook-row-live-h-live-3-spinner")).toBeNull();
      expect(row.textContent).toContain("42");
      // After the 3s hold window the row drops out of the DOM, avoiding a
      // double-render flicker when the JSONL hook_success attachment lands.
      act(() => {
        vi.advanceTimersByTime(3_500);
      });
      expect(screen.queryByTestId("hook-row-live-h-live-3")).toBeNull();
    });
  });

  describe("HooksTab activeTurnIndex scoping (Bug G)", () => {
    function makeTurn(
      turnNumber: number,
      startIndex: number,
      endIndex: number,
    ): TurnSnapshot {
      return {
        turnNumber,
        promptText: `prompt ${turnNumber}`,
        startIndex,
        endIndex,
        agents: [],
        durationMs: 0,
        cost: 0,
        costBreakdown: { total: 0, inputCost: 0, outputCost: 0 },
        inputTokens: 0,
        outputTokens: 0,
        startTime: "2026-05-16T10:00:00Z",
        endTime: "2026-05-16T10:00:01Z",
        dispatchedAgentIds: new Set<string>(["main"]),
        eventAgentIds: new Set<string>(["main"]),
      };
    }

    // Three turns each with one hook attachment in the middle.
    // Layout (8 events, indices 0..7):
    //   T1: [0,3)  → hook at index 1 ("h-t1")
    //   T2: [3,5)  → NO hook (just two filler events)
    //   T3: [5,8)  → hook at index 6 ("h-t3")
    function makeFiller(uuid: string): SessionEvent {
      return {
        type: "assistant",
        uuid,
        timestamp: "2026-05-16T10:00:00Z",
        sessionId: "s1",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "filler" }],
          model: "claude-sonnet-4-20250514",
          id: `msg_${uuid}`,
          type: "message",
          stop_reason: "end_turn",
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      } as SessionEvent;
    }

    const events: SessionEvent[] = [
      makeFiller("f1"),                              // 0 — T1
      hookSuccess("h-t1", { hookName: "PreToolUse:Read" }), // 1 — T1
      makeFiller("f2"),                              // 2 — T1
      makeFiller("f3"),                              // 3 — T2
      makeFiller("f4"),                              // 4 — T2
      makeFiller("f5"),                              // 5 — T3
      hookSuccess("h-t3", { hookName: "PreToolUse:Bash" }), // 6 — T3
      makeFiller("f6"),                              // 7 — T3
    ];
    const turns: TurnSnapshot[] = [
      makeTurn(1, 0, 3),
      makeTurn(2, 3, 5),
      makeTurn(3, 5, 8),
    ];

    it("defaults to active turn — last turn", () => {
      render(<HooksTab events={events} turns={turns} activeTurnIndex={2} />);
      expect(screen.queryByTestId("hook-row-h-t1")).toBeNull();
      expect(screen.getByTestId("hook-row-h-t3")).toBeDefined();
    });

    it("scopes to clicked turn", () => {
      render(<HooksTab events={events} turns={turns} activeTurnIndex={0} />);
      expect(screen.getByTestId("hook-row-h-t1")).toBeDefined();
      expect(screen.queryByTestId("hook-row-h-t3")).toBeNull();
    });

    it("falls back to whole session when turns/activeTurnIndex absent", () => {
      render(<HooksTab events={events} />);
      expect(screen.getByTestId("hook-row-h-t1")).toBeDefined();
      expect(screen.getByTestId("hook-row-h-t3")).toBeDefined();
    });

    it("shows empty state for a turn with no hooks (T2)", () => {
      render(<HooksTab events={events} turns={turns} activeTurnIndex={1} />);
      expect(screen.queryByTestId("hook-row-h-t1")).toBeNull();
      expect(screen.queryByTestId("hook-row-h-t3")).toBeNull();
      expect(screen.getByText(/No hook executions/i)).toBeDefined();
    });

    it("falls back to whole session when activeTurnIndex is out of range", () => {
      render(<HooksTab events={events} turns={turns} activeTurnIndex={99} />);
      // Out-of-range index → turns[99] is undefined → whole-session fallback.
      expect(screen.getByTestId("hook-row-h-t1")).toBeDefined();
      expect(screen.getByTestId("hook-row-h-t3")).toBeDefined();
    });
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
