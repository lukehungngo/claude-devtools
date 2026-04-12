import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { NodeProps } from "@xyflow/react";
import type { AgentNode } from "../lib/types";

// Mock @xyflow/react to avoid xyflow DOM dependencies in jsdom
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Bottom: "bottom" },
}));

import { AgentNodeCard } from "./AgentNodeCard";

afterEach(() => {
  cleanup();
});

function makeAgent(overrides?: Partial<AgentNode>): AgentNode {
  return {
    id: "main",
    type: "main",
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      totalCost: 0.01,
    },
    toolCalls: 3,
    mcpToolCalls: 0,
    status: "completed",
    ...overrides,
  };
}

function makeNodeProps(agent: AgentNode): NodeProps {
  return {
    id: agent.id,
    data: { agent, selected: false, frozen: false },
    type: "agentNode",
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    deletable: false,
    selectable: false,
    draggable: false,
    dragHandle: "",
  } as unknown as NodeProps;
}

describe("AgentNodeCard model badge", () => {
  it("displays stripped model name when model is set", () => {
    const agent = makeAgent({ model: "claude-opus-4-6" });
    const { container } = render(<AgentNodeCard {...makeNodeProps(agent)} />);
    expect(container.textContent).toContain("opus-4-6");
    expect(container.textContent).not.toContain("claude-opus-4-6");
  });

  it("does not render a model badge when model is absent", () => {
    const agent = makeAgent();
    const { container } = render(<AgentNodeCard {...makeNodeProps(agent)} />);
    const spans = container.querySelectorAll("span.font-mono");
    expect(spans).toHaveLength(0);
  });

  it("strips claude- prefix for sonnet model", () => {
    const agent = makeAgent({ model: "claude-sonnet-4-6" });
    const { container } = render(<AgentNodeCard {...makeNodeProps(agent)} />);
    expect(container.textContent).toContain("sonnet-4-6");
  });
});
