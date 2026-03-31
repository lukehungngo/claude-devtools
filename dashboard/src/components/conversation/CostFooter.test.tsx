import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CostFooter } from "./CostFooter";

afterEach(cleanup);

describe("CostFooter", () => {
  const sampleProps = {
    totalCost: 9.63,
    mainCost: 2.96,
    mainTurns: 6,
    agentCost: 6.67,
    agentCalls: 44,
  };

  it("renders all cost sections with sample data", () => {
    const { getByText } = render(<CostFooter {...sampleProps} />);

    expect(getByText("Total:")).toBeTruthy();
    expect(getByText("Main:")).toBeTruthy();
    expect(getByText("Agent:")).toBeTruthy();
  });

  it("formats costs using formatCost", () => {
    const { container } = render(<CostFooter {...sampleProps} />);
    const text = container.textContent!;

    // formatCost(9.63) = "$9.63", formatCost(2.96) = "$2.96", formatCost(6.67) = "$6.67"
    expect(text).toContain("$9.63");
    expect(text).toContain("$2.96");
    expect(text).toContain("$6.67");
  });

  it("displays turn and call counts correctly", () => {
    const { container } = render(<CostFooter {...sampleProps} />);
    const text = container.textContent!;

    expect(text).toContain("6 turns");
    expect(text).toContain("44 calls");
  });

  it("has aria-label for accessibility", () => {
    const { container } = render(<CostFooter {...sampleProps} />);
    const el = container.querySelector('[aria-label="Cost breakdown"]');

    expect(el).toBeTruthy();
  });

  it("renders $0.0000 for zero costs (honest numbers)", () => {
    const { container } = render(
      <CostFooter
        totalCost={0}
        mainCost={0}
        mainTurns={0}
        agentCost={0}
        agentCalls={0}
      />
    );
    const text = container.textContent!;

    // formatCost(0) = "$0.0000" (cost < 0.01 branch)
    expect(text).toContain("$0.0000");
    expect(text).toContain("0 turns");
    expect(text).toContain("0 calls");
  });
});
