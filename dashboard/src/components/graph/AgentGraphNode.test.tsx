import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AgentGraphNode } from "./AgentGraphNode";
import type { AgentNode } from "../../lib/types";

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

describe("AgentGraphNode", () => {
  it("renders the running treatment (pulse + data-running) for a running node", () => {
    render(
      <AgentGraphNode
        node={node({ status: "active" })}
        x={10}
        y={20}
        selected={false}
        running={true}
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-agent-1");
    expect(card.getAttribute("data-running")).toBe("true");
    expect(card.querySelector(".animate-pulse, [class*='animate-pulse']")).not.toBeNull();
  });

  it("applies an error treatment for an error node", () => {
    render(
      <AgentGraphNode
        node={node({ status: "error" })}
        x={0}
        y={0}
        selected={false}
        running={false}
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-agent-1");
    expect(card.getAttribute("data-status")).toBe("error");
  });

  it("calls onSelect with the node id when clicked", () => {
    const onSelect = vi.fn();
    render(
      <AgentGraphNode
        node={node({ id: "xyz" })}
        x={0}
        y={0}
        selected={false}
        running={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByTestId("agent-graph-node-xyz"));
    expect(onSelect).toHaveBeenCalledWith("xyz");
  });

  it("applies a ring/selected marker when selected", () => {
    render(
      <AgentGraphNode
        node={node({})}
        x={0}
        y={0}
        selected={true}
        running={false}
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-agent-1");
    expect(card.getAttribute("data-selected")).toBe("true");
  });

  it("positions the card via dynamic left/top inline style", () => {
    render(
      <AgentGraphNode
        node={node({})}
        x={42}
        y={84}
        selected={false}
        running={false}
        onSelect={vi.fn()}
      />,
    );
    const card = screen.getByTestId("agent-graph-node-agent-1");
    expect(card.style.left).toBe("42px");
    expect(card.style.top).toBe("84px");
  });
});
