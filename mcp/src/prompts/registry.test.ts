import { describe, it, expect } from "vitest";
import { allPromptDefinitions } from "./registry.js";
import "./perf-review.js";
import "./cost-audit.js";
import "./anti-pattern-check.js";
import "./session-postmortem.js";
import "./weekly-summary.js";

describe("prompts", () => {
  it("declares 5 prompts", () => {
    const names = allPromptDefinitions().map((p) => p.name).sort();
    expect(names).toEqual([
      "anti_pattern_check",
      "cost_audit",
      "perf_review",
      "session_postmortem",
      "weekly_summary",
    ]);
  });

  it("perf_review renders with range arg", () => {
    const def = allPromptDefinitions().find((p) => p.name === "perf_review")!;
    const result = def.render({ range: "7d" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content.text).toContain("usage_summary");
    expect(result.messages[0].content.text).toContain("7d");
  });

  it("weekly_summary renders with no args", () => {
    const def = allPromptDefinitions().find((p) => p.name === "weekly_summary")!;
    const result = def.render({});
    expect(result.messages[0].content.text).toContain("weekly summary");
  });

  it("session_postmortem includes session_id in template", () => {
    const def = allPromptDefinitions().find((p) => p.name === "session_postmortem")!;
    const result = def.render({ session_id: "test-123" });
    expect(result.messages[0].content.text).toContain("test-123");
  });
});
