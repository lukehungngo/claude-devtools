import { describe, it, expect } from "vitest";
import { classifyToolCall, toolLabel } from "./toolClassification";

describe("classifyToolCall", () => {
  it.each([
    ["Task", "spawn"],
    ["Agent", "spawn"],
    ["dispatch_agent", "spawn"],
  ])("classifies %s as spawn", (name, expected) => {
    expect(classifyToolCall(name)).toBe(expected);
  });

  it.each([
    ["Edit", "state"],
    ["Write", "state"],
    ["MultiEdit", "state"],
    ["NotebookEdit", "state"],
    ["Bash", "state"],
    ["Delete", "state"],
  ])("classifies %s as state", (name, expected) => {
    expect(classifyToolCall(name)).toBe(expected);
  });

  it.each([
    ["Read", "routine"],
    ["Glob", "routine"],
    ["Grep", "routine"],
    ["LS", "routine"],
    ["BashOutput", "routine"],
    ["WebFetch", "routine"],
  ])("classifies %s as routine", (name, expected) => {
    expect(classifyToolCall(name)).toBe(expected);
  });

  it.each([
    ["TaskCreate", "accounting"],
    ["TaskUpdate", "accounting"],
    ["TaskList", "accounting"],
    ["TodoWrite", "accounting"],
  ])("classifies %s as accounting", (name, expected) => {
    expect(classifyToolCall(name)).toBe(expected);
  });

  it("defaults unknown tool names to routine (safe — visible via chip)", () => {
    expect(classifyToolCall("FrobnicateThing")).toBe("routine");
    expect(classifyToolCall("")).toBe("routine");
  });

  it("trims whitespace before matching", () => {
    expect(classifyToolCall("  Edit  ")).toBe("state");
  });

  it("is case-sensitive (does not match lowercased Task)", () => {
    // Claude Code emits canonical PascalCase. Lowercase = unknown = routine.
    expect(classifyToolCall("task")).toBe("routine");
  });
});

describe("toolLabel", () => {
  it("uses singular when count is 1", () => {
    expect(toolLabel("Read", 1)).toBe("read");
    expect(toolLabel("TaskUpdate", 1)).toBe("task update");
  });

  it("uses plural when count > 1", () => {
    expect(toolLabel("Read", 3)).toBe("reads");
    expect(toolLabel("TaskUpdate", 11)).toBe("task updates");
  });

  it("falls back to lowercased + 's' for unknown names (plural)", () => {
    expect(toolLabel("Frobnicate", 2)).toBe("frobnicates");
  });

  it("falls back to lowercased name for unknown names (singular)", () => {
    expect(toolLabel("Frobnicate", 1)).toBe("frobnicate");
  });
});
