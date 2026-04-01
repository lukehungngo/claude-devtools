import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Mock child_process before importing routes
vi.mock("child_process", () => ({
    execSync: vi.fn(),
    spawnSync: vi.fn(() => ({ status: 0, error: null })),
}));
// Mock all heavy dependencies that routes.ts imports
vi.mock("../parser/session-discovery.js", () => ({
    discoverSessions: vi.fn(() => []),
    discoverRepoGroups: vi.fn(() => []),
    loadFullSession: vi.fn(),
}));
vi.mock("../analyzer/metrics.js", () => ({
    computeMetrics: vi.fn(),
}));
vi.mock("../api/usage-client.js", () => ({
    getAnthropicUsage: vi.fn(),
}));
vi.mock("../analyzer/cost-aggregator.js", () => ({
    aggregateCosts: vi.fn(),
}));
vi.mock("../analyzer/agent-events.js", () => ({
    getAgentEvents: vi.fn(),
}));
vi.mock("../hooks/permission-handler.js", () => ({
    addPermissionRequest: vi.fn(),
    resolvePermissionRequest: vi.fn(),
    getPendingPermissions: vi.fn(() => []),
    getPermissionStatus: vi.fn(),
    addSessionAllowance: vi.fn(),
}));
vi.mock("../debug/lifecycle-builder.js", () => ({
    buildLifecycleRecords: vi.fn(),
}));
vi.mock("../logger.js", () => ({
    sessionLog: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
    permissionLog: { info: vi.fn(), warn: vi.fn() },
}));
import request from "supertest";
import express from "express";
import { setupRoutes } from "../http/routes.js";
import { SessionManager } from "./session-manager.js";
describe("POST /sessions/:sessionId/permission-mode", () => {
    let app;
    let sessionManager;
    beforeEach(() => {
        sessionManager = new SessionManager(vi.fn());
        const state = {
            clients: new Set(),
            sessionManager,
        };
        app = express();
        app.use(setupRoutes(state));
        vi.clearAllMocks();
    });
    afterEach(() => {
        sessionManager.dispose();
    });
    it("sets permission mode on a valid session", async () => {
        const sessionId = await sessionManager.startSession("/tmp");
        const res = await request(app)
            .post(`/sessions/${sessionId}/permission-mode`)
            .send({ mode: "acceptEdits" });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, mode: "acceptEdits" });
        expect(sessionManager.getStatus(sessionId)?.permissionMode).toBe("acceptEdits");
    });
    it("returns 404 for unknown session", async () => {
        const res = await request(app)
            .post("/sessions/nonexistent-id/permission-mode")
            .send({ mode: "plan" });
        expect(res.status).toBe(404);
    });
    it("returns 400 for invalid mode", async () => {
        const sessionId = await sessionManager.startSession("/tmp");
        const res = await request(app)
            .post(`/sessions/${sessionId}/permission-mode`)
            .send({ mode: "invalid" });
        expect(res.status).toBe(400);
    });
    it("accepts all 5 SDK permission modes", async () => {
        const sessionId = await sessionManager.startSession("/tmp");
        for (const mode of ["default", "acceptEdits", "plan", "dontAsk", "bypassPermissions"]) {
            const res = await request(app)
                .post(`/sessions/${sessionId}/permission-mode`)
                .send({ mode });
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true, mode });
        }
    });
    it("returns 400 when mode is missing", async () => {
        const sessionId = await sessionManager.startSession("/tmp");
        const res = await request(app)
            .post(`/sessions/${sessionId}/permission-mode`)
            .send({});
        expect(res.status).toBe(400);
    });
});
//# sourceMappingURL=routes-permission-mode.test.js.map