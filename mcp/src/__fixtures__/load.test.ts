import { describe, it, expect } from "vitest";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { fixturePath } from "./index.js";

describe("fixtures", () => {
  it("tiny has 1 event", () => {
    expect(parseJsonlFile(fixturePath("tiny"))).toHaveLength(1);
  });

  it("medium has 12 events", () => {
    expect(parseJsonlFile(fixturePath("medium"))).toHaveLength(12);
  });

  it("long has 16 events", () => {
    expect(parseJsonlFile(fixturePath("long"))).toHaveLength(16);
  });

  it("corrupt skips malformed lines (invariant #3)", () => {
    const evs = parseJsonlFile(fixturePath("corrupt"));
    // 14 total lines, 2 corrupted = 12 valid events
    expect(evs.length).toBeGreaterThan(8);
    expect(evs.length).toBeLessThan(14);
  });

  it("unfinished has no end_turn stop_reason", () => {
    const evs = parseJsonlFile(fixturePath("unfinished"));
    const hasEndTurn = evs.some(
      (e) => e.type === "assistant" && e.message.stop_reason === "end_turn",
    );
    expect(hasEndTurn).toBe(false);
  });
});
