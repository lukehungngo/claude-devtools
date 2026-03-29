/**
 * Types for SSE streaming events from the server.
 * These mirror the server-side SSEEvent types.
 */

export interface StreamingToolEntry {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  inputJson: string;
  status: "running" | "success" | "error";
  resultContent?: unknown;
  resultIsError?: boolean;
  startedAt: number;
  completedAt?: number;
}

export interface StreamingThinkingEntry {
  text: string;
  isComplete: boolean;
}

export interface CompactMetadata {
  trigger: string;
  preTokens: number;
}

export interface StreamingState {
  tools: Map<string, StreamingToolEntry>;
  /** Ordered list of tool IDs (insertion order) */
  toolOrder: string[];
  thinking: StreamingThinkingEntry;
  /** ID of the tool currently receiving input_json_delta events */
  activeToolId: string | null;
  status: string | null;
  isCompacting: boolean;
  /** Metadata from the last compact event, cleared after display timeout */
  compactResult: CompactMetadata | null;
}

export function createInitialStreamingState(): StreamingState {
  return {
    tools: new Map(),
    toolOrder: [],
    thinking: { text: "", isComplete: false },
    activeToolId: null,
    status: null,
    isCompacting: false,
    compactResult: null,
  };
}

/** Extracts a human-readable target from tool input (file path, command, etc.) */
export function extractToolTarget(name: string, input?: Record<string, unknown>): string {
  if (!input) return "";
  const target =
    (input.file_path as string) ||
    (input.path as string) ||
    (input.command as string) ||
    (input.pattern as string) ||
    "";
  return typeof target === "string" ? target.slice(0, 80) : "";
}
