import { describe, it, expect } from "vitest";
import { createSSELineParser } from "./parseSSELines";

describe("createSSELineParser", () => {
  it("parses a complete SSE line in a single chunk", () => {
    const parse = createSSELineParser();
    const results = parse('data: {"type":"stdout","text":"hello"}\n');
    expect(results).toEqual(["hello"]);
  });

  it("handles data split across two chunks (line boundary)", () => {
    const parse = createSSELineParser();
    // First chunk has partial line — no newline at end
    const r1 = parse('data: {"type":"stdout","te');
    expect(r1).toEqual([]);

    // Second chunk completes the line
    const r2 = parse('xt":"world"}\n');
    expect(r2).toEqual(["world"]);
  });

  it("handles multiple lines in a single chunk", () => {
    const parse = createSSELineParser();
    const results = parse(
      'data: {"type":"stdout","text":"a"}\ndata: {"type":"stderr","text":"b"}\n'
    );
    expect(results).toEqual(["a", "b"]);
  });

  it("ignores non-data lines", () => {
    const parse = createSSELineParser();
    const results = parse('event: message\ndata: {"type":"stdout","text":"ok"}\n');
    expect(results).toEqual(["ok"]);
  });

  it("ignores lines with invalid JSON", () => {
    const parse = createSSELineParser();
    const results = parse("data: not-json\ndata: {\"type\":\"stdout\",\"text\":\"ok\"}\n");
    expect(results).toEqual(["ok"]);
  });

  it("ignores data types other than stdout/stderr", () => {
    const parse = createSSELineParser();
    const results = parse('data: {"type":"status","text":"running"}\n');
    expect(results).toEqual([]);
  });

  it("preserves buffer across multiple chunks with trailing partial", () => {
    const parse = createSSELineParser();
    const r1 = parse('data: {"type":"stdout","text":"first"}\ndata: {"typ');
    expect(r1).toEqual(["first"]);

    const r2 = parse('e":"stdout","text":"second"}\n');
    expect(r2).toEqual(["second"]);
  });
});
