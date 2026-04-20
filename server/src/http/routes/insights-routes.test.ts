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
vi.mock("../../analyzer/insights-model-mix.js", () => ({
  computeInsightsModelMix: vi.fn(() => ({
    models: [
      { model: "claude-sonnet-4-6", tokensIn: 1000, tokensOut: 500, cost: 0.01, turns: 5, share: 0.8 },
    ],
    totalTokens: 1500,
  })),
}));
vi.mock("../../analyzer/insights-top-consumers.js", () => ({
  computeInsightsTopConsumers: vi.fn(() => ({
    repos: [{ repo: "my-repo", tokensIn: 1000, tokensOut: 500, totalTokens: 1500, cost: 0.01, share: 1.0 }],
    sessions: [{ sessionId: "s1", date: "2026-04-18", repo: "my-repo", cost: 0.01, share: 1.0 }],
    tools: [{ name: "Read", count: 10, share: 1.0 }],
  })),
}));
vi.mock("../../analyzer/insights-commands-agents-skills.js", () => ({
  computeInsightsCommandsAgentsSkills: vi.fn(() => ({
    commands: [{ name: "/compact", count: 5, share: 1.0, daily: [0, 1, 2, 1, 0, 1, 0], trend: "stable" as const, tokensIn: 500, tokensOut: 200, avgTokensIn: 100, avgTokensOut: 40 }],
    agents: [{ type: "mas:engineer:engineer", count: 3, share: 1.0, daily: [0, 0, 1, 0, 0, 1, 1], trend: "regressing" as const, tokensIn: 900, tokensOut: 600, avgTokensIn: 300, avgTokensOut: 200 }],
    skills: [{ name: "verification", count: 2, share: 1.0, daily: [1, 1, 0, 0, 0, 0, 0], trend: "improving" as const, tokensIn: 400, tokensOut: 300, avgTokensIn: 200, avgTokensOut: 150 }],
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
import { computeInsightsModelMix } from "../../analyzer/insights-model-mix.js";
import { computeInsightsTopConsumers } from "../../analyzer/insights-top-consumers.js";
import { computeInsightsCommandsAgentsSkills } from "../../analyzer/insights-commands-agents-skills.js";

const mockedDiscover = vi.mocked(discoverSessions);
const mockedAggregate = vi.mocked(computeInsightsAggregate);
const mockedActivity = vi.mocked(computeInsightsActivity);
const mockedModelMix = vi.mocked(computeInsightsModelMix);
const mockedTopConsumers = vi.mocked(computeInsightsTopConsumers);
const mockedCas = vi.mocked(computeInsightsCommandsAgentsSkills);

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

describe("GET /insights/model-mix", () => {
  it("returns 200 with model mix data", async () => {
    mockedDiscover.mockReturnValue([]);
    const res = await request(buildApp()).get("/insights/model-mix?timeRange=7d&repo=all");
    expect(res.status).toBe(200);
    expect(res.body.models).toBeDefined();
    expect(res.body.totalTokens).toBeDefined();
  });

  it("returns 400 for invalid timeRange", async () => {
    const res = await request(buildApp()).get("/insights/model-mix?timeRange=bad");
    expect(res.status).toBe(400);
  });

  it("passes timeRange and repo to computeInsightsModelMix", async () => {
    mockedDiscover.mockReturnValue([]);
    await request(buildApp()).get("/insights/model-mix?timeRange=30d&repo=my-repo");
    expect(mockedModelMix).toHaveBeenCalledWith([], "30d", "my-repo");
  });

  it("uses 7d and all as defaults", async () => {
    mockedDiscover.mockReturnValue([]);
    await request(buildApp()).get("/insights/model-mix");
    expect(mockedModelMix).toHaveBeenCalledWith(expect.anything(), "7d", "all");
  });
});

describe("GET /insights/top-consumers", () => {
  it("returns 200 with top consumers data", async () => {
    mockedDiscover.mockReturnValue([]);
    const res = await request(buildApp()).get("/insights/top-consumers?timeRange=7d&repo=all");
    expect(res.status).toBe(200);
    expect(res.body.repos).toBeDefined();
    expect(res.body.sessions).toBeDefined();
    expect(res.body.tools).toBeDefined();
  });

  it("returns 400 for invalid timeRange", async () => {
    const res = await request(buildApp()).get("/insights/top-consumers?timeRange=xyz");
    expect(res.status).toBe(400);
  });

  it("passes timeRange and repo to computeInsightsTopConsumers", async () => {
    mockedDiscover.mockReturnValue([]);
    await request(buildApp()).get("/insights/top-consumers?timeRange=90d&repo=all");
    expect(mockedTopConsumers).toHaveBeenCalledWith([], "90d", "all");
  });

  it("uses 7d and all as defaults", async () => {
    mockedDiscover.mockReturnValue([]);
    await request(buildApp()).get("/insights/top-consumers");
    expect(mockedTopConsumers).toHaveBeenCalledWith(expect.anything(), "7d", "all");
  });
});

describe("GET /insights/commands-agents-skills", () => {
  it("returns 200 with commands, agents, skills", async () => {
    mockedDiscover.mockReturnValue([]);
    const res = await request(buildApp()).get("/insights/commands-agents-skills?timeRange=7d&repo=all");
    expect(res.status).toBe(200);
    expect(res.body.commands).toBeDefined();
    expect(res.body.agents).toBeDefined();
    expect(res.body.skills).toBeDefined();
  });

  it("returns 400 for invalid timeRange", async () => {
    const res = await request(buildApp()).get("/insights/commands-agents-skills?timeRange=bad");
    expect(res.status).toBe(400);
  });

  it("passes timeRange and repo to computeInsightsCommandsAgentsSkills", async () => {
    mockedDiscover.mockReturnValue([]);
    await request(buildApp()).get("/insights/commands-agents-skills?timeRange=30d&repo=my-repo");
    expect(mockedCas).toHaveBeenCalledWith([], "30d", "my-repo");
  });

  it("uses 7d and all as defaults", async () => {
    mockedDiscover.mockReturnValue([]);
    await request(buildApp()).get("/insights/commands-agents-skills");
    expect(mockedCas).toHaveBeenCalledWith(expect.anything(), "7d", "all");
  });
});
