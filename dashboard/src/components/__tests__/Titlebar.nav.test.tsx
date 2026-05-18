import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const mockNavigate = vi.fn();
const mockUseRouterState = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
  useRouterState: () => mockUseRouterState(),
  useLocation: () => ({ pathname: "/" }),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

vi.mock("../../hooks/useInsightsNudge", () => ({
  useInsightsNudge: () => ({ nudgeActive: false }),
  safeWriteInsightsLastClick: vi.fn(),
}));

import { Titlebar } from "../Titlebar";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Titlebar nav pill", () => {
  it("renders both Session and Insights buttons", () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: "/" } });
    render(<Titlebar />);
    expect(screen.getByTestId("nav-session")).toBeDefined();
    expect(screen.getByTestId("nav-insights")).toBeDefined();
  });

  it("Session button has aria-current=page when on /", () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: "/" } });
    render(<Titlebar />);
    expect(screen.getByTestId("nav-session").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("nav-insights").getAttribute("aria-current")).toBeNull();
  });

  it("Insights button has aria-current=page when on /insights", () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: "/insights" } });
    render(<Titlebar />);
    expect(screen.getByTestId("nav-insights").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("nav-session").getAttribute("aria-current")).toBeNull();
  });

  it("clicking Session navigates to /", () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: "/insights" } });
    render(<Titlebar />);
    fireEvent.click(screen.getByTestId("nav-session"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("clicking Insights navigates to /insights", () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: "/" } });
    render(<Titlebar />);
    fireEvent.click(screen.getByTestId("nav-insights"));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/insights" });
  });

  it("nav pill wrapper has data-testid nav-pill", () => {
    mockUseRouterState.mockReturnValue({ location: { pathname: "/" } });
    const { container } = render(<Titlebar />);
    expect(container.querySelector('[data-testid="nav-pill"]')).not.toBeNull();
  });
});
