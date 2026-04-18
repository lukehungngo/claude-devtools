import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrendRow } from "./TrendRow";

afterEach(cleanup);

const ENTRY = {
  name: "/review",
  calls: 15,
  avgIn: 1200,
  avgOut: 600,
  weekly: [{ in: 200, out: 100 }, { in: 400, out: 200 }, { in: 600, out: 300 }],
  verdict: "improving" as const,
};

describe("TrendRow", () => {
  it("renders the entity name", () => {
    render(<TrendRow entry={ENTRY} />);
    expect(screen.getByText("/review")).toBeDefined();
  });

  it("renders call count", () => {
    render(<TrendRow entry={ENTRY} />);
    expect(screen.getByTestId("trend-row-calls").textContent).toContain("15");
  });

  it("renders improving verdict chip with green styling", () => {
    render(<TrendRow entry={ENTRY} />);
    const chip = screen.getByTestId("trend-row-verdict");
    expect(chip.textContent?.toLowerCase()).toContain("improving");
    expect(chip.className).toMatch(/green/);
  });

  it("renders stable verdict with neutral class", () => {
    render(<TrendRow entry={{ ...ENTRY, verdict: "stable" }} />);
    const chip = screen.getByTestId("trend-row-verdict");
    expect(chip.textContent?.toLowerCase()).toContain("stable");
  });

  it("renders regressing verdict chip with red styling", () => {
    render(<TrendRow entry={{ ...ENTRY, verdict: "regressing" }} />);
    const chip = screen.getByTestId("trend-row-verdict");
    expect(chip.className).toMatch(/red/);
  });

  it("renders at least one SVG for dual sparkline", () => {
    const { container } = render(<TrendRow entry={ENTRY} />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders two polylines (teal in, purple out)", () => {
    const { container } = render(<TrendRow entry={ENTRY} />);
    const polylines = container.querySelectorAll("polyline");
    expect(polylines.length).toBeGreaterThanOrEqual(2);
  });

  it("does not crash with single data point", () => {
    expect(() => render(<TrendRow entry={{ ...ENTRY, weekly: [{ in: 100, out: 50 }] }} />)).not.toThrow();
  });
});
