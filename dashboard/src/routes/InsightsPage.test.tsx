import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../contexts/LayoutContext", () => ({
  useLayoutContext: () => ({ setCurrentMetrics: vi.fn() }),
}));

import { InsightsPage } from "./InsightsPage";

afterEach(() => {
  cleanup();
});

describe("InsightsPage", () => {
  it("renders heading", () => {
    render(<InsightsPage />);
    expect(screen.getByRole("heading", { name: /insights/i })).toBeDefined();
  });

  it("renders time-range controls", () => {
    render(<InsightsPage />);
    expect(screen.getByTestId("time-range-pill")).toBeDefined();
  });

  it("renders section placeholder cards", () => {
    render(<InsightsPage />);
    const cards = screen.getAllByTestId(/section-card/);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("clicking 7d time range button does not crash", () => {
    render(<InsightsPage />);
    // Button testId follows pattern: time-range-{value} (derived from container "time-range-pill")
    const btn = screen.getByTestId("time-range-7d");
    fireEvent.click(btn);
    expect(screen.getByTestId("time-range-7d")).toBeDefined();
  });
});
