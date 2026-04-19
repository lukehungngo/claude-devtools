import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TrendSection } from "./TrendSection";

afterEach(cleanup);

const ENTRIES = [
  { name: "/review", calls: 15, avgIn: 1200, avgOut: 600, weekly: [{ in: 200, out: 100 }], verdict: "improving" as const },
  { name: "/build", calls: 8, avgIn: 800, avgOut: 400, weekly: [{ in: 100, out: 50 }], verdict: "stable" as const },
];

describe("TrendSection", () => {
  it("renders the section title", () => {
    render(<TrendSection title="Commands" entries={ENTRIES} />);
    expect(screen.getByText("Commands")).toBeDefined();
  });

  it("renders a row per entry", () => {
    render(<TrendSection title="Commands" entries={ENTRIES} />);
    expect(screen.getByText("/review")).toBeDefined();
    expect(screen.getByText("/build")).toBeDefined();
  });

  it("renders empty state when no entries", () => {
    render(<TrendSection title="Agents" entries={[]} />);
    expect(screen.getByTestId("trend-section-empty")).toBeDefined();
  });

  it("renders with testId prop", () => {
    render(<TrendSection title="Skills" entries={ENTRIES} testId="section-skills" />);
    expect(screen.getByTestId("section-skills")).toBeDefined();
  });
});
