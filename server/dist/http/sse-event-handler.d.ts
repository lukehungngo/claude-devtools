/**
 * SSE event mapping — converts SDK messages to SSE-serializable event objects.
 * Extracted from routes.ts for testability.
 */
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
    status: string | null;
}
export interface SSECompactEvent {
    type: "compact";
    metadata: {
        trigger: "manual" | "auto";
        pre_tokens: number;
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
    state: string;
}
export type SSEEvent = SSETextEvent | SSEThinkingEvent | SSEToolStartEvent | SSEToolDeltaEvent | SSEToolEndEvent | SSEToolResultEvent | SSEToolProgressEvent | SSEStatusEvent | SSECompactEvent | SSEResultEvent | SSEErrorEvent | SSEToolSummaryEvent | SSEInitEvent | SSERateLimitEvent | SSETaskStartedEvent | SSETaskProgressEvent | SSETaskNotificationEvent | SSEHookStartedEvent | SSEHookProgressEvent | SSEHookResponseEvent | SSEPromptSuggestionEvent | SSECommandOutputEvent | SSESessionStateChangedEvent;
/**
 * Maps an SDK message to zero or more SSE events.
 * Returns an array because a single SDK message (e.g. assistant with multiple content blocks)
 * can produce multiple SSE events.
 */
export declare function mapSdkMessageToSSEEvents(msg: {
    type: string;
    event?: any;
    message?: any;
    is_error?: boolean;
    subtype?: string;
    [key: string]: any;
}): SSEEvent[];
