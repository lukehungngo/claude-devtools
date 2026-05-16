import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../../src/server.js";
import { listSessionsTool } from "../../src/tools/list-sessions.js";
import { getSessionTool } from "../../src/tools/get-session.js";
import { FIXTURE_DIR } from "../../src/__fixtures__/index.js";

beforeAll(() => {
  process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
});

describe("performance budgets (P0 - invariant #8)", () => {
  it("buildServer cold-start < 300ms", () => {
    const start = performance.now();
    buildServer();
    expect(performance.now() - start).toBeLessThan(300);
  });

  it("list_sessions < 50ms", async () => {
    const start = performance.now();
    await listSessionsTool.handler({ range: "all" });
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("get_session(medium) < 100ms", async () => {
    // warm
    await getSessionTool.handler({ id: "medium", include: ["metrics"] });
    const start = performance.now();
    await getSessionTool.handler({ id: "medium", include: ["metrics"] });
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("memory < 200MB after session scan", async () => {
    await getSessionTool.handler({ id: "long", include: ["events", "metrics"] });
    const mb = process.memoryUsage().heapUsed / 1_048_576;
    expect(mb).toBeLessThan(200);
  });
});
