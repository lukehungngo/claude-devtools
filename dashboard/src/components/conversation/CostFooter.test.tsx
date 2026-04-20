import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CostFooter } from "./CostFooter";

afterEach(cleanup);

describe("CostFooter", () => {
  it("shows total + breakdown when both main and agent have cost", () => {
    const { container } = render(
      <CostFooter
        totalCost={9.63}
        mainCost={2.96}
        mainTurns={6}
        agentCost={6.67}
        agentCalls={44}
      />,
    );
    const text = container.textContent!;

    expect(text).toContain("$9.63");
    expect(text).toContain("main $2.96");
    expect(text).toContain("agents $6.67 (44)");
  });

  it("shows total + agent count when main cost is zero", () => {
    const { container } = render(
      <CostFooter
        totalCost={1.52}
        mainCost={0}
        mainTurns={1}
        agentCost={1.52}
        agentCalls={1}
      />,
    );
    const text = container.textContent!;

    expect(text).toContain("$1.52");
    expect(text).toContain("1 agent");
    expect(text).not.toContain("main");
  });

  it("pluralizes agent count", () => {
    const { container } = render(
      <CostFooter
        totalCost={3.0}
        mainCost={0}
        mainTurns={1}
        agentCost={3.0}
        agentCalls={4}
      />,
    );
    expect(container.textContent).toContain("4 agents");
  });

  it("shows only total when no agents", () => {
    const { container } = render(
      <CostFooter
        totalCost={0.50}
        mainCost={0.50}
        mainTurns={1}
        agentCost={0}
        agentCalls={0}
      />,
    );
    const text = container.textContent!;

    expect(text).toContain("$0.50");
    expect(text).not.toContain("main");
    expect(text).not.toContain("agent");
  });

  it("has aria-label for accessibility", () => {
    const { container } = render(
      <CostFooter
        totalCost={1.0}
        mainCost={1.0}
        mainTurns={1}
        agentCost={0}
        agentCalls={0}
      />,
    );
    expect(container.querySelector('[aria-label="Cost breakdown"]')).toBeTruthy();
  });
});

describe("CostFooter — cache tokens", () => {
  it("does not show Cached when cacheReadTokens is 0", () => {
    const { queryByText } = render(
      <CostFooter
        totalCost={0.05}
        mainCost={0.05}
        mainTurns={1}
        agentCost={0}
        agentCalls={0}
        inputTokens={10000}
        outputTokens={500}
        cacheReadTokens={0}
      />
    );
    expect(queryByText(/Cached/i)).toBeNull();
  });

  it("shows Cached when cacheReadTokens > 0", () => {
    const { getByText } = render(
      <CostFooter
        totalCost={0.05}
        mainCost={0.05}
        mainTurns={1}
        agentCost={0}
        agentCalls={0}
        inputTokens={10000}
        outputTokens={500}
        cacheReadTokens={3100}
      />
    );
    expect(getByText(/Cached/i)).toBeDefined();
  });
});
