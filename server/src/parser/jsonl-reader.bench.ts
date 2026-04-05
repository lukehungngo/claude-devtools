import { bench, describe, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseJsonlFile, parseJsonlIncremental } from "./jsonl-reader.js";

function generateLine(index: number, sessionId: string): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `uuid-${sessionId}-${index}`,
    timestamp: new Date(Date.now() + index * 1000).toISOString(),
    sessionId,
    message: `Event number ${index} with some padding to make the line realistic in size for benchmarking purposes`,
  });
}

function generateJsonlFile(path: string, lineCount: number, sessionId: string): void {
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(generateLine(i, sessionId));
  }
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

/**
 * Find the byte offset of the last newline before `approxOffset` so that
 * incremental reads always start on a clean line boundary.
 */
function alignToNewline(filePath: string, approxOffset: number): number {
  const fd = openSync(filePath, "r");
  try {
    // Read a small window ending at approxOffset to find the preceding newline.
    const window = Math.min(approxOffset, 4096);
    const buf = Buffer.alloc(window);
    readSync(fd, buf, 0, window, approxOffset - window);
    const str = buf.toString("utf-8");
    const lastNl = str.lastIndexOf("\n");
    if (lastNl === -1) return 0;
    return approxOffset - window + lastNl + 1; // byte after the newline
  } finally {
    closeSync(fd);
  }
}

const smallFile = join(tmpdir(), "bench-jsonl-small.jsonl");
const mediumFile = join(tmpdir(), "bench-jsonl-medium.jsonl");
const largeFile = join(tmpdir(), "bench-jsonl-large.jsonl");

let mediumOffset = 0;
let largeOffset = 0;

beforeAll(() => {
  generateJsonlFile(smallFile, 500, "session-small");
  generateJsonlFile(mediumFile, 5000, "session-medium");
  generateJsonlFile(largeFile, 25000, "session-large");

  mediumOffset = alignToNewline(mediumFile, Math.floor(statSync(mediumFile).size * 0.9));
  largeOffset = alignToNewline(largeFile, Math.floor(statSync(largeFile).size * 0.9));
});

afterAll(() => {
  unlinkSync(smallFile);
  unlinkSync(mediumFile);
  unlinkSync(largeFile);
});

describe("parseJsonlFile", () => {
  bench("small (500 lines ~100KB)", () => {
    parseJsonlFile(smallFile);
  });

  bench("medium (5000 lines ~1MB)", () => {
    parseJsonlFile(mediumFile);
  });

  bench("large (25000 lines ~5MB)", () => {
    parseJsonlFile(largeFile);
  });
});

describe("parseJsonlIncremental", () => {
  bench("medium — last 10% offset", () => {
    parseJsonlIncremental(mediumFile, mediumOffset);
  });

  bench("large — last 10% offset", () => {
    parseJsonlIncremental(largeFile, largeOffset);
  });
});
