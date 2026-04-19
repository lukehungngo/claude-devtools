import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("renders an SVG element", () => {
    const { container } = render(<Sparkline data={[1, 2, 3, 4, 5]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders a polyline for empty data (fallback diagonal)", () => {
    const { container } = render(<Sparkline data={[]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    // With default 72×36 and PAD=2: fallback is "2,34 70,2"
    expect(polyline!.getAttribute("points")).toBe("2,34 70,2");
  });

  it("renders computed points (not fallback) when data provided", () => {
    const { container } = render(<Sparkline data={[0, 10, 5]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline).not.toBeNull();
    // Should not be the fallback diagonal
    expect(polyline!.getAttribute("points")).not.toBe("2,34 70,2");
  });

  it("uses teal color by default via stroke attribute", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} />);
    const polyline = container.querySelector("polyline");
    expect(polyline!.getAttribute("stroke")).toBe("var(--teal)");
  });

  it("uses purple color when specified via stroke attribute", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} color="purple" />);
    const polyline = container.querySelector("polyline");
    expect(polyline!.getAttribute("stroke")).toBe("var(--purple)");
  });

  it("applies className prop to SVG", () => {
    const { container } = render(<Sparkline data={[1, 2]} className="extra-class" />);
    expect(container.querySelector("svg")!.getAttribute("class")).toContain("extra-class");
  });

  it("renders single point without crashing", () => {
    const { container } = render(<Sparkline data={[42]} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("all-equal values render horizontal mid-line", () => {
    const { container } = render(<Sparkline data={[5, 5, 5]} />);
    const polyline = container.querySelector("polyline");
    // With 72×36 and PAD=2: horizontal line at y=18
    expect(polyline!.getAttribute("points")).toBe("2,18 70,18");
  });

  it("does not render area path when showArea is false", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} showArea={false} />);
    expect(container.querySelector("path")).toBeNull();
    expect(container.querySelector("defs")).toBeNull();
  });

  it("renders area gradient and path when showArea is true with sufficient data", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} showArea color="teal" />);
    const defs = container.querySelector("defs");
    expect(defs).not.toBeNull();
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path!.getAttribute("fill")).toContain("url(#spark-grad-teal");
  });

  it("does not render area path when showArea is true but data has fewer than 2 points", () => {
    const { container } = render(<Sparkline data={[5]} showArea />);
    expect(container.querySelector("path")).toBeNull();
  });

  it("renders with custom width and height", () => {
    const { container } = render(<Sparkline data={[1, 2, 3]} width={100} height={50} />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("100");
    expect(svg!.getAttribute("height")).toBe("50");
  });
});
