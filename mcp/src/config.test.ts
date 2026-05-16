import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("defaults projectsDir to ~/.claude/projects when env unset", () => {
    delete process.env.CLAUDE_PROJECTS_DIR;
    const cfg = loadConfig();
    expect(cfg.projectsDir).toMatch(/\.claude\/projects$/);
  });

  it("honors CLAUDE_PROJECTS_DIR env var", () => {
    process.env.CLAUDE_PROJECTS_DIR = "/tmp/fixture-projects";
    const cfg = loadConfig();
    expect(cfg.projectsDir).toBe("/tmp/fixture-projects");
  });

  it("defaults payloadCapBytes=200_000 and maxEventsPerCall=100_000", () => {
    delete process.env.MCP_PAYLOAD_CAP;
    delete process.env.MCP_MAX_EVENTS;
    const cfg = loadConfig();
    expect(cfg.payloadCapBytes).toBe(200_000);
    expect(cfg.maxEventsPerCall).toBe(100_000);
  });

  it("defaults cacheCapacity=25", () => {
    delete process.env.MCP_CACHE_CAP;
    const cfg = loadConfig();
    expect(cfg.cacheCapacity).toBe(25);
  });
});
