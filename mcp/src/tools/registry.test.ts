import { describe, it, expect } from "vitest";
import { allToolDefinitions } from "./registry.js";
// Import all tool modules to trigger registration
import "./list-sessions.js";
import "./get-session.js";
import "./search-sessions.js";
import "./usage-summary.js";
import "./cost-by-project.js";
import "./model-distribution.js";
import "./cache-hit-trends.js";
import "./token-timeline.js";
import "./tool-usage-breakdown.js";
import "./edit-to-read-ratio.js";
import "./retry-loops-detected.js";
import "./subagent-fanout.js";
import "./longest-sessions.js";
import "./error-rate.js";
import "./unfinished-sessions.js";

describe("tool registry", () => {
  it("declares 15 tools with the spec'd names", () => {
    const names = allToolDefinitions()
      .map((t) => t.name)
      .sort();
    expect(names).toEqual([
      "cache_hit_trends",
      "cost_by_project",
      "edit_to_read_ratio",
      "error_rate",
      "get_session",
      "list_sessions",
      "longest_sessions",
      "model_distribution",
      "retry_loops_detected",
      "search_sessions",
      "subagent_fanout",
      "token_timeline",
      "tool_usage_breakdown",
      "unfinished_sessions",
      "usage_summary",
    ]);
  });
});
