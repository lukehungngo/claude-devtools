import { bench, describe } from "vitest";
import { groupIntoPhases } from "./phaseGrouping";
import { groupEventsIntoTurns } from "./turnSnapshot";
import { generateEvents } from "../test-utils/generate-events";
import type { ToolGroup, ToolEntry } from "../components/conversation/ToolEntries";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOOL_NAMES = ["Read", "Grep", "Glob", "Edit", "Write", "Bash"];

function makeEntry(id: string, name: string, filePath: string): ToolEntry {
  return {
    id,
    name,
    target: filePath,
    status: "success",
    resultContent: `Result for ${filePath}`,
    resultIsError: false,
    toolInput: { file_path: filePath },
  };
}

function makeGroup(name: string, entryCount: number, groupIndex: number): ToolGroup {
  const entries: ToolEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    entries.push(
      makeEntry(
        `entry-${groupIndex}-${i}`,
        name,
        `src/module${groupIndex}/file${i}.ts`,
      ),
    );
  }
  return { name, entries, isCollapsed: entryCount > 1 };
}

/**
 * Build a realistic ToolGroup[] for benchmarking.
 *
 * Pattern: cycles through non-agent tool names, producing groups of 1-3
 * entries each, to simulate a real turn's tool call sequence.
 */
function buildToolGroups(count: number): ToolGroup[] {
  const groups: ToolGroup[] = [];
  for (let i = 0; i < count; i++) {
    const name = TOOL_NAMES[i % TOOL_NAMES.length];
    const entryCount = (i % 3) + 1; // 1, 2, or 3 entries per group
    groups.push(makeGroup(name, entryCount, i));
  }
  return groups;
}

// ─── Pre-generate events and turns ───────────────────────────────────────────

const events100 = generateEvents(100);
const events500 = generateEvents(500);
const events2k = generateEvents(2_000);

const turns100 = groupEventsIntoTurns(events100);
const turns500 = groupEventsIntoTurns(events500);
const turns2k = groupEventsIntoTurns(events2k);

// Approximate group counts: ~1 group per 2 events, mirroring turn density
const groupCount100 = Math.max(2, Math.floor(events100.length / 2));
const groupCount500 = Math.max(2, Math.floor(events500.length / 2));
const groupCount2k = Math.max(2, Math.floor(events2k.length / 2));

// Pre-build synthetic ToolGroup arrays sized to match each session
const groups100 = buildToolGroups(groupCount100);
const groups500 = buildToolGroups(groupCount500);
const groups2k = buildToolGroups(groupCount2k);

// Expose turn counts so the bench descriptions are accurate
const _turnCount100 = turns100.length;
const _turnCount500 = turns500.length;
const _turnCount2k = turns2k.length;

// ─── Benchmarks ──────────────────────────────────────────────────────────────

describe("groupIntoPhases — varying session sizes", () => {
  bench(`100 events (~${_turnCount100} turns, ${groupCount100} groups)`, () => {
    groupIntoPhases(groups100);
  });

  bench(`500 events (~${_turnCount500} turns, ${groupCount500} groups)`, () => {
    groupIntoPhases(groups500);
  });

  bench(`2K events (~${_turnCount2k} turns, ${groupCount2k} groups)`, () => {
    groupIntoPhases(groups2k);
  });
});

describe("groupIntoPhases — with thinkingContext", () => {
  const thinkingContext = "Refactoring the validation logic in the auth module";

  bench(`100 events with thinkingContext`, () => {
    groupIntoPhases(groups100, undefined, thinkingContext);
  });

  bench(`500 events with thinkingContext`, () => {
    groupIntoPhases(groups500, undefined, thinkingContext);
  });

  bench(`2K events with thinkingContext`, () => {
    groupIntoPhases(groups2k, undefined, thinkingContext);
  });
});

describe("groupIntoPhases — empty and single-group edge cases", () => {
  const emptyGroups: ToolGroup[] = [];
  const singleGroup = buildToolGroups(1);

  bench("empty groups", () => {
    groupIntoPhases(emptyGroups);
  });

  bench("single group (no phase wrapping)", () => {
    groupIntoPhases(singleGroup);
  });
});
