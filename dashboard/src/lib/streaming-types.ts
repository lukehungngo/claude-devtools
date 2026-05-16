/**
 * Types for SSE streaming events from the server.
 * These mirror the server-side SSEEvent types.
 */

import type { SDKStatus } from "@anthropic-ai/claude-agent-sdk";

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
 * Trigger union narrowed to the SDK strict shape (sdk.d.ts:2525):
 *   `'manual' | 'auto'`. R-5 (PhaseR3D) removed the open `string` escape
 *   hatch — "reactive"/"rewind" were defensive but never emitted.
 */
export interface CompactMetadata {
  /** Authoritative SDK union — see sdk.d.ts:2525. */
  trigger: "auto" | "manual";
  preTokens: number;
  /** Tokens after compaction (compression ratio). */
  postTokens?: number;
  /** Wall-clock duration of the compaction call, ms. */
  durationMs?: number;
  /**
   * Attribution to a PreCompact hook (CC v2.1.143, P2-9). Set when the server
   * matched a recent hook_success / hook_cancelled attachment with
   * `hookEvent === "PreCompact"` to this compact_boundary.
   * `cancelled === true` means the hook BLOCKED compaction — render the
   * blocked banner instead of the green compacted banner.
   */
  attributedTo?: {
    hookName: string;
    cancelled?: boolean;
    reason?: string;
  };
}

export interface StreamingState {
  tools: Map<string, StreamingToolEntry>;
  /** Ordered list of tool IDs (insertion order) */
  toolOrder: string[];
  thinking: StreamingThinkingEntry;
  /** ID of the tool currently receiving input_json_delta events */
  activeToolId: string | null;
  /** Authoritative SDK status union — see sdk.d.ts:3455. */
  status: SDKStatus;
  isCompacting: boolean;
  /** Metadata from the last compact event, cleared after display timeout */
  compactResult: CompactMetadata | null;
  /** SDK session state from session_state_changed event — see sdk.d.ts:3429-3433. */
  sessionState: "idle" | "running" | "requires_action" | null;
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
