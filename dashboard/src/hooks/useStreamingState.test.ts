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
});
