import { describe, it, expect } from "vitest";
import { normalizeContent } from "./normalizeContent";

describe("normalizeContent", () => {
  it("returns empty array for undefined", () => {
    expect(normalizeContent(undefined)).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(normalizeContent(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(normalizeContent("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(normalizeContent("   ")).toEqual([]);
  });

  it("wraps a non-empty string into a TextContent array", () => {
    expect(normalizeContent("hello world")).toEqual([
      { type: "text", text: "hello world" },
    ]);
  });

  it("passes through an array of ContentItems unchanged", () => {
    const items = [
      { type: "text" as const, text: "hello" },
      { type: "tool_use" as const, id: "t1", name: "Read", input: {} },
    ];
    expect(normalizeContent(items)).toBe(items);
  });

  it("returns empty array for non-array non-string values", () => {
    // edge case: something unexpected
    expect(normalizeContent(42 as unknown as string)).toEqual([]);
  });
});
