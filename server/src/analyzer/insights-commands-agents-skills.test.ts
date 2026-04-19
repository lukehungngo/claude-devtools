import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionInfo, SessionEvent } from "../types.js";

vi.mock("../parser/jsonl-reader.js", () => ({
  parseJsonlIncremental: vi.fn(() => ({ events: [], newOffset: 0 })),
}));
vi.mock("./insights-aggregator.js", () => ({
  getTimeRangeCutoff: vi.fn().mockReturnValue(0),
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, statSync: vi.fn(() => ({ size: 1000 })) };
});

import { statSync } from "node:fs";
import { parseJsonlIncremental } from "../parser/jsonl-reader.js";
import { getTimeRangeCutoff } from "./insights-aggregator.js";
import {
  computeInsightsCommandsAgentsSkills,
  resetCasForTesting,
} from "./insights-commands-agents-skills.js";

const mockedStat = vi.mocked(statSync);
const mockedParse = vi.mocked(parseJsonlIncremental);
const mockedCutoff = vi.mocked(getTimeRangeCutoff);

let sizeCounter = 0;

function makeSession(id: string, lastModified = "2026-04-18T12:00:00Z"): SessionInfo {
  return {
    id,
    projectHash: "abc",
    path: `/fake/${id}.jsonl`,
    startTime: lastModified,
    lastModified,
    eventCount: 1,
    subagentCount: 0,
    cwd: "/fake/repo",
  };
}

let _eventSeq = 0;

function makeUserEvent(text: string): SessionEvent {
  return {
    type: "user",
    uuid: `u-${++_eventSeq}`,
    timestamp: "2026-04-18T12:00:00Z",
    sessionId: "s-test",
    message: {
      role: "user",
      content: [{ type: "text", text }],
    },
  } as unknown as SessionEvent;
}

function makeAssistantToolEvent(name: string, input: Record<string, unknown>): SessionEvent {
  return {
    type: "assistant",
    uuid: `a-${++_eventSeq}`,
    timestamp: "2026-04-18T12:00:00Z",
    sessionId: "s-test",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", name, input }],
    },
  } as unknown as SessionEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  sizeCounter = 0;
  resetCasForTesting();
  mockedCutoff.mockReturnValue(0);
  mockedStat.mockImplementation(
    () => ({ size: ++sizeCounter * 100 }) as ReturnType<typeof statSync>
  );
  mockedParse.mockReturnValue({ events: [], newOffset: 100 });
});

describe("computeInsightsCommandsAgentsSkills", () => {
  it("returns empty arrays for no sessions", () => {
    const result = computeInsightsCommandsAgentsSkills([], "all", "all");
    expect(result.commands).toHaveLength(0);
    expect(result.agents).toHaveLength(0);
    expect(result.skills).toHaveLength(0);
  });

  it("counts slash commands from user events", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("/compact run fast"),
        makeUserEvent("/compact again"),
        makeUserEvent("/model claude-opus"),
        makeUserEvent("not a command"),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.commands).toHaveLength(2);
    const compact = result.commands.find((c) => c.name === "/compact");
    expect(compact?.count).toBe(2);
    const model = result.commands.find((c) => c.name === "/model");
    expect(model?.count).toBe(1);
  });

  it("ignores user messages that do not start with /", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("hello world"),
        makeUserEvent("run the tests"),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.commands).toHaveLength(0);
  });

  it("counts Agent tool_use as agent dispatches", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeAssistantToolEvent("Agent", { subagent_type: "mas:engineer:engineer" }),
        makeAssistantToolEvent("Agent", { subagent_type: "mas:engineer:engineer" }),
        makeAssistantToolEvent("Agent", { subagent_type: "mas:reviewer:reviewer" }),
        makeAssistantToolEvent("Read", {}),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.agents).toHaveLength(2);
    const engineer = result.agents.find((a) => a.type === "mas:engineer:engineer");
    expect(engineer?.count).toBe(2);
    const reviewer = result.agents.find((a) => a.type === "mas:reviewer:reviewer");
    expect(reviewer?.count).toBe(1);
  });

  it("falls back to description when subagent_type is missing", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeAssistantToolEvent("Agent", { description: "run the build" }),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.agents[0].type).toBe("run the build");
  });

  it("falls back to 'unknown' when neither subagent_type nor description is present", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeAssistantToolEvent("Agent", {}),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.agents[0].type).toBe("unknown");
  });

  it("counts Skill tool_use by input.skill", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeAssistantToolEvent("Skill", { skill: "verification" }),
        makeAssistantToolEvent("Skill", { skill: "verification" }),
        makeAssistantToolEvent("Skill", { skill: "writing-plans" }),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.skills).toHaveLength(2);
    const ver = result.skills.find((s) => s.name === "verification");
    expect(ver?.count).toBe(2);
  });

  it("share of #1 entry is 1.0, others are fractions", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("/compact"),
        makeUserEvent("/compact"),
        makeUserEvent("/compact"),
        makeUserEvent("/model"),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.commands[0].share).toBeCloseTo(1.0);
    expect(result.commands[1].share).toBeCloseTo(1 / 3);
  });

  it("sorts by count descending", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("/model"),
        makeUserEvent("/compact"),
        makeUserEvent("/compact"),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.commands[0].name).toBe("/compact");
    expect(result.commands[1].name).toBe("/model");
  });

  it("caps results at top 10", () => {
    const session = makeSession("s1");
    const events = Array.from({ length: 12 }, (_, i) =>
      makeUserEvent(`/cmd${i}`)
    );
    mockedParse.mockReturnValue({ events, newOffset: 100 });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.commands.length).toBeLessThanOrEqual(10);
  });

  it("uses incremental cache — does not re-parse if file size unchanged", () => {
    const session = makeSession("s1");
    mockedStat.mockReturnValue({ size: 500 } as ReturnType<typeof statSync>);
    mockedParse.mockReturnValue({
      events: [makeUserEvent("/compact")],
      newOffset: 500,
    });

    computeInsightsCommandsAgentsSkills([session], "all", "all");
    computeInsightsCommandsAgentsSkills([session], "all", "all");

    expect(mockedParse).toHaveBeenCalledTimes(1);
  });

  it("filters sessions by timeRange using getTimeRangeCutoff", () => {
    const oldSession = makeSession("s1", "2020-01-01T00:00:00Z");
    mockedCutoff.mockReturnValue(new Date("2026-01-01").getTime());

    const result = computeInsightsCommandsAgentsSkills([oldSession], "7d", "all");
    expect(mockedParse).not.toHaveBeenCalled();
    expect(result.commands).toHaveLength(0);
  });

  it("filters sessions by repo (cwd)", () => {
    const s1 = { ...makeSession("s1"), cwd: "/fake/repo-a" };
    const s2 = { ...makeSession("s2"), cwd: "/fake/repo-b" };

    // Only s1 matches the repo filter, so only queue one stat+parse item.
    // Queuing extras that won't be consumed would leak into subsequent tests
    // because vi.clearAllMocks() does not drain the mockReturnValueOnce queue.
    mockedStat.mockReturnValueOnce({ size: 100 } as ReturnType<typeof statSync>);
    mockedParse.mockReturnValueOnce({ events: [makeUserEvent("/compact")], newOffset: 100 });

    const result = computeInsightsCommandsAgentsSkills([s1, s2], "all", "/fake/repo-a");
    expect(result.commands).toHaveLength(1);
    expect(result.commands[0].name).toBe("/compact");
  });

  it("aggregates across multiple sessions", () => {
    const s1 = makeSession("s1");
    const s2 = makeSession("s2");
    mockedStat
      .mockReturnValueOnce({ size: 100 } as ReturnType<typeof statSync>)
      .mockReturnValueOnce({ size: 200 } as ReturnType<typeof statSync>);
    mockedParse
      .mockReturnValueOnce({ events: [makeUserEvent("/compact")], newOffset: 100 })
      .mockReturnValueOnce({ events: [makeUserEvent("/compact")], newOffset: 200 });

    const result = computeInsightsCommandsAgentsSkills([s1, s2], "all", "all");
    expect(result.commands[0].count).toBe(2);
  });

  it("detects MAS commands from heading-format user messages", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("# Brainstorm (MAS)\n\nFirst principles decomposition for: something"),
        makeUserEvent("# Brainstorm (MAS)\n\nFirst principles decomposition for: another"),
        makeUserEvent("# Development Loop (MAS)\n\nExecute the full mandatory workflow for: feat"),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    const brainstorm = result.commands.find((c) => c.name === "/mas:brainstorm");
    expect(brainstorm?.count).toBe(2);
    const devloop = result.commands.find((c) => c.name === "/mas:development-loop");
    expect(devloop?.count).toBe(1);
  });

  it("does not detect skill result messages as commands", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("Base directory for this skill: /Users/soh/.claude/skills/verification\n\n# Verification Before Completion\n\n..."),
        makeUserEvent("Base directory for this skill: /Users/soh/.claude/plugins/cache/superpowers/skills/writing-plans\n\n# Writing Plans\n\n..."),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.commands).toHaveLength(0);
  });

  it("does not detect plain headings without (MAS) marker as commands", () => {
    const session = makeSession("s1");
    mockedParse.mockReturnValue({
      events: [
        makeUserEvent("# Writing Plans\n\nSome content here"),
        makeUserEvent("# Some Random Heading\n\nMore content"),
      ],
      newOffset: 100,
    });

    const result = computeInsightsCommandsAgentsSkills([session], "all", "all");
    expect(result.commands).toHaveLength(0);
  });
});
