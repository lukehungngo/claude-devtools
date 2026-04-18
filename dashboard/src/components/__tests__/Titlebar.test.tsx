import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../../contexts/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));

import { Titlebar } from "../Titlebar";
import type { UsageInfo } from "../../lib/types";

const mockUsage: UsageInfo = {
  fiveHour: { utilization: 0.13, resetsAt: null },
  sevenDay: { utilization: 0.33, resetsAt: null },
  planName: "Max",
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
});
