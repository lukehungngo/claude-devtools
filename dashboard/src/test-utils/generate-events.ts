import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
} from "../lib/types";

const SESSION_ID = "bench-session-001";
const BASE_TIME = new Date("2025-01-01T00:00:00.000Z").getTime();

function makeUuid(index: number): string {
  return `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
}

function makeTimestamp(index: number): string {
  return new Date(BASE_TIME + index * 1000).toISOString();
}

function makeAssistantEvent(index: number, parentUuid?: string): AssistantEvent {
  return {
    type: "assistant",
    uuid: makeUuid(index),
    parentUuid,
    timestamp: makeTimestamp(index),
    sessionId: SESSION_ID,
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: `Assistant response ${index}: Here is some generated content for benchmarking purposes.`,
        },
      ],
      model: "claude-sonnet-4-5",
      id: `msg_${String(index).padStart(8, "0")}`,
      type: "message",
      stop_reason: index % 3 === 0 ? "tool_use" : "end_turn",
      usage: {
        input_tokens: 100 + (index % 50),
        output_tokens: 50 + (index % 30),
        cache_creation_input_tokens: index % 2 === 0 ? 20 : 0,
        cache_read_input_tokens: index % 4 === 0 ? 80 : 0,
      },
    },
  };
}

function makeUserEvent(index: number, parentUuid?: string): UserEvent {
  return {
    type: "user",
    uuid: makeUuid(index),
    parentUuid,
    timestamp: makeTimestamp(index),
    sessionId: SESSION_ID,
    userType: index % 5 === 0 ? "external" : "internal",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: `toolu_${String(index).padStart(8, "0")}`,
          content: `Tool result for event ${index}`,
          is_error: index % 10 === 0,
        },
      ],
    },
  };
}

/**
 * Generates a realistic mix of assistant and user events for benchmarking.
 *
 * The sequence follows a typical turn pattern:
 * - Even indices produce assistant events (with tool_use stop_reason every 3rd)
 * - Odd indices produce user events (tool_result responses)
 * Each event references the previous event's UUID as its parent.
 */
export function generateEvents(count: number): SessionEvent[] {
  const events: SessionEvent[] = [];

  for (let i = 0; i < count; i++) {
    const parentUuid = i > 0 ? makeUuid(i - 1) : undefined;

    if (i % 2 === 0) {
      events.push(makeAssistantEvent(i, parentUuid));
    } else {
      events.push(makeUserEvent(i, parentUuid));
    }
  }

  return events;
}
