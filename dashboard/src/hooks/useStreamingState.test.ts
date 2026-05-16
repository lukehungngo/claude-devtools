import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStreamingState } from "./useStreamingState";

describe("useStreamingState", () => {
  it("starts with empty state", () => {
    const { result } = renderHook(() => useStreamingState());
    expect(result.current.state.tools.size).toBe(0);
    expect(result.current.state.thinking.text).toBe("");
    expect(result.current.state.activeToolId).toBeNull();
  });

  it("accumulates thinking text", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "thinking", text: "Let me " });
      result.current.actions.handleSSEEvent({ type: "thinking", text: "think..." });
    });
    expect(result.current.state.thinking.text).toBe("Let me think...");
    expect(result.current.state.thinking.isComplete).toBe(false);
  });

  it("creates tool entry on tool_start", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({
        type: "tool_start",
        id: "toolu_1",
        name: "Read",
        input: { file_path: "/src/App.tsx" },
      });
    });
    expect(result.current.state.tools.size).toBe(1);
    const tool = result.current.state.tools.get("toolu_1");
    expect(tool?.name).toBe("Read");
    expect(tool?.status).toBe("running");
    expect(result.current.state.toolOrder).toEqual(["toolu_1"]);
  });

  it("accumulates tool input JSON via tool_delta", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({
        type: "tool_start",
        id: "toolu_2",
        name: "Bash",
      });
      result.current.actions.handleSSEEvent({
        type: "tool_delta",
        partial_json: '{"command":',
      });
      result.current.actions.handleSSEEvent({
        type: "tool_delta",
        partial_json: '"ls -la"}',
      });
    });
    const tool = result.current.state.tools.get("toolu_2");
    expect(tool?.inputJson).toBe('{"command":"ls -la"}');
    expect(tool?.input).toEqual({ command: "ls -la" });
  });

  it("completes tool on tool_result", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({
        type: "tool_start",
        id: "toolu_3",
        name: "Read",
      });
      result.current.actions.handleSSEEvent({
        type: "tool_result",
        tool_use_id: "toolu_3",
        content: "file contents",
        is_error: false,
      });
    });
    const tool = result.current.state.tools.get("toolu_3");
    expect(tool?.status).toBe("success");
    expect(tool?.resultContent).toBe("file contents");
    expect(tool?.completedAt).toBeDefined();
  });

  it("handles error tool_result", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({
        type: "tool_start",
        id: "toolu_4",
        name: "Bash",
      });
      result.current.actions.handleSSEEvent({
        type: "tool_result",
        tool_use_id: "toolu_4",
        content: "command not found",
        is_error: true,
      });
    });
    const tool = result.current.state.tools.get("toolu_4");
    expect(tool?.status).toBe("error");
    expect(tool?.resultIsError).toBe(true);
  });

  it("handles tool_result before tool_start (race condition)", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({
        type: "tool_result",
        tool_use_id: "toolu_orphan",
        content: "some result",
        is_error: false,
      });
    });
    const tool = result.current.state.tools.get("toolu_orphan");
    expect(tool).toBeDefined();
    expect(tool?.status).toBe("success");
    expect(tool?.name).toBe("unknown");
  });

  it("tracks multiple tools in order", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "tool_start", id: "t1", name: "Read" });
      result.current.actions.handleSSEEvent({ type: "tool_start", id: "t2", name: "Edit" });
      result.current.actions.handleSSEEvent({ type: "tool_start", id: "t3", name: "Bash" });
    });
    expect(result.current.state.toolOrder).toEqual(["t1", "t2", "t3"]);
    expect(result.current.state.tools.size).toBe(3);
  });

  it("handles status events", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "status", status: "compacting" });
    });
    expect(result.current.state.status).toBe("compacting");
    expect(result.current.state.isCompacting).toBe(true);
  });

  it("handles compact event with metadata", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "status", status: "compacting" });
    });
    expect(result.current.state.isCompacting).toBe(true);

    act(() => {
      result.current.actions.handleSSEEvent({
        type: "compact",
        metadata: { trigger: "auto", pre_tokens: 150000 },
      });
    });
    expect(result.current.state.isCompacting).toBe(false);
    expect(result.current.state.compactResult).toEqual({
      trigger: "auto",
      preTokens: 150000,
      postTokens: undefined,
      durationMs: undefined,
    });
  });

  it("handles richer camelCase compact metadata (real CC v2.1.143 shape)", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({
        type: "compact",
        metadata: {
          trigger: "auto",
          preTokens: 168470,
          postTokens: 8759,
          durationMs: 60791,
        },
      });
    });
    expect(result.current.state.compactResult).toEqual({
      trigger: "auto",
      preTokens: 168470,
      postTokens: 8759,
      durationMs: 60791,
    });
  });

  it("handles compact event without metadata", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "compact" });
    });
    expect(result.current.state.isCompacting).toBe(false);
    expect(result.current.state.compactResult).toBeNull();
  });

  it("resets state", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "thinking", text: "abc" });
      result.current.actions.handleSSEEvent({ type: "tool_start", id: "t1", name: "Read" });
      result.current.actions.reset();
    });
    expect(result.current.state.tools.size).toBe(0);
    expect(result.current.state.thinking.text).toBe("");
    expect(result.current.state.toolOrder).toEqual([]);
  });

  it("ignores unknown event types gracefully", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "unknown_future_type" });
    });
    expect(result.current.state.tools.size).toBe(0);
  });

  it("accumulates stdout text into responseText", () => {
    const { result } = renderHook(() => useStreamingState());
    expect(result.current.state.responseText).toBe("");

    act(() => {
      result.current.actions.handleSSEEvent({ type: "stdout", text: "Hello " });
      result.current.actions.handleSSEEvent({ type: "stdout", text: "world!" });
    });
    expect(result.current.state.responseText).toBe("Hello world!");
  });

  it("clears responseText on reset", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "stdout", text: "Some text" });
      result.current.actions.reset();
    });
    expect(result.current.state.responseText).toBe("");
  });

  it("tracks session_state_changed events", () => {
    const { result } = renderHook(() => useStreamingState());
    expect(result.current.state.sessionState).toBeNull();

    act(() => {
      result.current.actions.handleSSEEvent({ type: "session_state_changed", state: "running" });
    });
    expect(result.current.state.sessionState).toBe("running");

    act(() => {
      result.current.actions.handleSSEEvent({ type: "session_state_changed", state: "idle" });
    });
    expect(result.current.state.sessionState).toBe("idle");
  });

  it("sets sessionState to idle on result event", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "session_state_changed", state: "running" });
    });
    expect(result.current.state.sessionState).toBe("running");

    act(() => {
      result.current.actions.handleSSEEvent({ type: "result", is_error: false });
    });
    expect(result.current.state.sessionState).toBe("idle");
  });

  it("extracts sdkContextWindow from result event with modelUsage", () => {
    const { result } = renderHook(() => useStreamingState());
    expect(result.current.state.sdkContextWindow).toBeNull();

    act(() => {
      result.current.actions.handleSSEEvent({
        type: "result",
        is_error: false,
        modelUsage: {
          "claude-opus-4-6": {
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            costUSD: 0.1,
            contextWindow: 1_000_000,
            maxOutputTokens: 16384,
          },
        },
      });
    });
    expect(result.current.state.sdkContextWindow).toBe(1_000_000);
  });

  it("keeps sdkContextWindow null when result has no modelUsage", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({ type: "result", is_error: false });
    });
    expect(result.current.state.sdkContextWindow).toBeNull();
  });

  it("captures OTel stop_reason and finish_reasons from result event (P2-5)", () => {
    const { result } = renderHook(() => useStreamingState());
    expect(result.current.state.lastResultStopReason).toBeNull();
    expect(result.current.state.lastResultFinishReasons).toBeNull();

    act(() => {
      result.current.actions.handleSSEEvent({
        type: "result",
        is_error: false,
        stop_reason: "end_turn",
        finish_reasons: ["stop"],
      });
    });
    expect(result.current.state.lastResultStopReason).toBe("end_turn");
    expect(result.current.state.lastResultFinishReasons).toEqual(["stop"]);
  });

  it("preserves previous OTel fields when a later result omits them (P2-5)", () => {
    const { result } = renderHook(() => useStreamingState());
    act(() => {
      result.current.actions.handleSSEEvent({
        type: "result",
        is_error: false,
        stop_reason: "tool_use",
        finish_reasons: ["tool_use"],
      });
    });
    act(() => {
      result.current.actions.handleSSEEvent({ type: "result", is_error: false });
    });
    expect(result.current.state.lastResultStopReason).toBe("tool_use");
    expect(result.current.state.lastResultFinishReasons).toEqual(["tool_use"]);
  });

  // NEW-7 — structured Task lifecycle messages.
  describe("live task lifecycle (NEW-7)", () => {
    it("task_started creates a running LiveTaskState entry", () => {
      const { result } = renderHook(() => useStreamingState());
      act(() => {
        result.current.actions.handleSSEEvent({
          type: "task_started",
          task_id: "task-1",
          tool_use_id: "toolu_x",
          description: "Investigate bug",
          subagent_type: "general-purpose",
        });
      });
      const task = result.current.state.liveTasks.get("task-1");
      expect(task).toBeDefined();
      expect(task?.status).toBe("running");
      expect(task?.description).toBe("Investigate bug");
      expect(task?.subagent_type).toBe("general-purpose");
      expect(task?.tool_use_id).toBe("toolu_x");
    });

    it("task_progress merges usage + last_tool_name onto existing entry", () => {
      const { result } = renderHook(() => useStreamingState());
      act(() => {
        result.current.actions.handleSSEEvent({
          type: "task_started",
          task_id: "task-1",
          description: "Work",
        });
        result.current.actions.handleSSEEvent({
          type: "task_progress",
          task_id: "task-1",
          description: "Work",
          usage: { total_tokens: 250, tool_uses: 3, duration_ms: 4500 },
          last_tool_name: "Read",
          summary: "Read 3 files",
        });
      });
      const task = result.current.state.liveTasks.get("task-1");
      expect(task?.totalTokens).toBe(250);
      expect(task?.toolUses).toBe(3);
      expect(task?.durationMs).toBe(4500);
      expect(task?.lastToolName).toBe("Read");
      expect(task?.summary).toBe("Read 3 files");
      // Status remains running because no notification arrived yet.
      expect(task?.status).toBe("running");
    });

    it("task_progress without a prior task_started creates an entry", () => {
      const { result } = renderHook(() => useStreamingState());
      act(() => {
        result.current.actions.handleSSEEvent({
          type: "task_progress",
          task_id: "task-2",
          description: "Orphan progress",
          usage: { total_tokens: 10, tool_uses: 1, duration_ms: 100 },
        });
      });
      const task = result.current.state.liveTasks.get("task-2");
      expect(task).toBeDefined();
      expect(task?.totalTokens).toBe(10);
      expect(task?.description).toBe("Orphan progress");
      expect(task?.status).toBe("running");
    });

    it("task_updated applies the patch (status + is_backgrounded)", () => {
      const { result } = renderHook(() => useStreamingState());
      act(() => {
        result.current.actions.handleSSEEvent({
          type: "task_started",
          task_id: "task-1",
          description: "Work",
        });
        result.current.actions.handleSSEEvent({
          type: "task_updated",
          task_id: "task-1",
          patch: { status: "paused", is_backgrounded: true },
        });
      });
      const task = result.current.state.liveTasks.get("task-1");
      expect(task?.status).toBe("paused");
      expect(task?.isBackgrounded).toBe(true);
      // Description should not be wiped when patch omits it.
      expect(task?.description).toBe("Work");
    });

    it("task_notification sets terminal status (completed/failed/stopped)", () => {
      const { result } = renderHook(() => useStreamingState());
      act(() => {
        result.current.actions.handleSSEEvent({
          type: "task_started",
          task_id: "task-1",
          description: "Work",
        });
        result.current.actions.handleSSEEvent({
          type: "task_notification",
          task_id: "task-1",
          status: "completed",
          output_file: "/tmp/out.txt",
          summary: "All done",
        });
      });
      const task = result.current.state.liveTasks.get("task-1");
      expect(task?.status).toBe("completed");
      expect(task?.summary).toBe("All done");
    });

    it("full lifecycle: started → progress → updated → notification", () => {
      const { result } = renderHook(() => useStreamingState());
      act(() => {
        result.current.actions.handleSSEEvent({
          type: "task_started",
          task_id: "task-1",
          tool_use_id: "toolu_a",
          description: "Investigate",
          subagent_type: "general-purpose",
        });
        result.current.actions.handleSSEEvent({
          type: "task_progress",
          task_id: "task-1",
          description: "Investigate",
          usage: { total_tokens: 100, tool_uses: 1, duration_ms: 1000 },
          last_tool_name: "Grep",
        });
        result.current.actions.handleSSEEvent({
          type: "task_updated",
          task_id: "task-1",
          patch: { is_backgrounded: true },
        });
        result.current.actions.handleSSEEvent({
          type: "task_notification",
          task_id: "task-1",
          status: "failed",
          output_file: "/tmp/err.txt",
          summary: "Boom",
          usage: { total_tokens: 250, tool_uses: 4, duration_ms: 5000 },
        });
      });
      const task = result.current.state.liveTasks.get("task-1");
      expect(task?.status).toBe("failed");
      // The notification carries fresh usage that overrides progress numbers.
      expect(task?.totalTokens).toBe(250);
      expect(task?.toolUses).toBe(4);
      expect(task?.durationMs).toBe(5000);
      expect(task?.isBackgrounded).toBe(true);
      expect(task?.lastToolName).toBe("Grep");
      expect(task?.description).toBe("Investigate");
      expect(task?.subagent_type).toBe("general-purpose");
      expect(task?.summary).toBe("Boom");
    });
  });
});
