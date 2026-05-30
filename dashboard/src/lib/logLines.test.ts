import { describe, it, expect } from "vitest";
import { meaningfulLogLines, logLineText } from "./logLines";
import type { AgentLogEntry } from "./types";

const e = (i: number, content: string, contentPreview = content): AgentLogEntry => ({
  timestamp: `2026-05-29T00:00:0${i}Z`,
  eventType: "assistant",
  agentId: "main",
  contentPreview,
  content,
  uuid: `u${i}`,
});

describe("meaningfulLogLines", () => {
  it("returns ALL meaningful lines (no cap) in order", () => {
    const logs = [e(1, "a"), e(2, "b"), e(3, "c"), e(4, "d"), e(5, "e"), e(6, "f"), e(7, "g")];
    const out = meaningfulLogLines(logs);
    expect(out.length).toBe(7); // not capped at 5
    expect(out.map((l) => l.content)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("drops entries with no renderable content", () => {
    const logs = [e(1, "a"), e(2, "", ""), e(3, "  ", "  "), e(4, "b")];
    expect(meaningfulLogLines(logs).map((l) => l.content)).toEqual(["a", "b"]);
  });

  it("keeps an entry that has only a contentPreview (no full content)", () => {
    const logs = [e(1, "", "queue: enqueue")];
    expect(meaningfulLogLines(logs).length).toBe(1);
  });

  it("returns an empty array for empty input", () => {
    expect(meaningfulLogLines([])).toEqual([]);
  });
});

describe("logLineText", () => {
  it("prefers full content over the preview", () => {
    expect(logLineText(e(1, "FULL untruncated text", "FULL untrunc…"))).toBe("FULL untruncated text");
  });

  it("falls back to the preview when content is empty", () => {
    expect(logLineText(e(1, "", "queue: enqueue"))).toBe("queue: enqueue");
  });
});
