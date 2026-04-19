import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CASRow } from "./CASRow";

afterEach(() => cleanup());

describe("CASRow", () => {
  const baseProps = {
    name: "mas:engineer:engineer",
    daily: [0, 1, 2, 3, 4, 5, 6],
    count: 42,
    trend: "regressing" as const,
    badgeIndex: 0,
    sparklineColor: "purple" as const,
  };

  it("renders badge with abbreviated name", () => {
    render(<CASRow {...baseProps} />);
    expect(screen.getByText("ENG")).toBeTruthy();
  });

  it("renders the item name", () => {
    render(<CASRow {...baseProps} />);
    expect(screen.getByText("mas:engineer:engineer")).toBeTruthy();
  });

  it("renders the count", () => {
    render(<CASRow {...baseProps} />);
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders REGRESSING trend pill with ↓ symbol", () => {
    render(<CASRow {...baseProps} trend="regressing" />);
    expect(screen.getByText("REGRESSING")).toBeTruthy();
    expect(screen.getByText("↓")).toBeTruthy();
  });

  it("renders IMPROVING trend pill with ↑ symbol", () => {
    render(<CASRow {...baseProps} trend="improving" />);
    expect(screen.getByText("IMPROVING")).toBeTruthy();
    expect(screen.getByText("↑")).toBeTruthy();
  });

  it("renders STABLE trend pill with → symbol", () => {
    render(<CASRow {...baseProps} trend="stable" />);
    expect(screen.getByText("STABLE")).toBeTruthy();
    expect(screen.getByText("→")).toBeTruthy();
  });

  it("renders a sparkline svg", () => {
    const { container } = render(<CASRow {...baseProps} />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("abbreviateName: slash-prefixed command", () => {
    render(<CASRow {...baseProps} name="/compact" />);
    expect(screen.getByText("COM")).toBeTruthy();
  });

  it("abbreviateName: plain name", () => {
    render(<CASRow {...baseProps} name="verification" />);
    expect(screen.getByText("VER")).toBeTruthy();
  });
});
