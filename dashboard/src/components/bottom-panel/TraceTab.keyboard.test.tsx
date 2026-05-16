import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TraceTab } from "./TraceTab";
import type { AgentDAG } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

afterEach(() => cleanup());

beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
});

function makeDag(): AgentDAG {
  return {
    nodes: [
      {
        id: "main",
        type: "main",
        description: "Main session",
        tokenUsage: {
          inputTokens: 100,
          outputTokens: 200,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0.05,
        },
        toolCalls: 1,
        mcpToolCalls: 0,
        status: "active",
        startTime: "2026-05-16T10:00:00Z",
        endTime: "2026-05-16T10:05:00Z",
        model: "claude-sonnet-4-6",
      },
      {
        id: "synthetic:agent:t1",
        type: "engineer",
        description: "subagent task",
        parentId: "main",
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheWriteTokens: 0,
          cacheReadTokens: 0,
          totalCost: 0,
        },
        toolCalls: 0,
        mcpToolCalls: 0,
        status: "active",
        startTime: "2026-05-16T10:01:00Z",
      },
    ],
    edges: [{ source: "main", target: "synthetic:agent:t1" }],
  };
}

const turns: TurnSnapshot[] = [];

describe("TraceTab keyboard hint row (Phase 4.2)", () => {
  it("hides the hint row when sessionId is missing", () => {
    render(
      <TraceTab
        dag={makeDag()}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={true}
        panelHeight={300}
      />,
    );
    expect(screen.queryByTestId("trace-keyboard-hint-row")).toBeNull();
  });

  it("hides the hint row when isLive is false", () => {
    render(
      <TraceTab
        dag={makeDag()}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={false}
        panelHeight={300}
        sessionId="s1"
      />,
    );
    expect(screen.queryByTestId("trace-keyboard-hint-row")).toBeNull();
  });

  it("shows the hint row when live + sessionId + nodes exist", () => {
    render(
      <TraceTab
        dag={makeDag()}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent="main"
        isLive={true}
        panelHeight={300}
        sessionId="s1"
      />,
    );
    expect(screen.getByTestId("trace-keyboard-hint-row")).toBeDefined();
    expect(screen.getByText(/navigate/i)).toBeDefined();
    expect(screen.getByText(/stop session/i)).toBeDefined();
  });

  it("shows focused agent description in the hint row", () => {
    render(
      <TraceTab
        dag={makeDag()}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent="synthetic:agent:t1"
        isLive={true}
        panelHeight={300}
        sessionId="s1"
      />,
    );
    // "subagent task" appears in both the row label and the hint row
    const hintRow = screen.getByTestId("trace-keyboard-hint-row");
    expect(hintRow.textContent).toContain("subagent task");
  });

  it("arrow keys move focused agent", () => {
    const onSelect = vi.fn();
    render(
      <TraceTab
        dag={makeDag()}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent="main"
        onSelectAgent={onSelect}
        isLive={true}
        panelHeight={300}
        sessionId="s1"
      />,
    );
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(onSelect).toHaveBeenCalledWith("synthetic:agent:t1");
  });

  it("`x` key calls /sessions/:sessionId/abort when an agent is focused", async () => {
    render(
      <TraceTab
        dag={makeDag()}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent="main"
        isLive={true}
        panelHeight={300}
        sessionId="sess-42"
      />,
    );
    fireEvent.keyDown(window, { key: "x" });
    // Allow microtask
    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/sess-42/abort",
      { method: "POST" },
    );
  });

  it("`x` is a no-op when no agent is focused", async () => {
    render(
      <TraceTab
        dag={makeDag()}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={true}
        panelHeight={300}
        sessionId="sess-42"
      />,
    );
    fireEvent.keyDown(window, { key: "x" });
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("ignores keystrokes when typing in an input", () => {
    const onSelect = vi.fn();
    render(
      <>
        <input data-testid="search-input" type="text" />
        <TraceTab
          dag={makeDag()}
          turns={turns}
          activeTurnIndex={null}
          selectedAgent="main"
          onSelectAgent={onSelect}
          isLive={true}
          panelHeight={300}
          sessionId="s1"
        />
      </>,
    );
    const input = screen.getByTestId("search-input");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
