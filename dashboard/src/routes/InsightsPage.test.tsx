import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { InsightsPage } from "./InsightsPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../contexts/LayoutContext", () => ({
  useLayoutContext: () => ({ setCurrentMetrics: vi.fn() }),
}));

vi.mock("../hooks/useInsightsAggregate", () => ({
  useInsightsAggregate: vi.fn(),
}));

vi.mock("../hooks/useInsightsActivity", () => ({
  useInsightsActivity: vi.fn(),
}));

import { useInsightsAggregate } from "../hooks/useInsightsAggregate";
import { useInsightsActivity } from "../hooks/useInsightsActivity";

function mockLoading() {
  vi.mocked(useInsightsAggregate).mockReturnValue({
    data: null,
    delta: null,
    loading: true,
    error: null,
  });
}

function mockData() {
  vi.mocked(useInsightsAggregate).mockReturnValue({
    data: {
      tokensIn: 120_000,
      tokensOut: 45_000,
      cost: 1.23,
      sessions: 8,
      turns: 42,
      avgCostPerTurn: 0.029,
      avgTokensPerTurn: 3928,
      activeDays: 5,
      peakHour: 15,
      daily: [],
    },
    delta: { tokensIn: 0.12, tokensOut: -0.05, cost: 0.08 },
    loading: false,
    error: null,
  });
}

function mockError() {
  vi.mocked(useInsightsAggregate).mockReturnValue({
    data: null,
    delta: null,
    loading: false,
    error: "HTTP 500",
  });
}

function mockActivityData() {
  vi.mocked(useInsightsActivity).mockReturnValue({
    data: {
      heatmap: [{ day: 0, hour: 9, intensity: 3 as const }],
      hourly: [{ hour: 9, tokensAvg: 1500 }],
    },
    loading: false,
    error: null,
  });
}

function mockActivityLoading() {
  vi.mocked(useInsightsActivity).mockReturnValue({
    data: null,
    loading: true,
    error: null,
  });
}

beforeEach(() => {
  mockLoading();
  mockActivityLoading();
});

afterEach(() => {
  cleanup();
});

describe("InsightsPage", () => {
  it("renders the Insights heading", () => {
    render(<InsightsPage />);
    expect(screen.getByText("Insights")).toBeTruthy();
  });

  it("renders time-range scope pill", () => {
    render(<InsightsPage />);
    expect(screen.getByTestId("time-range-pill")).toBeTruthy();
    expect(screen.getByTestId("time-range-7d")).toBeTruthy();
  });

  it("renders repo scope pill", () => {
    render(<InsightsPage />);
    expect(screen.getByTestId("repo-pill")).toBeTruthy();
  });

  it("renders loading skeletons when loading", () => {
    mockLoading();
    render(<InsightsPage />);
    expect(screen.getAllByTestId("tile-skeleton").length).toBeGreaterThan(0);
  });

  it("renders headline and stat tiles when data loaded", () => {
    mockData();
    render(<InsightsPage />);
    expect(screen.getByTestId("tile-tokensIn")).toBeTruthy();
    expect(screen.getByTestId("tile-tokensOut")).toBeTruthy();
    expect(screen.getByTestId("tile-cost")).toBeTruthy();
    expect(screen.getByTestId("tile-sessions")).toBeTruthy();
    expect(screen.getByTestId("tile-turns")).toBeTruthy();
  });

  it("renders secondary tiles when data loaded", () => {
    mockData();
    render(<InsightsPage />);
    expect(screen.getByTestId("tile-avgCostPerTurn")).toBeTruthy();
    expect(screen.getByTestId("tile-avgTokensPerTurn")).toBeTruthy();
    expect(screen.getByTestId("tile-activeDays")).toBeTruthy();
    expect(screen.getByTestId("tile-peakHour")).toBeTruthy();
  });

  it("renders delta chips with correct sign", () => {
    mockData();
    render(<InsightsPage />);
    expect(screen.getByTestId("delta-tokensIn").textContent).toContain("+12.0%");
    expect(screen.getByTestId("delta-tokensOut").textContent).toContain("-5.0%");
  });

  it("renders flat delta as arrow-right with gray chip", () => {
    vi.mocked(useInsightsAggregate).mockReturnValue({
      data: {
        tokensIn: 120_000,
        tokensOut: 45_000,
        cost: 1.23,
        sessions: 8,
        turns: 42,
        avgCostPerTurn: 0.029,
        avgTokensPerTurn: 3928,
        activeDays: 5,
        peakHour: 15,
        daily: [],
      },
      delta: { tokensIn: 0.002, tokensOut: 0.0, cost: -0.001 },
      loading: false,
      error: null,
    });
    render(<InsightsPage />);
    expect(screen.getByTestId("delta-tokensIn").textContent).toContain("→");
    expect(screen.getByTestId("delta-tokensOut").textContent).toContain("→");
    expect(screen.getByTestId("delta-cost").textContent).toContain("→");
  });

  it("renders subtitle below h1", () => {
    render(<InsightsPage />);
    expect(screen.getByText("Aggregate usage across your repos and sessions")).toBeTruthy();
  });

  it("renders 5 stat tiles in data loaded state", () => {
    mockData();
    render(<InsightsPage />);
    expect(screen.getByTestId("tile-tokensIn")).toBeTruthy();
    expect(screen.getByTestId("tile-tokensOut")).toBeTruthy();
    expect(screen.getByTestId("tile-cost")).toBeTruthy();
    expect(screen.getByTestId("tile-sessions")).toBeTruthy();
    expect(screen.getByTestId("tile-turns")).toBeTruthy();
  });

  it("renders placeholder section cards for future milestones", () => {
    mockData();
    render(<InsightsPage />);
    const cards = screen.getAllByTestId(/^section-card-/);
    expect(cards.length).toBeGreaterThanOrEqual(4);
  });

  it("shows error banner with role=alert when fetch fails", () => {
    mockError();
    render(<InsightsPage />);
    const banner = screen.getByTestId("insights-error");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("HTTP 500");
    expect(banner.getAttribute("role")).toBe("alert");
  });

  it("passes updated timeRange to hook when scope bar changes", () => {
    mockLoading();
    render(<InsightsPage />);
    expect(useInsightsAggregate).toHaveBeenCalledWith("7d", "all");
    fireEvent.click(screen.getByTestId("time-range-30d"));
    expect(useInsightsAggregate).toHaveBeenCalledWith("30d", "all");
  });

  it("renders TrendChart section card when data has daily entries", () => {
    vi.mocked(useInsightsAggregate).mockReturnValue({
      data: {
        tokensIn: 120_000,
        tokensOut: 45_000,
        cost: 1.23,
        sessions: 8,
        turns: 42,
        avgCostPerTurn: 0.029,
        avgTokensPerTurn: 3928,
        activeDays: 5,
        peakHour: 15,
        daily: [
          { date: "2026-04-10", tokensIn: 1000, tokensOut: 500, cost: 0.01 },
          { date: "2026-04-11", tokensIn: 2000, tokensOut: 1000, cost: 0.02 },
        ],
      },
      delta: null,
      loading: false,
      error: null,
    });
    render(<InsightsPage />);
    expect(screen.getByTestId("section-trend-chart")).toBeTruthy();
  });

  it("renders sparkline SVGs inside HeadlineTiles when daily data present", () => {
    vi.mocked(useInsightsAggregate).mockReturnValue({
      data: {
        tokensIn: 120_000,
        tokensOut: 45_000,
        cost: 1.23,
        sessions: 8,
        turns: 42,
        avgCostPerTurn: 0.029,
        avgTokensPerTurn: 3928,
        activeDays: 5,
        peakHour: 15,
        daily: [
          { date: "2026-04-10", tokensIn: 1000, tokensOut: 500, cost: 0.01 },
          { date: "2026-04-11", tokensIn: 2000, tokensOut: 1000, cost: 0.02 },
        ],
      },
      delta: null,
      loading: false,
      error: null,
    });
    render(<InsightsPage />);
    const tokensInTile = screen.getByTestId("tile-tokensIn");
    expect(tokensInTile.querySelector("svg")).not.toBeNull();
    const tokensOutTile = screen.getByTestId("tile-tokensOut");
    expect(tokensOutTile.querySelector("svg")).not.toBeNull();
  });
});

describe("activity section", () => {
  it("renders section-activity when data loads", () => {
    mockData();
    mockActivityData();
    render(<InsightsPage />);
    const section = document.querySelector("[data-testid='section-activity']");
    expect(section).toBeTruthy();
  });

  it("renders section-activity skeleton when loading", () => {
    mockData();
    mockActivityLoading();
    render(<InsightsPage />);
    const section = document.querySelector("[data-testid='section-activity']");
    expect(section).toBeTruthy();
  });
});
