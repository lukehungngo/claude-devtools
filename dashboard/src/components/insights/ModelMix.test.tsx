import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ModelMix } from "./ModelMix";

afterEach(cleanup);

const MODELS = [
  { model: "claude-sonnet-4-6", tokensIn: 10000, tokensOut: 5000, cost: 0.05, turns: 10, share: 75 },
  { model: "claude-haiku-4-5-20251001", tokensIn: 3000, tokensOut: 1500, cost: 0.017, turns: 5, share: 25 },
];

describe("ModelMix", () => {
  it("renders without crashing", () => {
    render(<ModelMix models={MODELS} />);
    expect(screen.getByTestId("model-mix")).toBeDefined();
  });

  it("renders a proportion bar segment for each model", () => {
    const { container } = render(<ModelMix models={MODELS} />);
    const bars = container.querySelectorAll("[data-testid^='model-bar-']");
    expect(bars.length).toBe(2);
  });

  it("proportion bar widths sum to ~100%", () => {
    const { container } = render(<ModelMix models={MODELS} />);
    const bars = Array.from(container.querySelectorAll("[data-testid^='model-bar-']")) as HTMLElement[];
    const totalWidth = bars.reduce((sum, bar) => {
      const w = parseFloat(bar.style.width ?? "0");
      return sum + w;
    }, 0);
    expect(totalWidth).toBeCloseTo(100, 0);
  });

  it("renders a row for each model", () => {
    render(<ModelMix models={MODELS} />);
    const rows = screen.getAllByTestId(/^model-row-/);
    expect(rows.length).toBe(2);
  });

  it("shows formatted tokensIn in first model row", () => {
    const { container } = render(<ModelMix models={MODELS} />);
    const row0 = container.querySelector("[data-testid='model-row-0']");
    // formatTokens(10000) → "10K"
    expect(row0?.textContent).toContain("10K");
  });

  it("renders empty state for zero models", () => {
    render(<ModelMix models={[]} />);
    expect(screen.getByTestId("model-mix-empty")).toBeDefined();
  });
});
