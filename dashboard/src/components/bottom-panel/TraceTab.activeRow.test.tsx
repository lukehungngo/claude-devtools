import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TraceTab } from "./TraceTab";
import type { AgentDAG, AgentNode } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";

afterEach(() => cleanup());

function node(overrides: Partial<AgentNode>): AgentNode {
  return {
    id: "n1",
    type: "engineer",
    description: "subagent",
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
    status: "completed",
    startTime: "2026-05-16T10:00:00Z",
    endTime: "2026-05-16T10:05:00Z",
    ...overrides,
  };
}

function dag(...nodes: AgentNode[]): AgentDAG {
  return {
    nodes: [
      node({ id: "main", type: "main", parentId: undefined, status: "completed" }),
      ...nodes,
    ],
    edges: nodes.map((n) => ({ source: "main", target: n.id })),
  };
}

const turns: TurnSnapshot[] = [];

describe("TraceTab — running-row animation classes (Phase 6)", () => {
  it("active node adds trace-row-active + trace-bar-active classes", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "a1", status: "active", endTime: undefined }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={true}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const a1Row = rows[1];
    expect(a1Row.className).toContain("trace-row-active");
    const a1Bar = a1Row.querySelector(".trace-bar");
    expect(a1Bar).not.toBeNull();
    expect(a1Bar!.className).toContain("trace-bar-active");
  });

  it("completed node has neither active class", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "c1", status: "completed" }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={false}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    const c1Row = rows[1];
    expect(c1Row.className).not.toContain("trace-row-active");
    const c1Bar = c1Row.querySelector(".trace-bar");
    expect(c1Bar!.className).not.toContain("trace-bar-active");
  });

  it("error node has neither active class", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "e1", status: "error" }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent={null}
        isLive={false}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    const e1Row = rows[1];
    expect(e1Row.className).not.toContain("trace-row-active");
    const e1Bar = e1Row.querySelector(".trace-bar");
    expect(e1Bar!.className).not.toContain("trace-bar-active");
  });

  it("active + selected coexist on the same row", () => {
    const { container } = render(
      <TraceTab
        dag={dag(node({ id: "s1", status: "active", endTime: undefined }))}
        turns={turns}
        activeTurnIndex={null}
        selectedAgent="s1"
        isLive={true}
        panelHeight={300}
      />,
    );
    const rows = container.querySelectorAll(".trace-row");
    const s1Row = rows[1];
    expect(s1Row.className).toContain("trace-row-active");
    expect(s1Row.className).toContain("trace-row-selected");
  });
});
