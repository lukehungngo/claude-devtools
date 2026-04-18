import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
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

  it("shows connected pill when isConnected=true", () => {
    render(<Titlebar isConnected={true} wsLatency={47} />);
    expect(screen.getByText("Connected")).toBeDefined();
    expect(screen.getByText("47ms")).toBeDefined();
  });

  it("shows disconnected pill when isConnected=false", () => {
    render(<Titlebar isConnected={false} wsLatency={null} />);
    expect(screen.getByText("Disconnected")).toBeDefined();
    expect(screen.queryByText("Connected")).toBeNull();
  });

  it("renders no connection pill when isConnected is not provided", () => {
    render(<Titlebar />);
    expect(screen.queryByText("Connected")).toBeNull();
    expect(screen.queryByText("Disconnected")).toBeNull();
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
