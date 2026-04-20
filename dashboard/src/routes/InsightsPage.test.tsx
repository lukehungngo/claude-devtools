import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { InsightsPage } from "./InsightsPage";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("../components/insights/EChartsWrapper.js", () => ({
  EChartsWrapper: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="echarts-wrapper" className={className ?? ""} />
  )),
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

vi.mock("../hooks/useInsightsModelMix", () => ({
  useInsightsModelMix: vi.fn(),
}));

vi.mock("../hooks/useInsightsTopConsumers", () => ({
  useInsightsTopConsumers: vi.fn(),
}));

vi.mock("../hooks/useInsightsCommandsAgentsSkills", () => ({
  useInsightsCommandsAgentsSkills: vi.fn(),
}));

import { useInsightsAggregate } from "../hooks/useInsightsAggregate";
import { useInsightsActivity } from "../hooks/useInsightsActivity";
import { useInsightsModelMix } from "../hooks/useInsightsModelMix";
import { useInsightsTopConsumers } from "../hooks/useInsightsTopConsumers";
import { useInsightsCommandsAgentsSkills } from "../hooks/useInsightsCommandsAgentsSkills";

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
      cacheReadTokens: 0,
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
  vi.mocked(useInsightsModelMix).mockReturnValue({ data: null, loading: false, error: null });
  vi.mocked(useInsightsTopConsumers).mockReturnValue({ data: null, loading: false, error: null });
  vi.mocked(useInsightsCommandsAgentsSkills).mockReturnValue({ data: null, loading: false, error: null });
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
        cacheReadTokens: 0,
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

  it("renders Cached tile when cacheReadTokens > 0", () => {
    vi.mocked(useInsightsAggregate).mockReturnValue({
      data: {
        tokensIn: 120_000,
        tokensOut: 45_000,
        cacheReadTokens: 8_000,
        cost: 1.23,
        sessions: 8,
        turns: 42,
        avgCostPerTurn: 0.029,
        avgTokensPerTurn: 3928,
        activeDays: 5,
        peakHour: 15,
        daily: [],
      },
      delta: null,
      loading: false,
      error: null,
    });
    render(<InsightsPage />);
    expect(screen.getByTestId("insights-cached-tokens")).toBeTruthy();
  });

  it("does not render Cached tile when cacheReadTokens is 0", () => {
    mockData(); // cacheReadTokens: 0
    render(<InsightsPage />);
    expect(screen.queryByTestId("insights-cached-tokens")).toBeNull();
  });

  it("uses lg:grid-cols-6 on stats grid when cacheReadTokens > 0", () => {
    vi.mocked(useInsightsAggregate).mockReturnValue({
      data: {
        tokensIn: 120_000,
        tokensOut: 45_000,
        cacheReadTokens: 8_000,
        cost: 1.23,
        sessions: 8,
        turns: 42,
        avgCostPerTurn: 0.029,
        avgTokensPerTurn: 3928,
        activeDays: 5,
        peakHour: 15,
        daily: [],
      },
      delta: null,
      loading: false,
      error: null,
    });
    render(<InsightsPage />);
    const grid = screen.getByTestId("stats-grid");
    expect(grid.className).toContain("lg:grid-cols-6");
  });

  it("uses lg:grid-cols-5 on stats grid when cacheReadTokens is 0", () => {
    mockData(); // cacheReadTokens: 0
    render(<InsightsPage />);
    const grid = screen.getByTestId("stats-grid");
    expect(grid.className).toContain("lg:grid-cols-5");
    expect(grid.className).not.toContain("lg:grid-cols-6");
  });

  it("renders commands, agents, skills, and efficiency hints sections", () => {
    mockData();
    render(<InsightsPage />);
    expect(screen.getByTestId("section-commands")).toBeTruthy();
    expect(screen.getByTestId("section-agents")).toBeTruthy();
    expect(screen.getByTestId("section-skills")).toBeTruthy();
    expect(screen.getByTestId("section-efficiency-hints")).toBeTruthy();
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
    expect(useInsightsAggregate).toHaveBeenCalledWith("7d", "all", 0);
    fireEvent.click(screen.getByTestId("time-range-30d"));
    expect(useInsightsAggregate).toHaveBeenCalledWith("30d", "all", 0);
  });

  it("renders TrendChart section card when data has daily entries", () => {
    vi.mocked(useInsightsAggregate).mockReturnValue({
      data: {
        tokensIn: 120_000,
        tokensOut: 45_000,
        cacheReadTokens: 0,
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
        cacheReadTokens: 0,
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

  it("renders a reload button", () => {
    mockData();
    mockActivityData();
    render(<InsightsPage />);
    const btn = screen.getByTestId("insights-reload-btn");
    expect(btn).toBeTruthy();
  });

  it("reload button calls all hooks with refreshCount=1 after click", async () => {
    mockData();
    mockActivityData();
    render(<InsightsPage />);
    const btn = screen.getByTestId("insights-reload-btn");
    fireEvent.click(btn);
    // After click, hooks are called with refreshCount=1
    expect(vi.mocked(useInsightsAggregate)).toHaveBeenLastCalledWith("7d", "all", 1);
    expect(vi.mocked(useInsightsActivity)).toHaveBeenLastCalledWith("7d", "all", 1);
    expect(vi.mocked(useInsightsModelMix)).toHaveBeenLastCalledWith("7d", "all", 1);
    // Called twice: once for filtered data (timeRange, repo) and once for all-repos dropdown
    expect(vi.mocked(useInsightsTopConsumers)).toHaveBeenCalledWith("7d", "all", 1);
    expect(vi.mocked(useInsightsTopConsumers)).toHaveBeenCalledWith("all", "all", 1);
    expect(vi.mocked(useInsightsCommandsAgentsSkills)).toHaveBeenLastCalledWith("7d", "all", 1);
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

describe("model mix section", () => {
  it("renders model mix section with data", () => {
    mockData();
    vi.mocked(useInsightsModelMix).mockReturnValue({
      data: {
        models: [
          { model: "claude-sonnet-4-6", tokensIn: 1000, tokensOut: 500, cost: 0.01, turns: 5, share: 0.8 },
          { model: "claude-haiku-4-5", tokensIn: 200, tokensOut: 100, cost: 0.001, turns: 2, share: 0.2 },
        ],
        totalTokens: 1800,
      },
      loading: false,
      error: null,
    });
    render(<InsightsPage />);
    expect(screen.getByTestId("section-model-mix")).toBeTruthy();
    expect(screen.getByText("Model mix")).toBeTruthy();
    expect(screen.getByText("claude-sonnet-4-6")).toBeTruthy();
  });

  it("renders model mix loading state", () => {
    mockData();
    vi.mocked(useInsightsModelMix).mockReturnValue({ data: null, loading: true, error: null });
    render(<InsightsPage />);
    expect(screen.getByTestId("section-model-mix")).toBeTruthy();
  });
});

describe("top consumers section", () => {
  it("renders top consumers section with data", () => {
    mockData();
    vi.mocked(useInsightsModelMix).mockReturnValue({ data: null, loading: false, error: null });
    vi.mocked(useInsightsTopConsumers).mockReturnValue({
      data: {
        repos: [{ repo: "claude-devtools", cwd: "/path/to/claude-devtools", tokensIn: 1000, tokensOut: 500, totalTokens: 1500, cost: 0.01, share: 1.0 }],
        sessions: [{ sessionId: "s1", date: "2026-04-18", repo: "claude-devtools", cost: 0.01, share: 1.0 }],
        tools: [{ name: "Read", count: 42, share: 1.0 }],
      },
      loading: false,
      error: null,
    });
    render(<InsightsPage />);
    expect(screen.getByTestId("section-top-consumers")).toBeTruthy();
    expect(screen.getAllByText("claude-devtools").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("renders top consumers loading state", () => {
    mockData();
    vi.mocked(useInsightsTopConsumers).mockReturnValue({ data: null, loading: true, error: null });
    render(<InsightsPage />);
    expect(screen.getByTestId("section-top-consumers")).toBeTruthy();
  });
});
