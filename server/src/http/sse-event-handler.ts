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
}

export interface SSEErrorEvent {
  type: "error";
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
  | SSEErrorEvent;

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

  // Result message
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
    events.push(resultEvent);
  }

  return events;
}
