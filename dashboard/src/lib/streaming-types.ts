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

/**
 * Compaction metadata observed in CC v2.1.143 JSONLs and SSE.
 * Trigger taxonomy (CC CHANGELOG): "auto" | "manual" | "reactive" | "rewind".
 * Keep as `string` so newer CC versions don't crash the dashboard.
 */
export interface CompactMetadata {
  trigger: string;
  preTokens: number;
  /** Tokens after compaction (compression ratio). */
  postTokens?: number;
  /** Wall-clock duration of the compaction call, ms. */
  durationMs?: number;
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
  /** SDK session state from session_state_changed event ("idle" | "running" | "requires_action" | null) */
  sessionState: string | null;
  /** Accumulated response text from stdout events */
  responseText: string;
  /** Authoritative context window from SDK result.modelUsage (set once on result event) */
  sdkContextWindow: number | null;
  /**
   * OpenTelemetry-style stop_reason from the most recent result event
   * (CC v2.1.143, P2-5). Null until the first result arrives.
   */
  lastResultStopReason: string | null;
  /**
   * OpenTelemetry-style gen_ai.response.finish_reasons from the most recent
   * result event (CC v2.1.143, P2-5). Null until the first result arrives.
   */
  lastResultFinishReasons: readonly string[] | null;
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
    sessionState: null,
    responseText: "",
    sdkContextWindow: null,
    lastResultStopReason: null,
    lastResultFinishReasons: null,
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
