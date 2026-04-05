import { bench, describe } from "vitest";
import { computeMetrics } from "./metrics.js";
import { generateEvents, generateSubagentData } from "../test-utils/generate-events.js";
import type { SessionInfo } from "../types.js";

const stubSessionInfo: SessionInfo = {
  id: "bench-session-001",
  projectHash: "abc123",
  path: "/fake/path/bench-session-001.jsonl",
  startTime: new Date(1_700_000_000_000).toISOString(),
  lastModified: new Date(1_700_000_100_000).toISOString(),
  eventCount: 0,
  subagentCount: 0,
  cwd: "/fake/cwd",
  gitBranch: "main",
  model: "claude-sonnet-4-6",
  isActive: false,
  isRunning: false,
};

// Pre-generate all event arrays outside bench() calls to isolate computeMetrics() cost.
const events100 = generateEvents(100);
const events1k = generateEvents(1_000);
const events10k = generateEvents(10_000);

const { subagentEvents: subEvents5, subagentMeta: subMeta5 } = generateSubagentData(5);
const { subagentEvents: subEvents20, subagentMeta: subMeta20 } = generateSubagentData(20);

describe("computeMetrics", () => {
  bench("100 events, 0 agents", () => {
    computeMetrics(stubSessionInfo, events100, new Map(), new Map());
  });

  bench("1K events, 5 agents", () => {
    computeMetrics(stubSessionInfo, events1k, subEvents5, subMeta5);
  });

  bench("10K events, 20 agents", () => {
    computeMetrics(stubSessionInfo, events10k, subEvents20, subMeta20);
  });
});
