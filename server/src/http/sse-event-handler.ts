/**
 * SSE event mapping — converts SDK messages to SSE-serializable event objects.
 * Extracted from routes.ts for testability.
 */

import type {
  SDKCompactBoundaryMessage,
  SDKSessionStateChangedMessage,
  SDKStatus,
} from "@anthropic-ai/claude-agent-sdk";

/** SSE event types sent to the dashboard */
export interface SSETextEvent {
  type: "stdout";
  text: string;
}

export interface SSEThinkingEvent {
  type: "thinking";
  text: string;
}

export interface SSEToolStartEvent {
  type: "tool_start";
  id: string;
  name: string;
  input?: Record<string, unknown>;
}

export interface SSEToolDeltaEvent {
  type: "tool_delta";
  partial_json: string;
}

export interface SSEToolEndEvent {
  type: "tool_end";
  index: number;
}

export interface SSEToolResultEvent {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

export interface SSEToolProgressEvent {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  elapsed_time_seconds: number;
}

export interface SSEStatusEvent {
  type: "status";
  /** Authoritative SDK status union — see sdk.d.ts:3455. */
  status: SDKStatus;
}

/**
 * Compaction trigger — narrow SDK union (sdk.d.ts:2525).
 * Equivalent to `'manual' | 'auto'`. R-5 (PhaseR3D) narrowed this from the
 * defensive open union; "reactive"/"rewind" were never emitted in practice.
 */
export type CompactTrigger = SDKCompactBoundaryMessage["compact_metadata"]["trigger"];

export interface SSECompactEvent {
  type: "compact";
  metadata: {
    trigger: CompactTrigger;
    /** Tokens before compaction. */
    preTokens: number;
    /** Tokens after compaction (i.e. summary size). Undefined on older SDK shapes. */
    postTokens?: number;
    /** Wall-clock duration of the compaction call, ms. */
    durationMs?: number;
    /** Tools the model knew about pre-compaction; lost after. */
    preCompactDiscoveredTools?: string[];
    /**
     * Attribution to a PreCompact or PostCompact hook that fired around this
     * compact event (CC v2.1.143, P2-9; PostCompact added in R-2). Populated
     * when a hook_success or hook_cancelled attachment with
     * `hookEvent === "PreCompact"` or `hookEvent === "PostCompact"` arrived
     * in the SDK stream within the last `PRE_COMPACT_BUFFER_DEFAULT_TTL_MS`.
     * `cancelled === true` means the hook blocked the compaction (exit 2 or
     * returned `{decision: "block"}`); the UI then renders a "blocked by
     * hook" banner instead of the usual compacted banner.
     */
    attributedTo?: {
      hookName: string;
      cancelled?: boolean;
      reason?: string;
    };
  };
}

export interface SSEResultEvent {
  type: "result";
  is_error: boolean;
  subtype?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  result?: string;
  errors?: string[];
  /** Per-model usage breakdown from SDK (authoritative cost data) */
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
    contextWindow: number;
    maxOutputTokens: number;
  }>;
  /**
   * OpenTelemetry-style fields added by CC v2.1.143 (CHANGELOG line 467).
   * `stop_reason` mirrors the model's terminal reason ("end_turn", "tool_use", ...).
   * `finish_reasons` mirrors `gen_ai.response.finish_reasons` from the OTel LLM span.
   * The `user_system_prompt` field is gated behind `OTEL_LOG_USER_PROMPTS` and is
   * intentionally not forwarded for privacy.
   */
  stop_reason?: string;
  finish_reasons?: string[];
}

export interface SSEErrorEvent {
  type: "error";
  message: string;
}

export interface SSEToolSummaryEvent {
  type: "tool_summary";
  tool_use_id: string;
  tool_name: string;
  summary: string;
}

export interface SSEInitEvent {
  type: "init";
  tools: unknown;
  model: string;
  cwd?: string;
}

export interface SSERateLimitEvent {
  type: "rate_limit";
  retry_after_seconds: number;
  message?: string;
}

export interface SSETaskStartedEvent {
  type: "task_started";
  taskId: string;
  description?: string;
}

export interface SSETaskProgressEvent {
  type: "task_progress";
  taskId: string;
  progress?: number;
}

export interface SSETaskNotificationEvent {
  type: "task_notification";
  taskId: string;
  message?: string;
}

export interface SSEHookStartedEvent {
  type: "hook_started";
  hookName: string;
  hookId: string;
}

export interface SSEHookProgressEvent {
  type: "hook_progress";
  hookId: string;
  output?: string;
}

export interface SSEHookResponseEvent {
  type: "hook_response";
  hookId: string;
  exitCode?: number;
}

export interface SSEPromptSuggestionEvent {
  type: "prompt_suggestion";
  suggestions: string[];
}

export interface SSECommandOutputEvent {
  type: "command_output";
  command: string;
  output?: string;
  exitCode?: number;
}

export interface SSESessionStateChangedEvent {
  type: "session_state_changed";
  /** Authoritative SDK union — see sdk.d.ts:3429-3433. */
  state: SDKSessionStateChangedMessage["state"];
}

export interface SSEAuthStatusEvent {
  type: "auth_status";
  isAuthenticating: boolean;
  error?: string;
}

export interface SSEApiRetryEvent {
  type: "api_retry";
  attempt: number;
  maxRetries: number;
  retryDelayMs: number;
  errorStatus?: number;
}

/**
 * NEW-9: SDK auto-denied a tool call (classifier / rule / mode / asyncAgent).
 * Distinct from PermissionBlock which renders the interactive ask path; this
 * one is fire-and-forget — the model already received the rejection message
 * in the tool_result. See sdk.d.ts:3244-3268 (SDKPermissionDeniedMessage).
 */
export interface SSEPermissionDeniedEvent {
  type: "permission_denied";
  tool_name: string;
  tool_use_id: string;
  /** Subagent that triggered the denied tool call, when applicable. */
  agent_id?: string;
  /** Discriminator from PermissionDecisionReason: 'classifier' | 'asyncAgent' | 'mode' | 'rule'. */
  decision_reason_type?: string;
  /** Human-readable reason from the deciding component, when available. */
  decision_reason?: string;
  /** The rejection message returned to the model in the tool_result. */
  message: string;
}

export type SSEEvent =
  | SSETextEvent
  | SSEThinkingEvent
  | SSEToolStartEvent
  | SSEToolDeltaEvent
  | SSEToolEndEvent
  | SSEToolResultEvent
  | SSEToolProgressEvent
  | SSEStatusEvent
  | SSECompactEvent
  | SSEResultEvent
  | SSEErrorEvent
  | SSEToolSummaryEvent
  | SSEInitEvent
  | SSERateLimitEvent
  | SSETaskStartedEvent
  | SSETaskProgressEvent
  | SSETaskNotificationEvent
  | SSEHookStartedEvent
  | SSEHookProgressEvent
  | SSEHookResponseEvent
  | SSEPromptSuggestionEvent
  | SSECommandOutputEvent
  | SSESessionStateChangedEvent
  | SSEAuthStatusEvent
  | SSEApiRetryEvent
  | SSEPermissionDeniedEvent;

/**
 * Default time-to-live for buffered PreCompact/PostCompact hook attachments,
 * in ms. Any compact-hook entry older than this is treated as unrelated to a
 * later compact_boundary and silently dropped from attribution lookups.
 */
export const PRE_COMPACT_BUFFER_DEFAULT_TTL_MS = 60_000;

const PRE_COMPACT_BUFFER_MAX = 32;

interface PreCompactBufferEntry {
  kind: "success" | "cancelled";
  hookName: string;
  reason?: string;
  ts: number;
}

let preCompactBuffer: PreCompactBufferEntry[] = [];
let preCompactBufferTtlMs = PRE_COMPACT_BUFFER_DEFAULT_TTL_MS;

function pushPreCompactEntry(entry: PreCompactBufferEntry): void {
  const cutoff = entry.ts - preCompactBufferTtlMs;
  preCompactBuffer = preCompactBuffer.filter((e) => e.ts >= cutoff);
  preCompactBuffer.push(entry);
  if (preCompactBuffer.length > PRE_COMPACT_BUFFER_MAX) {
    preCompactBuffer.splice(0, preCompactBuffer.length - PRE_COMPACT_BUFFER_MAX);
  }
}

/**
 * Consume the most recent PreCompact/PostCompact entry still inside the TTL
 * window. Returns `undefined` when no in-window entry exists. The entry is
 * removed from the buffer so back-to-back compact_boundary events do not
 * both attribute to the same hook.
 */
function consumeRecentPreCompactEntry(now: number): PreCompactBufferEntry | undefined {
  const cutoff = now - preCompactBufferTtlMs;
  for (let i = preCompactBuffer.length - 1; i >= 0; i -= 1) {
    const entry = preCompactBuffer[i];
    if (entry.ts >= cutoff) {
      preCompactBuffer.splice(i, 1);
      return entry;
    }
  }
  // Trim everything stale while we're here.
  preCompactBuffer = preCompactBuffer.filter((e) => e.ts >= cutoff);
  return undefined;
}

/** Test-only: clear the compact-hook buffer between tests. */
export function __resetPreCompactBufferForTest(): void {
  preCompactBuffer = [];
}

/** Test-only: override the TTL window (use 0 to make every entry stale). */
export function __setPreCompactBufferTtlForTest(ms: number): void {
  preCompactBufferTtlMs = ms;
}

/**
 * Maps an SDK message to zero or more SSE events.
 * Returns an array because a single SDK message (e.g. assistant with multiple content blocks)
 * can produce multiple SSE events.
 */
export function mapSdkMessageToSSEEvents(msg: {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  event?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message?: any;
  is_error?: boolean;
  subtype?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}): SSEEvent[] {
  const events: SSEEvent[] = [];

  if (msg.type === "stream_event") {
    const event = msg.event;
    if (!event) return events;

    // content_block_delta events
    if (event.type === "content_block_delta" && event.delta) {
      if (event.delta.type === "text_delta" && event.delta.text) {
        events.push({ type: "stdout", text: event.delta.text });
      }
      if (event.delta.type === "thinking_delta" && event.delta.thinking) {
        events.push({ type: "thinking", text: event.delta.thinking });
      }
      if (event.delta.type === "input_json_delta" && event.delta.partial_json) {
        events.push({ type: "tool_delta", partial_json: event.delta.partial_json });
      }
    }

    // content_block_start — tool_use blocks
    if (event.type === "content_block_start" && event.content_block) {
      if (event.content_block.type === "tool_use") {
        events.push({
          type: "tool_start",
          id: event.content_block.id,
          name: event.content_block.name,
          input: event.content_block.input as Record<string, unknown> | undefined,
        });
      }
    }

    // content_block_stop
    if (event.type === "content_block_stop") {
      events.push({ type: "tool_end", index: event.index ?? 0 });
    }
  }

  // Assistant message (complete) — extract text blocks and error field.
  //
  // R-1 / Phase R3B: SDKAssistantMessage.parent_tool_use_id, .subagent_type,
  // and .task_description (sdk.d.ts:2493/:2501/:2505) flow through to the
  // typed AssistantEvent we broadcast on WebSocket via the
  // `as unknown as SessionEvent` cast in session-routes.ts (currently around
  // line 648 — `broadcast(state, buildNewEventsMessage(...))`). The top-level
  // fields land on the broadcasted event verbatim because the cast preserves
  // unknown keys. This mapper produces only stripped SSEEvent variants
  // (stdout, thinking, etc.) that intentionally do NOT carry these fields —
  // the dashboard reads them from the WS new-events broadcast instead.
  if (msg.type === "assistant" && msg.message?.content) {
    const content = msg.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text" && block.text) {
          events.push({ type: "stdout", text: block.text });
        }
      }
    }
    // SDK assistant messages can include an error field (rate_limit, billing_error, etc.)
    if (msg.message.error) {
      events.push({ type: "error", message: `Assistant error: ${msg.message.error}` });
    }
  }

  // User message — extract tool_result blocks
  if (msg.type === "user" && msg.message?.content) {
    const content = msg.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result") {
          events.push({
            type: "tool_result",
            tool_use_id: block.tool_use_id,
            content: block.content,
            is_error: block.is_error,
          });
        }
      }
    }
  }

  // Tool progress
  if (msg.type === "tool_progress") {
    events.push({
      type: "tool_progress",
      tool_use_id: msg.tool_use_id,
      tool_name: msg.tool_name,
      elapsed_time_seconds: msg.elapsed_time_seconds,
    });
  }

  // System status
  if (msg.type === "system" && msg.subtype === "status") {
    events.push({ type: "status", status: msg.status });
  }

  // Compact boundary — real CC v2.1.143 JSONLs use `compactMetadata` (camelCase);
  // legacy SDK shapes may use snake_case. Accept either and surface the full
  // metadata set (trigger, preTokens, postTokens, durationMs, discovered tools).
  if (msg.type === "system" && msg.subtype === "compact_boundary") {
    const rawMeta =
      (msg as { compactMetadata?: Record<string, unknown> }).compactMetadata ??
      (msg as { compact_metadata?: Record<string, unknown> }).compact_metadata ??
      {};
    const attribution = consumeRecentPreCompactEntry(Date.now());
    const metadata: SSECompactEvent["metadata"] = {
      // Narrow union per SDK (sdk.d.ts:2525). Default to "auto" for any
      // unknown/missing value rather than widening the SSE type.
      trigger: rawMeta.trigger === "manual" ? "manual" : "auto",
      preTokens: ((rawMeta.preTokens ?? rawMeta.pre_tokens) as number) ?? 0,
      postTokens: (rawMeta.postTokens ?? rawMeta.post_tokens) as number | undefined,
      durationMs: (rawMeta.durationMs ?? rawMeta.duration_ms) as number | undefined,
      preCompactDiscoveredTools:
        (rawMeta.preCompactDiscoveredTools ?? rawMeta.pre_compact_discovered_tools) as
          | string[]
          | undefined,
    };
    if (attribution) {
      metadata.attributedTo = {
        hookName: attribution.hookName,
        ...(attribution.kind === "cancelled" ? { cancelled: true } : {}),
        ...(attribution.reason != null ? { reason: attribution.reason } : {}),
      };
    }
    events.push({ type: "compact", metadata });
  }

  // Attachment messages carry hook results, skill listings, queued commands, etc.
  // We do NOT emit SSE for them — HooksTab reads attachments straight from JSONL.
  // The one side-effect: track PreCompact/PostCompact hook attachments so the
  // next compact_boundary can be attributed to the hook that fired around it.
  if (msg.type === "attachment" && msg.attachment) {
    const inner = msg.attachment as { type?: string; [key: string]: unknown };
    const isCompactHook =
      inner.hookEvent === "PreCompact" || inner.hookEvent === "PostCompact";
    if (inner.type === "hook_success" && isCompactHook) {
      const hookName = typeof inner.hookName === "string" ? inner.hookName : "";
      if (hookName) {
        pushPreCompactEntry({ kind: "success", hookName, ts: Date.now() });
      }
    } else if (inner.type === "hook_cancelled" && isCompactHook) {
      const hookName = typeof inner.hookName === "string" ? inner.hookName : "<unknown>";
      const reason = typeof inner.reason === "string" ? inner.reason : undefined;
      pushPreCompactEntry({ kind: "cancelled", hookName, reason, ts: Date.now() });
    }
  }

  // System init
  if (msg.type === "system" && msg.subtype === "init") {
    events.push({
      type: "init",
      tools: msg.tools,
      model: msg.model,
      cwd: msg.cwd,
    });
  }

  // System task events
  if (msg.type === "system" && msg.subtype === "task_started") {
    events.push({ type: "task_started", taskId: msg.taskId, description: msg.description });
  }
  if (msg.type === "system" && msg.subtype === "task_progress") {
    events.push({ type: "task_progress", taskId: msg.taskId, progress: msg.progress });
  }
  if (msg.type === "system" && msg.subtype === "task_notification") {
    events.push({ type: "task_notification", taskId: msg.taskId, message: msg.message });
  }

  // Session state changed (official SDK signal for running/idle/requires_action)
  if (msg.type === "system" && msg.subtype === "session_state_changed") {
    events.push({ type: "session_state_changed", state: msg.state });
  }

  // Auth status (SDK auth flow visibility)
  if (msg.type === "auth_status") {
    events.push({
      type: "auth_status",
      isAuthenticating: !!msg.isAuthenticating,
      error: msg.error,
    });
  }

  // API retry (SDK retry progress during rate limiting / transient errors)
  if (msg.type === "system" && msg.subtype === "api_retry") {
    events.push({
      type: "api_retry",
      attempt: msg.attempt ?? 0,
      maxRetries: msg.max_retries ?? 0,
      retryDelayMs: msg.retry_delay_ms ?? 0,
      errorStatus: msg.error_status ?? undefined,
    });
  }

  // System hook events
  if (msg.type === "system" && msg.subtype === "hook_started") {
    events.push({ type: "hook_started", hookName: msg.hookName, hookId: msg.hookId });
  }
  if (msg.type === "system" && msg.subtype === "hook_progress") {
    events.push({ type: "hook_progress", hookId: msg.hookId, output: msg.output });
  }
  if (msg.type === "system" && msg.subtype === "hook_response") {
    events.push({ type: "hook_response", hookId: msg.hookId, exitCode: msg.exitCode });
  }

  // NEW-9: SDKPermissionDeniedMessage — auto-denials (classifier / rule /
  // mode / asyncAgent) emit a system permission_denied message that the
  // dashboard's AutoDenialBlock renders distinctly from PermissionBlock
  // (which is for the interactive ask path).
  if (msg.type === "system" && msg.subtype === "permission_denied") {
    events.push({
      type: "permission_denied",
      tool_name: msg.tool_name,
      tool_use_id: msg.tool_use_id,
      agent_id: msg.agent_id,
      decision_reason_type: msg.decision_reason_type,
      decision_reason: msg.decision_reason,
      message: msg.message,
    });
  }

  // Tool use summary
  if (msg.type === "tool_use_summary") {
    events.push({
      type: "tool_summary",
      tool_use_id: msg.tool_use_id,
      tool_name: msg.tool_name,
      summary: msg.summary,
    });
  }

  // Rate limit event
  if (msg.type === "rate_limit_event") {
    events.push({
      type: "rate_limit",
      retry_after_seconds: msg.retry_after_seconds,
      message: msg.message,
    });
  }

  // Prompt suggestion
  if (msg.type === "prompt_suggestion") {
    events.push({
      type: "prompt_suggestion",
      suggestions: msg.suggestions,
    });
  }

  // Local command output
  if (msg.type === "local_command_output") {
    events.push({
      type: "command_output",
      command: msg.command,
      output: msg.output,
      exitCode: msg.exitCode,
    });
  }

  // Result message (authoritative end signal from SDK)
  if (msg.type === "result") {
    const resultEvent: SSEResultEvent = {
      type: "result",
      is_error: !!msg.is_error,
      subtype: msg.subtype,
      total_cost_usd: msg.total_cost_usd,
      duration_ms: msg.duration_ms,
      num_turns: msg.num_turns,
    };
    if (msg.is_error && msg.errors) {
      resultEvent.errors = msg.errors;
    }
    if (!msg.is_error && msg.result) {
      resultEvent.result = msg.result;
    }
    // Forward per-model usage breakdown (authoritative cost data from SDK)
    if (msg.modelUsage) {
      resultEvent.modelUsage = msg.modelUsage;
    }
    // OpenTelemetry-style fields (CC v2.1.143). `finish_reasons` lives under
    // `gen_ai.response.finish_reasons` in the OTel span; older / variant SDK
    // shapes may surface it at the top level. Tolerate both, never crash if
    // either path is missing.
    if (typeof msg.stop_reason === "string") {
      resultEvent.stop_reason = msg.stop_reason;
    }
    const genAi = msg.gen_ai as { response?: { finish_reasons?: unknown } } | undefined;
    const nestedFinish = genAi?.response?.finish_reasons;
    const topLevelFinish = (msg as { finish_reasons?: unknown }).finish_reasons;
    const rawFinish = nestedFinish ?? topLevelFinish;
    if (Array.isArray(rawFinish) && rawFinish.every((r) => typeof r === "string")) {
      resultEvent.finish_reasons = rawFinish as string[];
    }
    events.push(resultEvent);
  }

  return events;
}
