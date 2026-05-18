import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createEfficiencyRoutes } from "./routes/efficiency-routes.js";
import type { RouteContext } from "./routes/route-context.js";
import { mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { computeHints } from "../analyzer/efficiency/index.js";

vi.mock("../analyzer/efficiency/index.js", () => ({
  computeHints: vi.fn(() => ({
    range: "7d",
    period: { range: "7d", spend: 0, tokens: 0, sessions: 0, turns: 0 },
    diagnostics: [],
    quickWins: [],
    hints: [],
    sessionCount: 0,
    totalCost: 0,
  })),
  getEvidence: vi.fn(() => undefined),
  getDetectedResults: vi.fn(() => []),
}));

const app = express();
app.use(express.json());
app.use(createEfficiencyRoutes({} as RouteContext));

const TEST_REPORT_CONTENTS = new Set(["old", "new", "markdown", "recent", "Report chunk 1 chunk 2"]);

afterEach(async () => {
  const dir = join(homedir(), ".claude", "devtools", "reports");
  try {
    const files = await readdir(dir);
    await Promise.all(
      files.map(async (file) => {
        if (!file.endsWith(".md")) return;
        const path = join(dir, file);
        try {
          const content = await readFile(path, "utf-8");
          if (TEST_REPORT_CONTENTS.has(content)) {
            await rm(path, { force: true });
          }
        } catch {
          // Ignore cleanup failures.
        }
      })
    );
  } catch {
    // Reports directory may not exist.
  }
});

// App with a mock SessionManager for report generation tests
function createAppWithSessionManager() {
  const mockMessages = [
    { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Report chunk 1" } } },
    { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: " chunk 2" } } },
    // SDK also emits the full assistant message after streaming completes (when includePartialMessages is true).
    // The handler must NOT duplicate text from this message.
    { type: "assistant", message: { content: [{ type: "text", text: "Report chunk 1 chunk 2" }] } },
    { type: "result", is_error: false },
  ];

  const mockSessionManager = {
    startSession: vi.fn().mockResolvedValue("mock-session-id"),
    setPermissionMode: vi.fn().mockReturnValue(true),
    setModel: vi.fn().mockReturnValue(true),
    sendMessage: vi.fn().mockImplementation(async function* () {
      for (const msg of mockMessages) {
        yield msg;
      }
    }),
    removeSession: vi.fn().mockReturnValue(true),
  };

  const ctx: RouteContext = {
    state: {
      sessionManager: mockSessionManager,
    },
  } as unknown as RouteContext;

  const testApp = express();
  testApp.use(express.json());
  testApp.use(createEfficiencyRoutes(ctx));
  return { app: testApp, mockSessionManager };
}

describe("GET /efficiency/hints", () => {
  it("returns 200 with valid range", async () => {
    const res = await request(app).get("/efficiency/hints?range=7d");
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
    expect(res.body).toHaveProperty("period");
    expect(res.body).toHaveProperty("diagnostics");
    expect(res.body).toHaveProperty("quickWins");
    expect(res.body).toHaveProperty("hints");
  });

  it("returns 200 with default range when not specified", async () => {
    const res = await request(app).get("/efficiency/hints");
    expect(res.status).toBe(200);
    expect(res.body.range).toBe("7d");
  });

  it("passes repo scope to the hint computer", async () => {
    await request(app).get("/efficiency/hints?range=30d&repo=%2Ftmp%2Fproject");
    expect(vi.mocked(computeHints)).toHaveBeenLastCalledWith("30d", "/tmp/project");
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

  it("skips generation when a same-range report already exists within 24 hours", async () => {
    const { app: testApp, mockSessionManager } = createAppWithSessionManager();
    const dir = join(homedir(), ".claude", "devtools", "reports");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "2026-05-18-103700-7d.md"), "recent", "utf-8");

    const res = await request(testApp)
      .post("/efficiency/report")
      .send({ range: "7d" })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);
    expect(mockSessionManager.startSession).not.toHaveBeenCalled();
    const body = res.body as string;
    expect(body).toContain('"skipped":true');
    expect(body).toContain('"reason":"recent_report_exists"');
    expect(body).toContain('"reportId":"2026-05-18-103700-7d"');
    expect(body).toContain("data: [DONE]");
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

describe("POST /efficiency/report (SessionManager)", () => {
  it("streams text events via SessionManager and ends with [DONE]", async () => {
    const { app: testApp, mockSessionManager } = createAppWithSessionManager();

    const res = await request(testApp)
      .post("/efficiency/report")
      .send({ range: "7d", force: true })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);

    // Verify SessionManager was called correctly
    expect(mockSessionManager.startSession).toHaveBeenCalledWith(expect.any(String));
    expect(mockSessionManager.setPermissionMode).toHaveBeenCalledWith("mock-session-id", "dontAsk");
    expect(mockSessionManager.setModel).toHaveBeenCalledWith("mock-session-id", "claude-sonnet-4-6");
    expect(mockSessionManager.sendMessage).toHaveBeenCalledWith("mock-session-id", expect.any(String));
    const prompt = mockSessionManager.sendMessage.mock.calls[0]![1] as string;
    expect(prompt).toContain('"quick_wins"');
    expect(prompt).toContain('"diagnostics"');
    expect(mockSessionManager.removeSession).toHaveBeenCalledWith("mock-session-id");

    // Verify SSE format
    const body = res.body as string;
    expect(body).toContain('data: {"text":"Report chunk 1"}');
    expect(body).toContain('data: {"text":" chunk 2"}');
    expect(body).toContain("data: [DONE]");

    // Verify no duplication — the full assistant message must NOT produce a second text event
    const textMatches = body.match(/data: \{"text"/g) ?? [];
    expect(textMatches.length).toBe(2); // exactly 2 stream chunks, no duplicated full-message
  });

  it("saves each generated report as a timestamped snapshot", async () => {
    const { app: testApp } = createAppWithSessionManager();

    const res = await request(testApp)
      .post("/efficiency/report")
      .send({ range: "7d", force: true })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);
    const body = res.body as string;
    expect(body).toMatch(/"reportId":"\d{4}-\d{2}-\d{2}-\d{9}-7d"/);
  });

  it("returns SSE error and cleans up session when sendMessage throws", async () => {
    const { app: testApp, mockSessionManager } = createAppWithSessionManager();
    mockSessionManager.sendMessage.mockImplementation(async function* () {
      yield { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "" } } };
      throw new Error("SDK exploded");
    });

    const res = await request(testApp)
      .post("/efficiency/report")
      .send({ range: "7d", force: true })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);

    const body = res.body as string;
    expect(body).toContain('"error"');
    // Session should be cleaned up even on error
    expect(mockSessionManager.removeSession).toHaveBeenCalledWith("mock-session-id");
  });

  it("falls back to API key when no SessionManager is available", async () => {
    // The default `app` has no sessionManager — falls through to @anthropic-ai/sdk
    // which will fail (no real API key in test env) and hit the error handler
    const res = await request(app)
      .post("/efficiency/report")
      .send({ range: "7d", force: true })
      .buffer(true)
      .parse((res, callback) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => callback(null, data));
      });

    expect(res.status).toBe(200);

    const body = res.body as string;
    expect(body).toContain('"error"');
    expect(body).toContain("Report generation failed");
  });
});

describe("GET /efficiency/reports timestamped snapshots", () => {
  it("lists old date-only reports and new timestamped snapshots", async () => {
    const dir = join(process.env.HOME!, ".claude", "devtools", "reports");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "2026-05-18-7d.md"), "old", "utf-8");
    await writeFile(join(dir, "2026-05-18-103700-7d.md"), "new", "utf-8");

    const res = await request(app).get("/efficiency/reports");

    expect(res.status).toBe(200);
    const ids = res.body.map((r: { id: string }) => r.id);
    expect(ids).toContain("2026-05-18-7d");
    expect(ids).toContain("2026-05-18-103700-7d");
  });

  it("accepts timestamped report IDs", async () => {
    const dir = join(process.env.HOME!, ".claude", "devtools", "reports");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "2026-05-18-103700-7d.md"), "markdown", "utf-8");

    const res = await request(app).get("/efficiency/reports/2026-05-18-103700-7d");

    expect(res.status).toBe(200);
    expect(res.body.markdown).toBe("markdown");
  });
});
