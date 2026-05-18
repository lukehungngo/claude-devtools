import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: "/" } }),
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
import { formatTimeUntil } from "../Titlebar";
import type { UsageInfo } from "../../lib/types";

const now = Date.now();

const mockUsage: UsageInfo = {
  fiveHour: { utilization: 13, resetsAt: new Date(now + 4 * 3600_000 + 11 * 60_000).toISOString() },
  sevenDay: { utilization: 33, resetsAt: new Date(now + 6 * 24 * 3600_000 + 8 * 3600_000).toISOString() },
  planName: "Pro",
};

describe("Titlebar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders brand button", () => {
    render(<Titlebar />);
    expect(screen.getByTestId("home-button")).toBeDefined();
  });

  it("shows session usage percent when usage provided", () => {
    render(<Titlebar usage={mockUsage} />);
    expect(screen.getByText("13%")).toBeDefined();
  });

  it("renders planName", () => {
    render(<Titlebar usage={mockUsage} />);
    expect(screen.getByText("Pro")).toBeDefined();
  });

  it("renders countdown for fiveHour", () => {
    render(<Titlebar usage={mockUsage} />);
    const arrows = screen.getAllByText("↻");
    expect(arrows.length >= 1).toBe(true);
  });

  it("usage section renders as a single button pill", () => {
    render(<Titlebar usage={mockUsage} />);
    const pill = screen.getByRole("button", { name: /usage/i });
    expect(pill).toBeDefined();
  });

  it("renders tb-sep divider", () => {
    const { container } = render(<Titlebar />);
    const sep = container.querySelector('[data-testid="tb-sep"]');
    expect(sep).not.toBeNull();
  });

  it("calls onOpenDrawer when usage pill is clicked", () => {
    const onOpenDrawer = vi.fn();
    render(<Titlebar usage={mockUsage} onOpenDrawer={onOpenDrawer} />);
    const pill = screen.getByRole("button", { name: /usage/i });
    pill.click();
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenDrawer when avatar is clicked", () => {
    const onOpenDrawer = vi.fn();
    render(<Titlebar onOpenDrawer={onOpenDrawer} />);
    const avatar = screen.getByRole("button", { name: /profile/i });
    avatar.click();
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });
});

describe("formatTimeUntil", () => {
  const base = Date.now();

  it("returns hours+mins format", () => {
    const resetsAt = new Date(base + 4 * 3600_000 + 11 * 60_000).toISOString();
    expect(formatTimeUntil(resetsAt, base)).toBe("4h 11m");
  });

  it("returns days+hours format", () => {
    const resetsAt = new Date(base + 6 * 24 * 3600_000 + 8 * 3600_000).toISOString();
    expect(formatTimeUntil(resetsAt, base)).toBe("6d 8h");
  });

  it("returns null for past date", () => {
    expect(formatTimeUntil(new Date(base - 1000).toISOString(), base)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(formatTimeUntil(null, base)).toBeNull();
  });
});
