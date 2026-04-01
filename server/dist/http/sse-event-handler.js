/**
 * SSE event mapping — converts SDK messages to SSE-serializable event objects.
 * Extracted from routes.ts for testability.
 */
/**
 * Maps an SDK message to zero or more SSE events.
 * Returns an array because a single SDK message (e.g. assistant with multiple content blocks)
 * can produce multiple SSE events.
 */
export function mapSdkMessageToSSEEvents(msg) {
    const events = [];
    if (msg.type === "stream_event") {
        const event = msg.event;
        if (!event)
            return events;
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
                    input: event.content_block.input,
                });
            }
        }
        // content_block_stop
        if (event.type === "content_block_stop") {
            events.push({ type: "tool_end", index: event.index ?? 0 });
        }
    }
    // Assistant message (complete) — extract text blocks
    if (msg.type === "assistant" && msg.message?.content) {
        const content = msg.message.content;
        if (Array.isArray(content)) {
            for (const block of content) {
                if (block.type === "text" && block.text) {
                    events.push({ type: "stdout", text: block.text });
                }
            }
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
    // Compact boundary
    if (msg.type === "system" && msg.subtype === "compact_boundary") {
        events.push({
            type: "compact",
            metadata: msg.compact_metadata,
        });
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
        const resultEvent = {
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
        events.push(resultEvent);
    }
    return events;
}
//# sourceMappingURL=sse-event-handler.js.map