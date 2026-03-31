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

    it("groups all consecutive non-agent tool groups into one phase", () => {
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
        group("Bash", [entry({ name: "Bash", target: "pnpm test", toolInput: { command: "pnpm test" } })]),
        group("Edit", [
          entry({ name: "Edit", target: "src/a.ts" }),
          entry({ name: "Edit", target: "src/c.ts" }),
        ]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].groups).toHaveLength(5);
    });

    it("does NOT wrap single-group phases", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
      ];
      expect(groupIntoPhases(groups)).toHaveLength(0);
    });

    it("splits at agent dispatch boundaries", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
        group("Task", [entry({ name: "Task", target: "do something" })]),
        group("Read", [entry({ name: "Read", target: "lib/x.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "lib/x.ts" })]),
      ];

      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(2);
      expect(phases[0].groups).toHaveLength(2);
      expect(phases[1].groups).toHaveLength(2);
      // Agent groups should not appear in any phase
      for (const phase of phases) {
        for (const g of phase.groups) {
          expect(g.name).not.toBe("Task");
        }
      }
    });

    it("excludes agent-only sequences", () => {
      const groups: ToolGroup[] = [
        group("Task", [entry({ name: "Task", target: "do X" })]),
        group("Agent", [entry({ name: "Agent", target: "do Y" })]),
      ];
      expect(groupIntoPhases(groups)).toHaveLength(0);
    });

    it("sets phase status to error if any entry has error", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts", status: "error" })]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].status).toBe("error");
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

    it("computes toolCounts correctly", () => {
      const groups: ToolGroup[] = [
        group("Read", [
          entry({ name: "Read", target: "src/a.ts" }),
          entry({ name: "Read", target: "src/b.ts" }),
        ]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].toolCounts).toEqual({ Read: 2, Edit: 1 });
    });

    it("infers label from thinking context", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
      ];
      const phases = groupIntoPhases(groups, undefined, "Refactoring the validation logic");
      expect(phases[0].label).toBe("Refactoring the validation logic");
    });

    it("infers label from first Grep pattern", () => {
      const groups: ToolGroup[] = [
        group("Grep", [entry({ name: "Grep", target: "VerdictBanner", toolInput: { pattern: "VerdictBanner" } })]),
        group("Read", [entry({ name: "Read", target: "src/VerdictBanner.tsx" })]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases[0].label).toBe('Searched "VerdictBanner"');
    });

    it("infers label from filenames", () => {
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
      expect(phases[0].label).toBe("Button.tsx, Modal.tsx");
    });

    it("falls back to tool count label", () => {
      const groups: ToolGroup[] = [
        group("Bash", [
          entry({ name: "Bash", target: "echo hello", toolInput: { command: "echo hello" } }),
          entry({ name: "Bash", target: "echo world", toolInput: { command: "echo world" } }),
        ]),
        group("Bash", [entry({ name: "Bash", target: "echo done", toolInput: { command: "echo done" } })]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases[0].label).toBe("3 tool calls");
    });

    it("truncates long thinking context to 60 chars", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
      ];
      const longContext = "This is a very long thinking context that exceeds sixty characters and should be truncated properly";
      const phases = groupIntoPhases(groups, undefined, longContext);
      expect(phases[0].label.length).toBeLessThanOrEqual(63); // 60 + "..."
    });

    it("groups 10 tool calls across mixed types into one phase", () => {
      // Grep → Read → Edit → Bash → Grep → Read → Edit = 1 phase
      const groups: ToolGroup[] = [
        group("Grep", [entry({ name: "Grep", target: "src/a.ts" })]),
        group("Read", [entry({ name: "Read", target: "src/a.ts" }), entry({ name: "Read", target: "src/b.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" }), entry({ name: "Edit", target: "src/b.ts" })]),
        group("Bash", [entry({ name: "Bash", target: "pnpm test", toolInput: { command: "pnpm test" } })]),
        group("Grep", [entry({ name: "Grep", target: "src/a.ts" })]),
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" }), entry({ name: "Edit", target: "src/c.ts" })]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(1);
      expect(phases[0].groups).toHaveLength(7);
    });

    it("handles multiple agent dispatches creating multiple phases", () => {
      const groups: ToolGroup[] = [
        group("Read", [entry({ name: "Read", target: "src/a.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/a.ts" })]),
        group("Agent", [entry({ name: "Agent", target: "review" })]),
        group("Read", [entry({ name: "Read", target: "src/b.ts" })]),
        group("Edit", [entry({ name: "Edit", target: "src/b.ts" })]),
        group("Task", [entry({ name: "Task", target: "test" })]),
        group("Bash", [entry({ name: "Bash", target: "pnpm test", toolInput: { command: "pnpm test" } })]),
        group("Edit", [entry({ name: "Edit", target: "src/c.ts" })]),
      ];
      const phases = groupIntoPhases(groups);
      expect(phases).toHaveLength(3);
    });
  });
});
