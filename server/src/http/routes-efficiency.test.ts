import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createEfficiencyRoutes } from "./routes/efficiency-routes.js";
import type { RouteContext } from "./routes/route-context.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../analyzer/efficiency/index.js", () => ({
  computeHints: vi.fn(() => ({ range: "7d", hints: [], sessionCount: 0, totalCost: 0 })),
  getEvidence: vi.fn(() => undefined),
  getDetectedResults: vi.fn(() => []),
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

describe("GET /efficiency/reports", () => {
  const testDir = join(tmpdir(), `devtools-test-reports-${Date.now()}`);

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns 200 with reports list", async () => {
    const res = await request(app).get("/efficiency/reports");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /efficiency/reports/:id", () => {
  it("returns 400 for invalid report ID (path traversal attempt)", async () => {
    // Express normalizes ../../, so test with encoded dots
    const res = await request(app).get("/efficiency/reports/..%2F..%2Fetc%2Fpasswd");
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-matching ID format", async () => {
    const res = await request(app).get("/efficiency/reports/not-a-valid-id");
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent valid ID", async () => {
    const res = await request(app).get("/efficiency/reports/2026-01-01-7d");
    expect(res.status).toBe(404);
  });
});
