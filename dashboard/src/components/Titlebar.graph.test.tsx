import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Controllable router mocks — the pathname + navigate spy are mutated per-test.
const navigateSpy = vi.fn();
let currentPathname = "/graph";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateSpy,
  useRouterState: () => ({ location: { pathname: currentPathname } }),
  useLocation: () => ({ pathname: currentPathname }),
}));

vi.mock("../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("../hooks/useInsightsNudge", () => ({
  useInsightsNudge: vi.fn(() => ({ nudgeActive: false })),
  safeWriteInsightsLastClick: vi.fn(),
}));

import { Titlebar } from "./Titlebar";

afterEach(() => {
  cleanup();
  navigateSpy.mockReset();
  currentPathname = "/graph";
});

describe("Titlebar — Graph nav pill", () => {
  it("renders a nav-graph button labelled Graph, active at /graph", () => {
    currentPathname = "/graph";
    render(<Titlebar />);
    const graph = screen.getByTestId("nav-graph");
    expect(graph.textContent).toContain("Graph");
    expect(graph.getAttribute("aria-current")).toBe("page");
    expect(graph.className).toContain("text-dt-accent");
  });

  it("navigates to /graph when nav-graph is clicked", () => {
    currentPathname = "/";
    render(<Titlebar />);
    fireEvent.click(screen.getByTestId("nav-graph"));
    expect(navigateSpy).toHaveBeenCalledWith({ to: "/graph" });
  });

  it("marks Session inactive (no aria-current) while on /graph", () => {
    currentPathname = "/graph";
    render(<Titlebar />);
    const session = screen.getByTestId("nav-session");
    expect(session.getAttribute("aria-current")).toBeNull();
  });

  it("Graph pill is inactive (not accent) when on a non-graph route", () => {
    currentPathname = "/insights";
    render(<Titlebar />);
    const graph = screen.getByTestId("nav-graph");
    expect(graph.getAttribute("aria-current")).toBeNull();
    expect(graph.className).toContain("text-dt-text1");
  });
});
