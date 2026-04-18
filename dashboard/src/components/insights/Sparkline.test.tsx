import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("renders an SVG element", () => {
    const { container } = render(<Sparkline data={[1, 2, 3, 4, 5]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders static fallback line when data is empty", () => {
    const { container } = render(<Sparkline data={[]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    expect(polyline!.getAttribute("points")).toBe("0,18 16,12 32,8 48,14 64,4");
  });

  it("renders computed points (not fallback) when data provided", () => {
    const { container } = render(<Sparkline data={[0, 10, 5]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    expect(polyline!.getAttribute("points")).not.toBe("0,18 16,12 32,8 48,14 64,4");
  });

  it("uses teal color by default", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("class")).toContain("dt-teal");
  });

  it("uses purple color when specified", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} color="purple" />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("class")).toContain("dt-purple");
  });

  it("applies className prop to SVG", () => {
    const { container } = render(<Sparkline data={[1, 2]} className="extra-class" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("extra-class");
  });

  it("renders single point without crashing", () => {
    const { container } = render(<Sparkline data={[42]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("all-equal values render fallback static line", () => {
    const { container } = render(<Sparkline data={[5, 5, 5]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline!.getAttribute("points")).toBe("0,18 16,12 32,8 48,14 64,4");
  });
});
