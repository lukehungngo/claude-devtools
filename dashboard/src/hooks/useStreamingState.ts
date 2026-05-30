import { useCallback, useRef, useState } from "react";
import type { SDKStatus } from "@anthropic-ai/claude-agent-sdk";
import type { LiveTaskState, LiveHookState, StreamingToolEntry, StreamingState } from "../lib/streaming-types";
import { createInitialStreamingState } from "../lib/streaming-types";

type SessionStateValue = StreamingState["sessionState"];

function narrowSessionState(value: unknown): SessionStateValue {
  return value === "running" || value === "idle" || value === "requires_action" ? value : null;
}

function narrowSdkStatus(value: unknown): SDKStatus {
  return value === "compacting" || value === "requesting" ? value : null;
}

const LIVE_TASK_STATUS_VALUES: ReadonlySet<LiveTaskState["status"]> = new Set([
  "pending",
  "running",
  "completed",
  "failed",
  "killed",
  "paused",
  "stopped",
]);

function narrowLiveTaskStatus(value: unknown): LiveTaskState["status"] | undefined {
  return typeof value === "string" && LIVE_TASK_STATUS_VALUES.has(value as LiveTaskState["status"])
    ? (value as LiveTaskState["status"])
    : undefined;
}

/** NEW-8: narrow `hook_response.outcome` to the SDK union; default to success. */
function narrowHookOutcome(value: unknown): LiveHookState["outcome"] {
  return value === "error" || value === "cancelled" || value === "success" ? value : "success";
}

export interface StreamingStateActions {
  /** Process a parsed SSE event from the server */
  handleSSEEvent: (data: { type: string; [key: string]: unknown }) => void;
  /** Reset streaming state (e.g., when a new message starts) */
  reset: () => void;
}

export interface UseStreamingStateReturn {
  state: StreamingState;
  actions: StreamingStateActions;
}

export function useStreamingState(): UseStreamingStateReturn {
  const [state, setState] = useState<StreamingState>(createInitialStreamingState);
  const activeToolRef = useRef<string | null>(null);

  const handleSSEEvent = useCallback((data: { type: string; [key: string]: unknown }) => {
    setState((prev) => {
      switch (data.type) {
        case "stdout": {
          const text = data.text as string;
          return {
            ...prev,
            responseText: prev.responseText + text,
          };
        }

        case "thinking": {
          const text = data.text as string;
          return {
            ...prev,
            thinking: {
              text: prev.thinking.text + text,
              isComplete: false,
            },
          };
        }

        case "tool_start": {
          const id = data.id as string;
          const name = data.name as string;
          const input = data.input as Record<string, unknown> | undefined;
          const entry: StreamingToolEntry = {
            id,
            name,
            input,
            inputJson: "",
            status: "running",
            startedAt: Date.now(),
          };
          const newTools = new Map(prev.tools);
          newTools.set(id, entry);
          activeToolRef.current = id;
          return {
            ...prev,
            tools: newTools,
            toolOrder: [...prev.toolOrder, id],
            activeToolId: id,
          };
        }

        case "tool_delta": {
          const partialJson = data.partial_json as string;
          const toolId = activeToolRef.current;
          if (!toolId) return prev;
          const existing = prev.tools.get(toolId);
          if (!existing) return prev;

          const newJson = existing.inputJson + partialJson;
          // Try to parse the accumulated JSON for input preview
          let parsedInput = existing.input;
          try {
            parsedInput = JSON.parse(newJson);
          } catch {
            // Incomplete JSON, keep accumulating
          }

          const newTools = new Map(prev.tools);
          newTools.set(toolId, {
            ...existing,
            inputJson: newJson,
            input: parsedInput,
          });
          return { ...prev, tools: newTools };
        }

        case "tool_end": {
          // Mark the active tool's thinking as complete (input streaming done)
          // The tool is still "running" until tool_result arrives
          return {
            ...prev,
            thinking: {
              ...prev.thinking,
              isComplete: true,
            },
          };
        }

        case "tool_result": {
          const toolUseId = data.tool_use_id as string;
          const content = data.content;
          const isError = data.is_error as boolean | undefined;
          const existing = prev.tools.get(toolUseId);
          if (!existing) {
            // tool_result arrived before tool_start (race condition)
            // Create a placeholder entry
            const entry: StreamingToolEntry = {
              id: toolUseId,
              name: "unknown",
              inputJson: "",
              status: isError ? "error" : "success",
              resultContent: content,
              resultIsError: isError,
              startedAt: Date.now(),
              completedAt: Date.now(),
            };
            const newTools = new Map(prev.tools);
            newTools.set(toolUseId, entry);
            return {
              ...prev,
              tools: newTools,
              toolOrder: [...prev.toolOrder, toolUseId],
            };
          }
          const newTools = new Map(prev.tools);
          newTools.set(toolUseId, {
            ...existing,
            status: isError ? "error" : "success",
            resultContent: content,
            resultIsError: isError,
            completedAt: Date.now(),
          });
          return { ...prev, tools: newTools };
        }

        case "tool_progress": {
          // Update elapsed time for the tool (informational)
          return prev;
        }

        case "status": {
          const status = narrowSdkStatus(data.status);
          return {
            ...prev,
            status,
            isCompacting: status === "compacting",
          };
        }

        case "compact": {
          // Server now sends camelCase (preTokens) per real CC JSONL shape.
          // Tolerate snake_case for older server builds.
          const metadata = data.metadata as
            | {
                trigger?: string;
                preTokens?: number;
                pre_tokens?: number;
                postTokens?: number;
                durationMs?: number;
                attributedTo?: {
                  hookName?: string;
                  cancelled?: boolean;
                  reason?: string;
                };
              }
            | undefined;
          let attributedTo: { hookName: string; cancelled?: boolean; reason?: string } | undefined;
          if (metadata?.attributedTo && typeof metadata.attributedTo.hookName === "string") {
            attributedTo = {
              hookName: metadata.attributedTo.hookName,
              ...(metadata.attributedTo.cancelled === true ? { cancelled: true } : {}),
              ...(typeof metadata.attributedTo.reason === "string"
                ? { reason: metadata.attributedTo.reason }
                : {}),
            };
          }
          // Narrow trigger to SDK union (sdk.d.ts:2525); default unknown
          // values to "auto" matching server convention.
          const narrowTrigger: "auto" | "manual" =
            metadata?.trigger === "manual" ? "manual" : "auto";
          return {
            ...prev,
            isCompacting: false,
            compactResult: metadata
              ? {
                  trigger: narrowTrigger,
                  preTokens: metadata.preTokens ?? metadata.pre_tokens ?? 0,
                  postTokens: metadata.postTokens,
                  durationMs: metadata.durationMs,
                  ...(attributedTo ? { attributedTo } : {}),
                }
              : null,
          };
        }

        case "session_state_changed": {
          return {
            ...prev,
            sessionState: narrowSessionState(data.state),
          };
        }

        case "permission_denied": {
          // NEW-9: SDK auto-denial (classifier / rule / mode / asyncAgent).
          // Dedupe by tool_use_id (first wins) — auto-denial is one-shot per
          // tool call; any repeat is a transport-layer re-delivery.
          const toolUseId = data.tool_use_id as string;
          if (!toolUseId) return prev;
          if (prev.permissionDenials.some((d) => d.tool_use_id === toolUseId)) {
            return prev;
          }
          const record = {
            tool_name: data.tool_name as string,
            tool_use_id: toolUseId,
            agent_id: data.agent_id as string | undefined,
            decision_reason_type: data.decision_reason_type as string | undefined,
            decision_reason: data.decision_reason as string | undefined,
            message: data.message as string,
          };
          return {
            ...prev,
            permissionDenials: [...prev.permissionDenials, record],
          };
        }

        case "result": {
          // Result is the terminal event from the SDK — session is idle.
          // Extract authoritative context window from modelUsage if present.
          let sdkContextWindow = prev.sdkContextWindow;
          const modelUsage = data.modelUsage as Record<string, { contextWindow?: number }> | undefined;
          if (modelUsage) {
            let maxContextWindow = 0;
            for (const usage of Object.values(modelUsage)) {
              if (usage.contextWindow && usage.contextWindow > maxContextWindow) {
                maxContextWindow = usage.contextWindow;
              }
            }
            if (maxContextWindow > 0) {
              sdkContextWindow = maxContextWindow;
            }
          }
          // OpenTelemetry-style fields (CC v2.1.143, P2-5). Forwarded by the
          // server from `msg.stop_reason` and `msg.gen_ai.response.finish_reasons`.
          // Keep previous value when the new event omits them so a partial
          // result doesn't blank out earlier data.
          const incomingStop = data.stop_reason as string | undefined;
          const incomingFinishRaw = data.finish_reasons as unknown;
          const incomingFinish: readonly string[] | undefined =
            Array.isArray(incomingFinishRaw) && incomingFinishRaw.every((r) => typeof r === "string")
              ? (incomingFinishRaw as string[])
              : undefined;
          return {
            ...prev,
            sessionState: "idle",
            sdkContextWindow,
            lastResultStopReason:
              typeof incomingStop === "string" ? incomingStop : prev.lastResultStopReason,
            lastResultFinishReasons:
              incomingFinish !== undefined ? incomingFinish : prev.lastResultFinishReasons,
            // C2: the turn is over — finalize the preview.
            finalized: true,
          };
        }

        // C1: server-emitted top-level error frame (rate_limit / billing /
        // SDK throw). The fatal error finalizes the turn so the streaming area
        // stops the "Working..." pulse. PromptInput surfaces the error text via
        // its own local sseError state (F3 — the reducer no longer tracks it).
        case "error": {
          return {
            ...prev,
            finalized: true,
          };
        }

        // C1: non-fatal throttle/retry signals. The turn continues, so do NOT
        // finalize. PromptInput drives its own transient throttle indicator
        // (F3 — the reducer no longer tracks isThrottled).
        case "rate_limit":
        case "api_retry": {
          return prev;
        }

        // C2: terminal stream-end marker emitted by the server after the SDK
        // iterator drains. Finalize the preview so "Working..." stops pulsing.
        case "done": {
          return {
            ...prev,
            finalized: true,
          };
        }

        // NEW-7: structured Task lifecycle SSE events. Keyed by task_id.
        case "task_started": {
          const taskId = data.task_id as string | undefined;
          if (!taskId) return prev;
          const next = new Map(prev.liveTasks);
          const existing = next.get(taskId);
          const entry: LiveTaskState = {
            ...(existing ?? {
              task_id: taskId,
              status: "running",
              description: "",
            }),
            task_id: taskId,
            status: existing?.status ?? "running",
            description: (data.description as string) ?? existing?.description ?? "",
          };
          if (typeof data.tool_use_id === "string") entry.tool_use_id = data.tool_use_id;
          if (typeof data.subagent_type === "string") entry.subagent_type = data.subagent_type;
          next.set(taskId, entry);
          return { ...prev, liveTasks: next };
        }

        case "task_progress": {
          const taskId = data.task_id as string | undefined;
          if (!taskId) return prev;
          const next = new Map(prev.liveTasks);
          const existing = next.get(taskId);
          const usage = data.usage as
            | { total_tokens?: number; tool_uses?: number; duration_ms?: number }
            | undefined;
          const entry: LiveTaskState = {
            ...(existing ?? {
              task_id: taskId,
              status: "running",
              description: (data.description as string) ?? "",
            }),
            task_id: taskId,
            description: (data.description as string) ?? existing?.description ?? "",
          };
          if (typeof data.tool_use_id === "string") entry.tool_use_id = data.tool_use_id;
          if (typeof data.subagent_type === "string") entry.subagent_type = data.subagent_type;
          if (usage) {
            entry.totalTokens = usage.total_tokens ?? entry.totalTokens;
            entry.toolUses = usage.tool_uses ?? entry.toolUses;
            entry.durationMs = usage.duration_ms ?? entry.durationMs;
          }
          if (typeof data.last_tool_name === "string") entry.lastToolName = data.last_tool_name;
          if (typeof data.summary === "string") entry.summary = data.summary;
          next.set(taskId, entry);
          return { ...prev, liveTasks: next };
        }

        case "task_updated": {
          const taskId = data.task_id as string | undefined;
          if (!taskId) return prev;
          const patch = (data.patch ?? {}) as {
            status?: unknown;
            description?: unknown;
            end_time?: unknown;
            total_paused_ms?: unknown;
            error?: unknown;
            is_backgrounded?: unknown;
          };
          const next = new Map(prev.liveTasks);
          const existing = next.get(taskId);
          const entry: LiveTaskState = {
            ...(existing ?? {
              task_id: taskId,
              status: "running",
              description: "",
            }),
            task_id: taskId,
          };
          const narrowed = narrowLiveTaskStatus(patch.status);
          if (narrowed) entry.status = narrowed;
          if (typeof patch.description === "string") entry.description = patch.description;
          if (typeof patch.is_backgrounded === "boolean") entry.isBackgrounded = patch.is_backgrounded;
          // `end_time`, `total_paused_ms`, `error` aren't surfaced in
          // LiveTaskState today; keep them server-side for future use.
          next.set(taskId, entry);
          return { ...prev, liveTasks: next };
        }

        case "task_notification": {
          const taskId = data.task_id as string | undefined;
          if (!taskId) return prev;
          const rawStatus = data.status as string | undefined;
          const status: LiveTaskState["status"] =
            rawStatus === "failed"
              ? "failed"
              : rawStatus === "stopped"
              ? "stopped"
              : "completed";
          const next = new Map(prev.liveTasks);
          const existing = next.get(taskId);
          const usage = data.usage as
            | { total_tokens?: number; tool_uses?: number; duration_ms?: number }
            | undefined;
          const entry: LiveTaskState = {
            ...(existing ?? {
              task_id: taskId,
              status,
              description: "",
            }),
            task_id: taskId,
            status,
          };
          if (typeof data.tool_use_id === "string") entry.tool_use_id = data.tool_use_id;
          if (typeof data.summary === "string") entry.summary = data.summary;
          if (usage) {
            entry.totalTokens = usage.total_tokens ?? entry.totalTokens;
            entry.toolUses = usage.tool_uses ?? entry.toolUses;
            entry.durationMs = usage.duration_ms ?? entry.durationMs;
          }
          next.set(taskId, entry);
          return { ...prev, liveTasks: next };
        }

        // NEW-8: hook lifecycle. Track in-flight hooks so HooksTab can render
        // a spinner + elapsed time before the JSONL hook_success attachment
        // arrives. Field names mirror the SDK shapes (sdk.d.ts:3080-3116).
        case "hook_started": {
          const hookId = data.hook_id as string | undefined;
          if (!hookId) return prev;
          const entry: LiveHookState = {
            hook_id: hookId,
            hook_name: (data.hook_name as string | undefined) ?? "",
            hook_event: (data.hook_event as string | undefined) ?? "",
            startedAt: Date.now(),
            completed: false,
          };
          const newLiveHooks = new Map(prev.liveHooks);
          newLiveHooks.set(hookId, entry);
          return { ...prev, liveHooks: newLiveHooks };
        }

        case "hook_progress": {
          const hookId = data.hook_id as string | undefined;
          if (!hookId) return prev;
          const existing = prev.liveHooks.get(hookId);
          if (!existing) return prev;
          const output = (data.output as string | undefined) ??
            (data.stdout as string | undefined);
          // Only allocate a new Map when we actually have a payload worth keeping
          // (keeps the reducer O(1) on no-op progress pings).
          if (output == null) return prev;
          const newLiveHooks = new Map(prev.liveHooks);
          newLiveHooks.set(hookId, { ...existing, lastOutput: output });
          return { ...prev, liveHooks: newLiveHooks };
        }

        case "hook_response": {
          const hookId = data.hook_id as string | undefined;
          if (!hookId) return prev;
          const existing = prev.liveHooks.get(hookId);
          if (!existing) return prev;
          const outcome = narrowHookOutcome(data.outcome);
          const durationMs = Math.max(0, Date.now() - existing.startedAt);
          const updated: LiveHookState = {
            ...existing,
            completed: true,
            outcome,
            durationMs,
          };
          if (typeof data.exit_code === "number") updated.exit_code = data.exit_code;
          const newLiveHooks = new Map(prev.liveHooks);
          newLiveHooks.set(hookId, updated);
          return { ...prev, liveHooks: newLiveHooks };
        }

        default:
          return prev;
      }
    });
  }, []);

  const reset = useCallback(() => {
    activeToolRef.current = null;
    setState(createInitialStreamingState());
  }, []);

  return {
    state,
    actions: { handleSSEEvent, reset },
  };
}
