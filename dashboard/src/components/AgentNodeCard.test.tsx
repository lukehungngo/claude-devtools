import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { AgentNodeCard } from "./AgentNodeCard";
import type { AgentNode } from "../lib/types";

vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
}));

function makeNode(overrides: Partial<AgentNode> = {}): AgentNode {
  return {
    id: "main",
    type: "main",
    status: "completed",
    toolCalls: 0,
    mcpToolCalls: 0,
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.001,
    },
    ...overrides,
  };
}

// ReactFlow NodeProps mock
function makeProps(node: AgentNode, extra: Record<string, unknown> = {}) {
  return {
    id: node.id,
    type: "agentNode",
    xPos: 0,
    yPos: 0,
    data: { agent: node, ...extra },
    selected: false,
    isConnectable: true,
    zIndex: 0,
    dragging: false,
    targetPosition: undefined,
    sourcePosition: undefined,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as unknown as Parameters<typeof AgentNodeCard>[0];
}

describe("AgentNodeCard", () => {
  it("shows model in tooltip when node.model is set", () => {
    const node = makeNode({ model: "claude-opus-4-6" });
    const { container } = render(<AgentNodeCard {...makeProps(node)} />);

    // Trigger hover to show tooltip
    const card = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(card);

    expect(container.textContent).toContain("claude-opus-4-6");
  });

  it("does not show 'Model:' line in tooltip when node.model is absent", () => {
    const node = makeNode(); // no model
    const { container } = render(<AgentNodeCard {...makeProps(node)} />);

    const card = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(card);

    expect(container.textContent).not.toContain("Model:");
  });
});
