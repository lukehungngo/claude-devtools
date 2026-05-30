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

/**
 * NEW-7: live task state aggregated from the 4 SDKTask* SSE event types
 * (task_started, task_progress, task_updated, task_notification). The
 * dashboard merges this onto the daemon-snapshot rows in TasksTab so the
 * UI can surface running token/tool counters, paused/backgrounded state,
 * and the most recent tool name while the task is in flight.
 */
export interface LiveTaskState {
  task_id: string;
  tool_use_id?: string;
  status: "pending" | "running" | "completed" | "failed" | "killed" | "paused" | "stopped";
  description: string;
  subagent_type?: string;
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
  lastToolName?: string;
  summary?: string;
  isBackgrounded?: boolean;
}

/**
 * NEW-8: In-flight hook tracked from SDK hook_started → hook_response.
 * Field names mirror the SDK shape (sdk.d.ts:3080-3116) — snake_case is
 * the SDK contract, kept verbatim to make grep-trace one-step. `startedAt`
 * and `durationMs` are computed dashboard-side because the SDK does not
 * carry them on the lifecycle messages.
 */
export interface LiveHookState {
  hook_id: string;
  hook_name: string;
  hook_event: string;
  /** `Date.now()` captured when `hook_started` arrived. */
  startedAt: number;
  /** True once `hook_response` has been observed for this `hook_id`. */
  completed: boolean;
  /** Outcome from `hook_response.outcome` (sdk.d.ts:3103). */
  outcome?: "success" | "error" | "cancelled";
  /** Exit code from `hook_response.exit_code` when the SDK provides one. */
  exit_code?: number;
  /** Wall-clock duration in ms, computed at `hook_response` time. */
  durationMs?: number;
  /** Last `hook_progress.output` chunk observed (for tooltip preview). */
  lastOutput?: string;
}

/**
 * NEW-9: Single SDK auto-denial record (classifier / rule / mode / asyncAgent).
 * Shape mirrors SDKPermissionDeniedMessage minus transport-only fields (uuid,
 * session_id). The dashboard's AutoDenialBlock consumes this directly.
 *
 * See sdk.d.ts:3244-3268 (SDKPermissionDeniedMessage) and the server-side
 * SSEPermissionDeniedEvent (sse-event-handler.ts).
 */
export interface PermissionDeniedRecord {
  tool_name: string;
  tool_use_id: string;
  /** Subagent that triggered the denied tool call, when applicable. */
  agent_id?: string;
  /** Discriminator: 'classifier' | 'asyncAgent' | 'mode' | 'rule' (or unknown). */
  decision_reason_type?: string;
  /** Human-readable reason from the deciding component, when available. */
  decision_reason?: string;
  /** The rejection message returned to the model in the tool_result. */
  message: string;
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
  /**
   * NEW-7: live structured Task lifecycle state keyed by task_id.
   * Populated from task_started / task_progress / task_updated /
   * task_notification SSE events. TasksTab merges this onto daemon rows.
   */
  liveTasks: Map<string, LiveTaskState>;
  /**
   * NEW-8: In-flight (and recently-completed) hooks keyed by SDK `hook_id`.
   * Populated from `hook_started` / `hook_progress` / `hook_response` SSE
   * events. HooksTab merges these on top of completed JSONL attachments so
   * the user sees a spinner + elapsed time while hooks run.
   */
  liveHooks: Map<string, LiveHookState>;
  /**
   * NEW-9: SDKPermissionDeniedMessage auto-denials seen during this live
   * stream. Order matches arrival. Deduped by tool_use_id (first wins) —
   * the auto-denial is a one-shot signal per tool call; any repeat is a
   * transport-layer re-delivery, not a new denial.
   */
  permissionDenials: PermissionDeniedRecord[];
  /**
   * C2 (Phase B): true once the live turn has ended (server `result` or
   * `done`). The streaming preview keeps its content but stops showing the
   * "Working..." pulse, and ConversationView hides the duplicate preview so
   * only the WS-committed TurnCard remains. Cleared on reset (next submit).
   */
  finalized: boolean;
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
    liveTasks: new Map(),
    liveHooks: new Map(),
    permissionDenials: [],
    finalized: false,
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
