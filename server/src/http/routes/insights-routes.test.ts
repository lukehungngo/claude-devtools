import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../parser/session-discovery.js", () => ({
  discoverSessions: vi.fn(() => []),
}));
vi.mock("../../analyzer/insights-aggregator.js", () => ({
  computeInsightsAggregate: vi.fn(() => ({
    tokensIn: 1000,
    tokensOut: 500,
    cost: 0.005,
    sessions: 3,
    turns: 12,
    avgCostPerTurn: 0.0004,
    avgTokensPerTurn: 125,
    activeDays: 2,
    peakHour: 14,
    daily: [{ date: "2026-04-18", tokensIn: 1000, tokensOut: 500, cost: 0.005 }],
  })),
}));
vi.mock("../../analyzer/activity-aggregator.js", () => ({
  computeInsightsActivity: vi.fn(() => ({
    heatmap: [{ day: 0, hour: 9, intensity: 3 }],
    hourly: [{ hour: 9, tokensAvg: 1500 }],
  })),
}));
vi.mock("../../analyzer/breakdown-aggregator.js", () => ({
  computeInsightsBreakdown: vi.fn(() => ({
    models: [{ model: "claude-sonnet-4-6", tokensIn: 1000, tokensOut: 500, cost: 0.005, turns: 2, share: 100 }],
    topRepos: [{ slug: "/project", tokens: 1500, cost: 0.005 }],
    topSessions: [{ id: "s1", label: "project · 2026-04-19", cost: 0.005 }],
    topTools: [{ name: "Read", calls: 10 }],
  })),
}));
vi.mock("../../analyzer/trends-aggregator.js", () => ({
  computeInsightsTrends: vi.fn(() => ({
    commands: [{ name: "/review", calls: 3, avgIn: 100, avgOut: 50, weekly: [{ in: 100, out: 50 }], verdict: "stable" }],
    agents: [],
    skills: [],
  })),
}));
vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import request from "supertest";
import express from "express";
import { json } from "express";
import { createInsightsRoutes } from "./insights-routes.js";
import { discoverSessions } from "../../parser/session-discovery.js";
import { computeInsightsAggregate } from "../../analyzer/insights-aggregator.js";
import { computeInsightsActivity } from "../../analyzer/activity-aggregator.js";
import { computeInsightsBreakdown } from "../../analyzer/breakdown-aggregator.js";
import { computeInsightsTrends } from "../../analyzer/trends-aggregator.js";

const mockedDiscover = vi.mocked(discoverSessions);
const mockedAggregate = vi.mocked(computeInsightsAggregate);
const mockedActivity = vi.mocked(computeInsightsActivity);
const mockedBreakdown = vi.mocked(computeInsightsBreakdown);
const mockedTrends = vi.mocked(computeInsightsTrends);

function buildApp() {
  const app = express();
  app.use(json());
  app.use(createInsightsRoutes({}));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /insights/aggregate", () => {
  it("returns 200 with aggregate data", async () => {
    const res = await request(buildApp()).get("/insights/aggregate");
    expect(res.status).toBe(200);
    expect(res.body.tokensIn).toBe(1000);
    expect(res.body.sessions).toBe(3);
    expect(res.body.daily).toHaveLength(1);
  });

  it("passes timeRange and repo to computeInsightsAggregate", async () => {
    await request(buildApp()).get(
      "/insights/aggregate?timeRange=30d&repo=/home/user/project"
    );
    expect(mockedAggregate).toHaveBeenCalledWith(
      expect.anything(),
      "30d",
      "/home/user/project"
    );
  });

  it("uses 7d and all as defaults", async () => {
    await request(buildApp()).get("/insights/aggregate");
    expect(mockedAggregate).toHaveBeenCalledWith(expect.anything(), "7d", "all");
  });

  it("returns 400 for invalid timeRange", async () => {
    const res = await request(buildApp()).get(
      "/insights/aggregate?timeRange=invalid"
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/timeRange/);
  });

  it("calls discoverSessions()", async () => {
    await request(buildApp()).get("/insights/aggregate");
    expect(mockedDiscover).toHaveBeenCalledTimes(1);
  });

  it("accepts all valid timeRange values", async () => {
    for (const tr of ["24h", "7d", "30d", "90d", "all"]) {
      const res = await request(buildApp()).get(
        `/insights/aggregate?timeRange=${tr}`
      );
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /insights/activity", () => {
  it("returns 200 with heatmap and hourly data", async () => {
    const res = await request(buildApp()).get("/insights/activity");
    expect(res.status).toBe(200);
    expect(res.body.heatmap).toBeDefined();
    expect(res.body.hourly).toBeDefined();
  });

  it("passes timeRange and repo to computeInsightsActivity", async () => {
    await request(buildApp()).get(
      "/insights/activity?timeRange=30d&repo=/home/user/project"
    );
    expect(mockedActivity).toHaveBeenCalledWith(
      expect.anything(),
      "30d",
      "/home/user/project"
    );
  });

  it("uses 7d and all as defaults", async () => {
    await request(buildApp()).get("/insights/activity");
    expect(mockedActivity).toHaveBeenCalledWith(expect.anything(), "7d", "all");
  });

  it("returns 400 for invalid timeRange", async () => {
    const res = await request(buildApp()).get(
      "/insights/activity?timeRange=invalid"
    );
    expect(res.status).toBe(400);
  });

  it("accepts all valid timeRange values", async () => {
    for (const tr of ["24h", "7d", "30d", "90d", "all"]) {
      const res = await request(buildApp()).get(
        `/insights/activity?timeRange=${tr}`
      );
      expect(res.status).toBe(200);
    }
  });
});

describe("GET /insights/breakdown", () => {
  it("returns 200 with breakdown data", async () => {
    const res = await request(buildApp()).get("/insights/breakdown");
    expect(res.status).toBe(200);
    expect(res.body.models).toBeDefined();
    expect(res.body.topRepos).toBeDefined();
    expect(res.body.topSessions).toBeDefined();
    expect(res.body.topTools).toBeDefined();
  });

  it("passes timeRange and repo to computeInsightsBreakdown", async () => {
    await request(buildApp()).get("/insights/breakdown?timeRange=30d&repo=/my/project");
    expect(mockedBreakdown).toHaveBeenCalledWith(expect.anything(), "30d", "/my/project");
  });

  it("uses 7d and all as defaults", async () => {
    await request(buildApp()).get("/insights/breakdown");
    expect(mockedBreakdown).toHaveBeenCalledWith(expect.anything(), "7d", "all");
  });

  it("returns 400 for invalid timeRange", async () => {
    const res = await request(buildApp()).get("/insights/breakdown?timeRange=invalid");
    expect(res.status).toBe(400);
  });

  it("accepts all valid timeRange values", async () => {
    for (const tr of ["24h", "7d", "30d", "90d", "all"]) {
      const res = await request(buildApp()).get(`/insights/breakdown?timeRange=${tr}`);
      expect(res.status).toBe(200);
    }
  });

  it("returns 500 when computeInsightsBreakdown throws", async () => {
    mockedBreakdown.mockImplementationOnce(() => { throw new Error("compute failed"); });
    const res = await request(buildApp()).get("/insights/breakdown");
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

describe("GET /insights/trends", () => {
  it("returns 200 with trends data", async () => {
    const res = await request(buildApp()).get("/insights/trends");
    expect(res.status).toBe(200);
    expect(res.body.commands).toBeDefined();
    expect(res.body.agents).toBeDefined();
    expect(res.body.skills).toBeDefined();
  });

  it("passes timeRange and repo to computeInsightsTrends", async () => {
    await request(buildApp()).get("/insights/trends?timeRange=30d&repo=/my/project");
    expect(mockedTrends).toHaveBeenCalledWith(expect.anything(), "30d", "/my/project");
  });

  it("uses 7d and all as defaults", async () => {
    await request(buildApp()).get("/insights/trends");
    expect(mockedTrends).toHaveBeenCalledWith(expect.anything(), "7d", "all");
  });

  it("returns 400 for invalid timeRange", async () => {
    const res = await request(buildApp()).get("/insights/trends?timeRange=bad");
    expect(res.status).toBe(400);
  });

  it("accepts all valid timeRange values", async () => {
    for (const tr of ["24h", "7d", "30d", "90d", "all"]) {
      const res = await request(buildApp()).get(`/insights/trends?timeRange=${tr}`);
      expect(res.status).toBe(200);
    }
  });

  it("returns 500 when computeInsightsTrends throws", async () => {
    mockedTrends.mockImplementationOnce(() => { throw new Error("compute failed"); });
    const res = await request(buildApp()).get("/insights/trends");
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});
