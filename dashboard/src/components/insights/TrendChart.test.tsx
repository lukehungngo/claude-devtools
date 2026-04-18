import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrendChart } from "./TrendChart";

afterEach(cleanup);

const DAILY = [
  { date: "2026-04-10", tokensIn: 1000, tokensOut: 500 },
  { date: "2026-04-11", tokensIn: 2000, tokensOut: 1000 },
  { date: "2026-04-12", tokensIn: 1500, tokensOut: 750 },
];

describe("TrendChart", () => {
  it("renders an SVG element when data is provided", () => {
    const { container } = render(<TrendChart daily={DAILY} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders 'No data' when daily is empty", () => {
    render(<TrendChart daily={[]} />);
    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("renders a teal area path for tokensIn", () => {
    const { container } = render(<TrendChart daily={DAILY} />);
    const paths = container.querySelectorAll("path");
    const tealPath = Array.from(paths).find(
      (p) => p.getAttribute("fill") === "var(--teal)"
    );
    expect(tealPath).not.toBeNull();
  });

  it("renders a purple area path for tokensOut (stacked)", () => {
    const { container } = render(<TrendChart daily={DAILY} />);
    const paths = container.querySelectorAll("path");
    const purplePath = Array.from(paths).find(
      (p) => p.getAttribute("fill") === "var(--purple)"
    );
    expect(purplePath).not.toBeNull();
  });

  it("renders exactly 3 horizontal grid lines", () => {
    const { container } = render(<TrendChart daily={DAILY} />);
    const lines = container.querySelectorAll("line");
    expect(lines.length).toBe(3);
  });

  it("renders day labels for first and last date", () => {
    render(<TrendChart daily={DAILY} />);
    expect(screen.getByText("04-10")).toBeTruthy();
    expect(screen.getByText("04-12")).toBeTruthy();
  });

  it("SVG uses preserveAspectRatio='none'", () => {
    const { container } = render(<TrendChart daily={DAILY} />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("preserveAspectRatio")).toBe("none");
  });

  it("renders with single data point without crashing", () => {
    const { container } = render(
      <TrendChart daily={[{ date: "2026-04-10", tokensIn: 1000, tokensOut: 500 }]} />
    );
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("applies className to outer container", () => {
    const { container } = render(<TrendChart daily={DAILY} className="my-chart" />);
    expect(container.firstElementChild!.getAttribute("class")).toContain("my-chart");
  });
});
