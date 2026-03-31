import { describe, it, expect } from "vitest";
import { groupIntoPhases } from "./phaseGrouping";
import type { Phase } from "./phaseGrouping";
import type { ToolGroup, ToolEntry } from "../components/conversation/ToolEntries";

/** Helper to build a ToolEntry with sensible defaults. */
function entry(overrides: Partial<ToolEntry> & { name: string; target: string }): ToolEntry {
  return {
    id: `${overrides.name}-${overrides.target}-${Math.random().toString(36).slice(2, 6)}`,
    status: "success",
    resultContent: undefined,
    resultIsError: false,
    toolInput: overrides.target ? { file_path: overrides.target } : {},
    ...overrides,
  };
}

/** Helper to build a ToolGroup. */
function group(name: string, entries: ToolEntry[], isCollapsed = false): ToolGroup {
  return { name, entries, isCollapsed };
}

describe("phaseGrouping", () => {
  describe("groupIntoPhases", () => {
    it("returns empty array for empty input", () => {
      expect(groupIntoPhases([])).toEqual([]);
    });

    it("groups overlapping-file tool calls into 1 phase", () => {
      // Grep -> Read 3 -> Edit 5 -> Bash rm -> Grep 2 -> Read 2 -> Edit 3
      // ALL files overlapping -> 1 phase
      const groups: ToolGroup[] = [
        group("Grep", [entry({ name: "Grep", target: "src/a.ts" })]),
        group("Read", [
          entry({ name: "Read", target: "src/a.ts" }),
          entry({ name: "Read", target: "src/b.ts" }),
          entry({ name: "Read", target: "src/c.ts" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/b.ts" }),
          entry({ name: "Edit", target: "src/c.ts" }),
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/b.ts" }),
        ]),
        group("Bash", [entry({ name: "Bash", target: "rm src/old.ts", toolInput: { command: "rm src/old.ts" } })]),
        group("Grep", [
          entry({ name: "Grep", target: "src/a.ts" }),
          entry({ name: "Grep", target: "src/b.ts" }),
        ]),
        group("Read", [
          entry({ name: "Read", target: "src/a.ts" }),
          entry({ name: "Read", target: "src/b.ts" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/b.ts" }),
          entry({ name: "Edit", target: "src/c.ts" }),
        ]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].groups).toHaveLength(7);
    });

    it("splits into 2 phases when second cycle touches completely different files", () => {
      const groups: ToolGroup[] = [
        group("Grep", [entry({ name: "Grep", target: "src/a.ts" })]),
        group("Read", [
          entry({ name: "Read", target: "src/a.ts" }),
          entry({ name: "Read", target: "src/b.ts" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/b.ts" }),
        ]),
        // Completely different files
        group("Grep", [entry({ name: "Grep", target: "lib/x.ts" })]),
        group("Read", [
          entry({ name: "Read", target: "lib/x.ts" }),
          entry({ name: "Read", target: "lib/y.ts" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "lib/x.ts" }),
          entry({ name: "Edit", target: "lib/y.ts" }),
        ]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(2);
      expect(phases[0].groups).toHaveLength(3);
      expect(phases[1].groups).toHaveLength(3);
    });

    it("absorbs singleton into adjacent phase when file overlaps", () => {
      const groups: ToolGroup[] = [
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/b.ts" }),
        ]),
        // Singleton that touches overlapping file
        group("Bash", [entry({ name: "Bash", target: "rm src/a.ts", toolInput: { command: "rm src/a.ts" } })]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/c.ts" }),
        ]),
      ];

      const phases = groupIntoPhases(groups);
      // Singleton should be absorbed. All 3 groups in 1 phase.
      expect(phases).toHaveLength(1);
      expect(phases[0].groups).toHaveLength(3);
    });

    it("sets phase status to error if any entry has error status", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts", status: "error" })]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].status).toBe("error");
    });

    it("does NOT wrap single-group phases (returns empty for them)", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
      ];

      const phases = groupIntoPhases(groups);
      // Single group phase should not be wrapped
      expect(phases).toHaveLength(0);
    });

    it("excludes agent dispatch groups from phase wrapping", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Task", [entry({ name: "Task", target: "do something" })]),
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
      ];

      const phases = groupIntoPhases(groups);
      // Agent groups excluded, remaining groups isolated -> no multi-group phases
      // The Task group should not be in any phase
      for (const phase of phases) {
        for (const g of phase.groups) {
          expect(g.name).not.toBe("Task");
        }
      }
    });

    it("produces 2 phases for 10 tool calls across 2 logical refactors", () => {
      const groups: ToolGroup[] = [
        group("Grep", [entry({ name: "Grep", target: "src/comp/Button.tsx" })]),
        group("Read", [
          entry({ name: "Read", target: "src/comp/Button.tsx" }),
          entry({ name: "Read", target: "src/comp/Button.test.tsx" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "src/comp/Button.tsx" }),
          entry({ name: "Edit", target: "src/comp/Button.test.tsx" }),
        ]),
        // Second refactor - completely different files
        group("Read", [
          entry({ name: "Read", target: "lib/api/client.ts" }),
          entry({ name: "Read", target: "lib/api/types.ts" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "lib/api/client.ts" }),
          entry({ name: "Edit", target: "lib/api/types.ts" }),
          entry({ name: "Edit", target: "lib/api/index.ts" }),
        ]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(2);
    });

    it("computes toolCounts correctly", () => {
      const groups: ToolGroup[] = [
        group("Read", [
          entry({ name: "Read", target: "src/a.ts" }),
          entry({ name: "Read", target: "src/b.ts" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
        ]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].toolCounts).toEqual({ Read: 2, Edit: 1 });
    });

    it("infers label from filenames instead of full absolute paths", () => {
      const groups: ToolGroup[] = [
        group("Read", [
          entry({ name: "Read", target: "/Users/soh/project/src/components/Button.tsx" }),
          entry({ name: "Read", target: "/Users/soh/project/src/components/Modal.tsx" }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "/Users/soh/project/src/components/Button.tsx" }),
        ]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].label).toBe("Button.tsx, Modal.tsx");
    });

    it("sets status to running if any entry is running", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts", status: "running" })]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].status).toBe("running");
    });

    it("splits phases at assistant text boundaries", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
        // boundary at index 2
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
      ];

      const phases = groupIntoPhases(groups, [2]);
      expect(phases).toHaveLength(2);
      expect(phases[0].groups).toHaveLength(2);
      expect(phases[1].groups).toHaveLength(2);
    });

    it("infers label from thinking context when provided", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
      ];

      const phases = groupIntoPhases(groups, undefined, "Refactoring the validation logic to use zod schemas instead");
      expect(phases).toHaveLength(1);
      expect(phases[0].label).toBe("Refactoring the validation logic to use zod schemas instead");
    });

    it("infers label from first Grep pattern when no thinking context", () => {
      const groups: ToolGroup[] = [
        group("Grep", [entry({ name: "Grep", target: "VerdictBanner", toolInput: { pattern: "VerdictBanner" } })]),
        group("Read", [entry({ name: "Read", target: "src/VerdictBanner.tsx" })]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].label).toBe('Searched "VerdictBanner"');
    });

    it("falls back to tool count label when no context available", () => {
      // Use Bash entries with commands (no file_path) so no dominant directory
      // but ensure overlapping targets so they group together
      const groups: ToolGroup[] = [
        group("Bash", [
          entry({ name: "Bash", target: "echo hello", toolInput: { command: "echo hello" } }),
          entry({ name: "Bash", target: "echo world", toolInput: { command: "echo world" } }),
        ]),
        group("Bash", [entry({ name: "Bash", target: "echo done", toolInput: { command: "echo done" } })]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].label).toBe("3 tool calls");
    });

    it("does not wrap phases containing only error groups", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts", status: "error" })]),
        group("Edit", [entry({ name: "Edit", target: "src/b.ts", status: "error" })]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(0);
    });

    it("does not wrap phases containing only agent dispatch entries", () => {
      const groups: ToolGroup[] = [
        group("Task", [entry({ name: "Task", target: "do X" })]),
        group("Agent", [entry({ name: "Agent", target: "do Y" })]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(0);
    });

    // === Bug reproduction tests: phase splitting too aggressively ===

    it("keeps Edit -> Bash -> Edit in same phase when files overlap", () => {
      const groups: ToolGroup[] = [
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/b.ts" }),
        ]),
        group("Bash", [
          entry({ name: "Bash", target: "pnpm test", toolInput: { command: "pnpm test" } }),
          entry({ name: "Bash", target: "pnpm test", toolInput: { command: "pnpm test" } }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/c.ts" }),
        ]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].groups).toHaveLength(3);
    });

    it("keeps Edit -> Bash -> Write (new file, same dir) in same phase", () => {
      const groups: ToolGroup[] = [
        group("Edit", [
          entry({ name: "Edit", target: "src/components/Button.tsx" }),
          entry({ name: "Edit", target: "src/components/Modal.tsx" }),
        ]),
        group("Bash", [
          entry({ name: "Bash", target: "pnpm test", toolInput: { command: "pnpm test" } }),
        ]),
        group("Write", [
          entry({ name: "Write", target: "src/components/NewComponent.tsx" }),
        ]),
        group("Bash", [
          entry({ name: "Bash", target: "pnpm test", toolInput: { command: "pnpm test" } }),
        ]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
    });

    it("absorbs small 2-3 entry phases into adjacent phases when files overlap", () => {
      const groups: ToolGroup[] = [
        group("Read", [
          entry({ name: "Read", target: "src/a.ts" }),
          entry({ name: "Read", target: "src/b.ts" }),
        ]),
        // Small phase that should be absorbed
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
        ]),
        group("Bash", [
          entry({ name: "Bash", target: "test", toolInput: { command: "test" } }),
          entry({ name: "Bash", target: "test", toolInput: { command: "test" } }),
        ]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/b.ts" }),
          entry({ name: "Edit", target: "src/c.ts" }),
        ]),
      ];
      const phases = groupIntoPhases(groups);
      // Should all be 1 phase (overlapping files + same dir)
      expect(phases).toHaveLength(1);
    });

    it("truncates thinking context label to 60 chars", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
      ];

      const longContext = "This is a very long thinking context that exceeds sixty characters and should be truncated properly";
      const phases = groupIntoPhases(groups, undefined, longContext);
      expect(phases).toHaveLength(1);
      expect(phases[0].label.length).toBeLessThanOrEqual(63); // 60 + "..."
    });
  });
});
