export type PromptType =
  | { type: "command"; command: string; args: string }
  | { type: "short_intent" }
  | { type: "task_list"; items: string[]; visibleCount: number }
  | { type: "intent_blob"; intent: string; blob: string; blobType: string; blobLines: number }
  | { type: "long_prose"; visibleLines: string[]; remainingLines: number };

const SHORT_LINE_LIMIT = 5;
const SHORT_CHAR_LIMIT = 500;
const TASK_LIST_MIN_ITEMS = 3;
const INTENT_MAX_CHARS = 100;
const BLOB_MIN_LINES = 5;
const VISIBLE_LINES_COUNT = 3;

export const TRIGGER_TOKENS = new Set(["<next>", "<continue>"]);

const LIST_ITEM_RE = /^(?:\d+\.\s+|- |\* )(.+)$/;

/**
 * Classify a user prompt into one of 5 types for collapse behavior.
 * First match wins in priority order.
 * O(1)-ish: scans lines once, no backtracking.
 */
export function classifyPrompt(text: string): PromptType {
  const trimmed = text.trim();

  // --- Priority 1: Command/trigger ---
  if (TRIGGER_TOKENS.has(trimmed)) {
    return { type: "command", command: trimmed, args: "" };
  }

  if (trimmed.startsWith("/")) {
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      return { type: "command", command: trimmed, args: "" };
    }
    return {
      type: "command",
      command: trimmed.slice(0, spaceIdx),
      args: trimmed.slice(spaceIdx + 1),
    };
  }

  if (trimmed.startsWith("!")) {
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      return { type: "command", command: trimmed, args: "" };
    }
    return {
      type: "command",
      command: trimmed.slice(0, spaceIdx),
      args: trimmed.slice(spaceIdx + 1),
    };
  }

  // --- Priority 2: Short intent ---
  const lines = trimmed.split("\n");
  if (lines.length <= SHORT_LINE_LIMIT && trimmed.length <= SHORT_CHAR_LIMIT) {
    return { type: "short_intent" };
  }

  // --- Priority 3: Task list ---
  const listItems: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = LIST_ITEM_RE.exec(lines[i].trim());
    if (match) {
      listItems.push(match[1]);
    }
  }
  if (listItems.length >= TASK_LIST_MIN_ITEMS) {
    return {
      type: "task_list",
      items: listItems,
      visibleCount: VISIBLE_LINES_COUNT,
    };
  }

  // --- Priority 4: Intent + blob ---
  // First line is the intent if it's short; remainder is the blob
  const firstLine = lines[0];
  if (firstLine.length <= INTENT_MAX_CHARS) {
    const remainderLines = lines.slice(1);
    // Filter empty lines at the boundary
    const blobStartIdx = remainderLines.findIndex((l) => l.trim().length > 0);
    if (blobStartIdx !== -1) {
      const blobLines = remainderLines.slice(blobStartIdx);
      if (blobLines.length >= BLOB_MIN_LINES) {
        const blob = blobLines.join("\n");
        return {
          type: "intent_blob",
          intent: firstLine,
          blob,
          blobType: detectBlobType(blob),
          blobLines: blobLines.length,
        };
      }
    }
  }

  // --- Priority 5: Long prose ---
  const visibleLines = lines.slice(0, VISIBLE_LINES_COUNT);
  const remainingLines = Math.max(0, lines.length - VISIBLE_LINES_COUNT);
  return {
    type: "long_prose",
    visibleLines,
    remainingLines,
  };
}

/**
 * Detect the type of a blob of text based on content heuristics.
 * Scans a sample of lines (first 20) for efficiency.
 */
export function detectBlobType(text: string): string {
  const trimmed = text.trim();

  // JSON: starts with { or [
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "JSON";
  }

  const sampleLines = trimmed.split("\n").slice(0, 20);
  let errorSignals = 0;
  let codeSignals = 0;
  let markupSignals = 0;

  for (const line of sampleLines) {
    // Error log signals — strong markers count double
    if (
      line.includes("Error:") ||
      line.includes("TypeError:") ||
      line.includes("Traceback")
    ) {
      errorSignals += 2;
    } else if (line.includes("at ")) {
      errorSignals++;
    }

    // Code signals
    if (
      line.includes("import ") ||
      line.includes("function ") ||
      line.includes("const ") ||
      line.trimEnd().endsWith("{") ||
      line.trimEnd().endsWith("}") ||
      (line.length > 0 && line.length - line.trimStart().length >= 4)
    ) {
      codeSignals++;
    }

    // Markup signals
    if (/<\w/.test(line) || /<\/\w/.test(line)) {
      markupSignals++;
    }
  }

  // Return the strongest signal (error > code > markup > none)
  if (errorSignals >= 2) return "error log";
  if (codeSignals >= 2) return "code";
  if (markupSignals >= 2) return "markup";

  return "";
}
