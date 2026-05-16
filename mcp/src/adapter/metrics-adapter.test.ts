import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSessionMetrics } from "./metrics-adapter.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("loadSessionMetrics", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns metrics for an existing session id", () => {
    const m = loadSessionMetrics("medium");
    expect(m.totalEvents).toBeGreaterThan(0);
    expect(m.tokens).toBeDefined();
    expect(m.tokens.inputTokens).toBeGreaterThan(0);
  });

  it("throws SESSION_NOT_FOUND for missing session", () => {
    expect(() => loadSessionMetrics("does-not-exist")).toThrow(
      /SESSION_NOT_FOUND/,
    );
  });
});
