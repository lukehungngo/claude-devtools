import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { allResourceDefinitions } from "./registry.js";
import "./anti-pattern-catalog.js";
import "./baseline-project.js";
import "./report-latest.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

describe("resources", () => {
  const origEnv = { ...process.env };
  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR;
  });
  afterEach(() => {
    process.env = origEnv;
  });

  it("declares 3 resources", () => {
    const uris = allResourceDefinitions().map((r) => r.uri).sort();
    expect(uris).toEqual([
      "baseline://project/{name}",
      "catalog://anti-patterns",
      "report://latest",
    ]);
  });

  it("anti-pattern catalog returns valid JSON", async () => {
    const def = allResourceDefinitions().find(
      (r) => r.uri === "catalog://anti-patterns",
    )!;
    const out = await def.read("catalog://anti-patterns");
    const parsed = JSON.parse(out.contents[0].text);
    expect(parsed.patterns).toHaveLength(5);
  });

  it("report latest returns stub", async () => {
    const def = allResourceDefinitions().find(
      (r) => r.uri === "report://latest",
    )!;
    const out = await def.read("report://latest");
    const parsed = JSON.parse(out.contents[0].text);
    expect(parsed.generatedAt).toBeNull();
  });

  it("baseline-project computes metrics for test-project", async () => {
    const def = allResourceDefinitions().find(
      (r) => r.uri === "baseline://project/{name}",
    )!;
    const out = await def.read("baseline://project/test-project");
    const parsed = JSON.parse(out.contents[0].text);
    expect(parsed.project).toBe("test-project");
    expect(parsed.sessions).toBeGreaterThan(0);
    expect(parsed.totalCost).toBeGreaterThanOrEqual(0);
  });

  it("baseline-project returns cached result on second call", async () => {
    const def = allResourceDefinitions().find(
      (r) => r.uri === "baseline://project/{name}",
    )!;
    await def.read("baseline://project/test-project");
    const out2 = await def.read("baseline://project/test-project");
    const parsed = JSON.parse(out2.contents[0].text);
    expect(parsed.project).toBe("test-project");
  });
});
