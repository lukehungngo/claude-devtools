import { describe, it, expect } from "vitest";
import { allResourceDefinitions } from "./registry.js";
import "./anti-pattern-catalog.js";
import "./baseline-project.js";
import "./report-latest.js";

describe("resources", () => {
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
});
