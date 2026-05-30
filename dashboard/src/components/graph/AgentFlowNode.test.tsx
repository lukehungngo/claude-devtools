import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AgentNode } from "../../lib/types";

// react-flow's Handle needs the flow context; stub it (and Position) so the
// custom node renders standalone in jsdom. The node's own markup is what we test.
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom", Left: "left", Right: "right" },
}));

import { AgentFlowNode } from "./AgentFlowNode";
import type { AgentFlowNodeData } from "../../lib/agentFlowElements";

afterEach(cleanup);

const node = (over: Partial<AgentNode>): AgentNode => ({
  id: "agent-1",
  type: "engineer",
  tokenUsage: {
    inputTokens: 100,
    outputTokens: 50,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    totalCost: 0.01,
  },
  toolCalls: 2,
  mcpToolCalls: 0,
  status: "completed",
  ...over,
});

// Minimal NodeProps shape — only the fields AgentFlowNode reads.
function nodeProps(data: AgentFlowNodeData) {
  return {
    id: data.node.id,
    data,
    selected: data.selected,
    type: "agent",
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    deletable: true,
    selectable: true,
    draggable: true,
  } as unknown as Parameters<typeof AgentFlowNode>[0];
}

describe("AgentFlowNode", () => {
  it("mode=running: spinning icon + glow + Running badge when running", () => {
    render(
      <AgentFlowNode
        {...nodeProps({ node: node({ id: "sub-1", status: "active" }), running: true, selected: false })}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-sub-1");
    expect(card.getAttribute("data-mode")).toBe("running");
    expect(card.getAttribute("data-running")).toBe("true");
    expect(card.querySelector(".animate-spin")).not.toBeNull();
    expect(card.className).toContain("shadow-dt-glow");
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("compact (not selected): renders small, shows the name, hides model/description/metrics", () => {
    render(
      <AgentFlowNode
        {...nodeProps({
          node: node({ id: "comp", type: "main", description: "Some long description", model: "claude-opus-4-8" }),
          running: false,
          selected: false,
        })}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-comp");
    expect(card.getAttribute("data-mode")).toBe("finished");
    expect(card.getAttribute("data-expanded")).toBe("false");
    expect(screen.getByText("Main")).toBeTruthy();
    // Compact must NOT surface the heavy fields.
    expect(screen.queryByText("Some long description")).toBeNull();
    expect(screen.queryByText("claude-opus-4-8")).toBeNull();
    expect(screen.queryByTitle("Input tokens")).toBeNull();
  });

  it("expanded (selected): shows model, description, and the metrics row", () => {
    render(
      <AgentFlowNode
        {...nodeProps({
          node: node({ id: "main", type: "main", description: "Main session", model: "claude-opus-4-8" }),
          running: false,
          selected: true,
        })}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-main");
    expect(card.getAttribute("data-expanded")).toBe("true");
    expect(card.getAttribute("data-selected")).toBe("true");
    expect(screen.getByText("Main")).toBeTruthy();
    expect(screen.getByText("Main session")).toBeTruthy();
    expect(screen.getByText("claude-opus-4-8")).toBeTruthy();
    expect(screen.getByText("Finished")).toBeTruthy();
    expect(screen.getByTitle("Input tokens").textContent).toContain("100");
    expect(screen.getByTitle("Output tokens").textContent).toContain("50");
  });

  it("mode=error: a non-running errored node reads Error (not a green Finished)", () => {
    render(
      <AgentFlowNode
        {...nodeProps({ node: node({ id: "sub-2", status: "error" }), running: false, selected: false })}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-sub-2");
    expect(card.getAttribute("data-mode")).toBe("error");
    expect(screen.getByText("Error")).toBeTruthy();
  });

  it("mode=finished: a non-running completed node reads Finished", () => {
    render(
      <AgentFlowNode
        {...nodeProps({ node: node({ id: "sub-3", status: "completed" }), running: false, selected: false })}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-sub-3");
    expect(card.getAttribute("data-mode")).toBe("finished");
    expect(screen.getByText("Finished")).toBeTruthy();
  });

  it("expanded + running: keeps the running glow", () => {
    render(
      <AgentFlowNode
        {...nodeProps({ node: node({ id: "r", status: "active" }), running: true, selected: true })}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-r");
    expect(card.getAttribute("data-expanded")).toBe("true");
    expect(card.className).toContain("shadow-dt-glow");
  });

  it("sets an aria-label describing the agent and its mode", () => {
    render(
      <AgentFlowNode
        {...nodeProps({ node: node({ id: "a11y", type: "reviewer" }), running: false, selected: false })}
      />,
    );
    const label = screen.getByTestId("agent-graph-node-a11y").getAttribute("aria-label") ?? "";
    expect(label.toLowerCase()).toContain("reviewer");
    expect(label.toLowerCase()).toContain("finished");
  });
});
