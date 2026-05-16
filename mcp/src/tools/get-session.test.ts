import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSessionTool } from "./get-session.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("get_session", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("returns metrics for a known session", async () => {
    const out = (await getSessionTool.handler({
      id: "medium",
      include: ["metrics"],
    })) as { data: { metrics: unknown } };
    expect(out.data).toHaveProperty("metrics");
  });

  it("rejects invalid id with traversal", async () => {
    await expect(
      getSessionTool.handler({ id: "../etc/passwd", include: ["metrics"] }),
    ).rejects.toThrow(/invalid session id|INVALID_ARGS/);
  });

  it("returns SESSION_NOT_FOUND for missing id", async () => {
    await expect(
      getSessionTool.handler({ id: "ghost", include: ["metrics"] }),
    ).rejects.toThrow(/SESSION_NOT_FOUND/);
  });
});
