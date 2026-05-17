import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createEfficiencyRoutes } from "./routes/efficiency-routes.js";
import type { RouteContext } from "./routes/route-context.js";

vi.mock("../analyzer/efficiency/index.js", () => ({
  computeHints: vi.fn(() => ({ range: "7d", hints: [], sessionCount: 0, totalCost: 0 })),
  getEvidence: vi.fn(() => undefined),
}));

const app = express();
app.use(express.json());
app.use(createEfficiencyRoutes({} as RouteContext));

describe("GET /efficiency/hints", () => {
  it("returns 200 with valid range", async () => {
    const res = await request(app).get("/efficiency/hints?range=7d");
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
  });

  it("returns 200 with default range when not specified", async () => {
    const res = await request(app).get("/efficiency/hints");
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
  });

  it("returns 400 with invalid range", async () => {
    const res = await request(app).get("/efficiency/hints?range=bogus");
    expect(res.status).toBe(400);
  });
});

describe("GET /efficiency/hints/:id/evidence", () => {
  it("returns 404 for unknown hint", async () => {
    const res = await request(app).get("/efficiency/hints/unknown-7d/evidence");
    expect(res.status).toBe(404);
  });
});

describe("POST /efficiency/report", () => {
  it("returns 400 with invalid range", async () => {
    const res = await request(app)
      .post("/efficiency/report")
      .send({ range: "invalid" });
    expect(res.status).toBe(400);
  });
});
