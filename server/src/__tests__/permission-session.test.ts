import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../http/routes.js";
import {
  addPermissionRequest,
  resolvePermissionRequest,
  addSessionAllowance,
  isToolAllowedForSession,
  clearSessionAllowances,
} from "../hooks/permission-handler.js";
import type { ServerState } from "../http/server.js";

describe("Session-scoped permission allowances", () => {
  beforeEach(() => {
    clearSessionAllowances();
  });

  it("isToolAllowedForSession returns false when no allowance exists", () => {
    expect(isToolAllowedForSession("sess-1", "Bash")).toBe(false);
  });

  it("addSessionAllowance makes isToolAllowedForSession return true", () => {
    addSessionAllowance("sess-1", "Bash");
    expect(isToolAllowedForSession("sess-1", "Bash")).toBe(true);
  });

  it("session allowances are scoped per session", () => {
    addSessionAllowance("sess-1", "Bash");
    expect(isToolAllowedForSession("sess-1", "Bash")).toBe(true);
    expect(isToolAllowedForSession("sess-2", "Bash")).toBe(false);
  });

  it("session allowances are scoped per tool", () => {
    addSessionAllowance("sess-1", "Bash");
    expect(isToolAllowedForSession("sess-1", "Bash")).toBe(true);
    expect(isToolAllowedForSession("sess-1", "Write")).toBe(false);
  });

  it("auto-approves permission when tool is already allowed for session", () => {
    addSessionAllowance("sess-1", "Bash");

    const permission = addPermissionRequest({
      sessionId: "sess-1",
      agentId: "main",
      toolName: "Bash",
      input: { command: "ls" },
    });

    expect(permission.status).toBe("approved");
  });

  it("does NOT auto-approve for a different tool in the same session", () => {
    addSessionAllowance("sess-1", "Bash");

    const permission = addPermissionRequest({
      sessionId: "sess-1",
      agentId: "main",
      toolName: "Write",
      input: { file_path: "/tmp/foo" },
    });

    expect(permission.status).toBe("pending");
  });

  it("clearSessionAllowances removes all allowances", () => {
    addSessionAllowance("sess-1", "Bash");
    addSessionAllowance("sess-2", "Write");
    clearSessionAllowances();
    expect(isToolAllowedForSession("sess-1", "Bash")).toBe(false);
    expect(isToolAllowedForSession("sess-2", "Write")).toBe(false);
  });
});

describe("POST /api/permissions/:id/decide with scope=session", () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    clearSessionAllowances();
    const state: ServerState = { clients: new Set() };
    app = express();
    app.use("/api", setupRoutes(state));
  });

  it("adds session allowance when scope is 'session' and decision is 'approved'", async () => {
    // Create a permission first
    const perm = addPermissionRequest({
      sessionId: "sess-route-1",
      agentId: "main",
      toolName: "Bash",
      input: { command: "echo hello" },
    });

    const res = await request(app)
      .post(`/api/permissions/${perm.id}/decide`)
      .send({ decision: "approved", scope: "session" })
      .expect(200);

    expect(res.body).toEqual({ success: true });
    expect(isToolAllowedForSession("sess-route-1", "Bash")).toBe(true);
  });

  it("does NOT add session allowance when scope is absent", async () => {
    const perm = addPermissionRequest({
      sessionId: "sess-route-2",
      agentId: "main",
      toolName: "Write",
      input: { file_path: "/tmp/foo" },
    });

    await request(app)
      .post(`/api/permissions/${perm.id}/decide`)
      .send({ decision: "approved" })
      .expect(200);

    expect(isToolAllowedForSession("sess-route-2", "Write")).toBe(false);
  });

  it("does NOT add session allowance when decision is 'denied'", async () => {
    const perm = addPermissionRequest({
      sessionId: "sess-route-3",
      agentId: "main",
      toolName: "Bash",
      input: { command: "rm -rf /" },
    });

    await request(app)
      .post(`/api/permissions/${perm.id}/decide`)
      .send({ decision: "denied", scope: "session" })
      .expect(200);

    expect(isToolAllowedForSession("sess-route-3", "Bash")).toBe(false);
  });

  it("auto-approves subsequent requests after session allowance is set", async () => {
    // First: create and approve with session scope
    const perm1 = addPermissionRequest({
      sessionId: "sess-route-4",
      agentId: "main",
      toolName: "Bash",
      input: { command: "echo first" },
    });

    await request(app)
      .post(`/api/permissions/${perm1.id}/decide`)
      .send({ decision: "approved", scope: "session" })
      .expect(200);

    // Second: create a new request for same tool+session — should be auto-approved
    const perm2 = addPermissionRequest({
      sessionId: "sess-route-4",
      agentId: "main",
      toolName: "Bash",
      input: { command: "echo second" },
    });

    expect(perm2.status).toBe("approved");
  });
});
