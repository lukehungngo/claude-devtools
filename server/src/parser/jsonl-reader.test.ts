import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseJsonlFile, parseJsonlIncremental } from "./jsonl-reader.js";

const TEST_DIR = "/tmp/vitest-jsonl-reader-test";

beforeEach(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("parseJsonlFile", () => {
  it("returns empty array for non-existent file", () => {
    const result = parseJsonlFile("/tmp/nonexistent-file-12345.jsonl");
    expect(result).toEqual([]);
  });

  it("parses valid JSONL lines into SessionEvent array", () => {
    const filePath = join(TEST_DIR, "valid.jsonl");
    const event1 = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    };
    const event2 = {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-03-23T10:00:01Z",
      sessionId: "s1",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "hi" }],
        model: "claude-sonnet-4-6",
        id: "msg-1",
        type: "message",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    writeFileSync(
      filePath,
      JSON.stringify(event1) + "\n" + JSON.stringify(event2) + "\n"
    );

    const result = parseJsonlFile(filePath);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("user");
    expect(result[1].type).toBe("assistant");
  });

  it("skips malformed lines gracefully", () => {
    const filePath = join(TEST_DIR, "malformed.jsonl");
    const validEvent = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [{ type: "text", text: "hello" }] },
    };
    writeFileSync(
      filePath,
      JSON.stringify(validEvent) + "\n" + "this is not json\n" + "{invalid json\n"
    );

    const result = parseJsonlFile(filePath);

    // Should only return the valid event, not crash
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe("u1");
  });

  it("skips empty lines", () => {
    const filePath = join(TEST_DIR, "empty-lines.jsonl");
    const validEvent = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };
    writeFileSync(
      filePath,
      "\n\n" + JSON.stringify(validEvent) + "\n\n\n"
    );

    const result = parseJsonlFile(filePath);

    expect(result).toHaveLength(1);
  });

  it("returns empty array for empty file", () => {
    const filePath = join(TEST_DIR, "empty.jsonl");
    writeFileSync(filePath, "");

    const result = parseJsonlFile(filePath);

    expect(result).toEqual([]);
  });
});

describe("parseJsonlIncremental", () => {
  it("returns events only after given byte offset", () => {
    const filePath = join(TEST_DIR, "incremental.jsonl");
    const event1 = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };
    const event2 = {
      type: "assistant",
      uuid: "a1",
      timestamp: "2026-03-23T10:00:01Z",
      sessionId: "s1",
      message: {
        role: "assistant",
        content: [],
        model: "claude-sonnet-4-6",
        id: "msg-1",
        type: "message",
        stop_reason: "end_turn",
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
    const line1 = JSON.stringify(event1) + "\n";
    const line2 = JSON.stringify(event2) + "\n";
    writeFileSync(filePath, line1 + line2);

    // Read from offset after first line
    const result = parseJsonlIncremental(filePath, line1.length);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].uuid).toBe("a1");
  });

  it("returns correct newOffset (full content length)", () => {
    const filePath = join(TEST_DIR, "offset.jsonl");
    const event = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };
    const content = JSON.stringify(event) + "\n";
    writeFileSync(filePath, content);

    const result = parseJsonlIncremental(filePath, 0);

    expect(result.newOffset).toBe(content.length);
  });

  it("returns empty events and same offset for non-existent file", () => {
    const result = parseJsonlIncremental(
      "/tmp/nonexistent-12345.jsonl",
      100
    );

    expect(result.events).toEqual([]);
    expect(result.newOffset).toBe(100);
  });

  it("reads only bytes after fromOffset, not the entire file", () => {
    const filePath = join(TEST_DIR, "incremental-targeted.jsonl");
    const event1 = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };
    const event2 = {
      type: "user",
      uuid: "u2",
      timestamp: "2026-03-23T10:00:01Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };
    const event3 = {
      type: "user",
      uuid: "u3",
      timestamp: "2026-03-23T10:00:02Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };

    // Write initial two events
    const line1 = JSON.stringify(event1) + "\n";
    const line2 = JSON.stringify(event2) + "\n";
    writeFileSync(filePath, line1 + line2);

    // Parse from start to get initial offset
    const first = parseJsonlIncremental(filePath, 0);
    expect(first.events).toHaveLength(2);
    const offsetAfterFirst = first.newOffset;

    // Append a third event
    const { appendFileSync } = require("node:fs");
    const line3 = JSON.stringify(event3) + "\n";
    appendFileSync(filePath, line3);

    // Parse incrementally from the previous offset
    const second = parseJsonlIncremental(filePath, offsetAfterFirst);

    // Should only contain the new event
    expect(second.events).toHaveLength(1);
    expect(second.events[0].uuid).toBe("u3");

    // New offset should be the full file size in bytes
    const { statSync } = require("node:fs");
    const fileSize = statSync(filePath).size;
    expect(second.newOffset).toBe(fileSize);
  });

  it("returns byte-based offset, not character-based", () => {
    const filePath = join(TEST_DIR, "multibyte.jsonl");
    // Use multi-byte UTF-8 characters to verify byte vs char offset
    const event = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [{ type: "text", text: "hello \u00e9\u00e8\u00ea" }] },
    };
    const line = JSON.stringify(event) + "\n";
    writeFileSync(filePath, line);

    const result = parseJsonlIncremental(filePath, 0);

    // Byte length differs from character length for multi-byte chars
    const byteLength = Buffer.byteLength(line, "utf-8");
    expect(result.newOffset).toBe(byteLength);
    expect(result.events).toHaveLength(1);
  });

  it("returns all events when offset is 0", () => {
    const filePath = join(TEST_DIR, "all.jsonl");
    const event1 = {
      type: "user",
      uuid: "u1",
      timestamp: "2026-03-23T10:00:00Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };
    const event2 = {
      type: "user",
      uuid: "u2",
      timestamp: "2026-03-23T10:00:01Z",
      sessionId: "s1",
      userType: "external",
      message: { role: "user", content: [] },
    };
    writeFileSync(
      filePath,
      JSON.stringify(event1) + "\n" + JSON.stringify(event2) + "\n"
    );

    const result = parseJsonlIncremental(filePath, 0);

    expect(result.events).toHaveLength(2);
  });
});
