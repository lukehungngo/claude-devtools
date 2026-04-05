/**
 * Synthetic event generator for benchmarks.
 * Produces realistic mixes of assistant and user events
 * without hitting the filesystem or network.
 */

import type {
  SessionEvent,
  AssistantEvent,
  UserEvent,
} from "../types.js";

const SESSION_ID = "bench-session-001";
const MODELS = [
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-opus-4-5",
];

const TOOL_NAMES = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "mcp__filesystem__read_file",
  "mcp__filesystem__list_directory",
  "mcp__github__search_code",
];

function makeUuid(index: number): string {
  return `bench-uuid-${index.toString().padStart(8, "0")}`;
}

function makeTimestamp(offsetMs: number): string {
  return new Date(1_700_000_000_000 + offsetMs).toISOString();
}

function makeAssistantEvent(index: number): AssistantEvent {
  const useToolUse = index % 3 !== 0;
  const toolName = TOOL_NAMES[index % TOOL_NAMES.length];
  const toolUseId = `tu-${index}`;

  const content: AssistantEvent["message"]["content"] = useToolUse
    ? [
        { type: "text", text: `Step ${index}: invoking ${toolName}` },
        {
          type: "tool_use",
          id: toolUseId,
          name: toolName,
          input: { path: `/src/file-${index}.ts` },
        },
      ]
    : [{ type: "text", text: `Completed step ${index}.` }];

  return {
    type: "assistant",
    uuid: makeUuid(index * 2),
    timestamp: makeTimestamp(index * 1000),
    sessionId: SESSION_ID,
    message: {
      role: "assistant",
      content,
      model: MODELS[index % MODELS.length],
      id: `msg-${index}`,
      type: "message",
      stop_reason: useToolUse ? "tool_use" : "end_turn",
      usage: {
        input_tokens: 100 + (index % 50) * 10,
        output_tokens: 50 + (index % 20) * 5,
        cache_creation_input_tokens: index % 4 === 0 ? 200 : 0,
        cache_read_input_tokens: index % 4 === 1 ? 150 : 0,
      },
    },
  };
}

function makeUserEvent(index: number): UserEvent {
  const toolUseId = `tu-${index - 1}`;
  const isError = index % 17 === 0;

  return {
    type: "user",
    uuid: makeUuid(index * 2 + 1),
    timestamp: makeTimestamp(index * 1000 + 500),
    sessionId: SESSION_ID,
    userType: "internal",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUseId,
          content: isError ? "Error: file not found" : `Result of tool call ${index}`,
          is_error: isError,
        },
      ],
    },
  };
}

/**
 * Generate a realistic mix of assistant (with tool_use + usage) and user
 * (tool_result) events.
 *
 * @param count Total number of events to generate. Alternates assistant/user.
 */
export function generateEvents(count: number): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) {
      events.push(makeAssistantEvent(i) as unknown as SessionEvent);
    } else {
      events.push(makeUserEvent(i) as unknown as SessionEvent);
    }
  }
  return events;
}

/**
 * Generate subagent data structures suitable for DAG builder benchmarks.
 *
 * @param agentCount Number of subagents to create.
 * @returns subagentEvents and subagentMeta Maps keyed by agent ID.
 */
export function generateSubagentData(agentCount: number): {
  subagentEvents: Map<string, SessionEvent[]>;
  subagentMeta: Map<string, { agentType: string; description: string }>;
} {
  const subagentEvents = new Map<string, SessionEvent[]>();
  const subagentMeta = new Map<
    string,
    { agentType: string; description: string }
  >();

  const agentTypes = ["Explore", "Plan", "Engineer", "Reviewer", "Test"];

  for (let a = 0; a < agentCount; a++) {
    const agentId = `agent-bench-${a}`;
    const description = `task-${a}`;

    // Each subagent gets a small event slice
    const agentEventCount = 4;
    const events: SessionEvent[] = [];
    for (let i = 0; i < agentEventCount; i++) {
      const absIndex = agentCount * 100 + a * agentEventCount + i;
      if (i % 2 === 0) {
        events.push(makeAssistantEvent(absIndex) as unknown as SessionEvent);
      } else {
        events.push(makeUserEvent(absIndex) as unknown as SessionEvent);
      }
    }

    subagentEvents.set(agentId, events);
    subagentMeta.set(agentId, {
      agentType: agentTypes[a % agentTypes.length],
      description,
    });
  }

  return { subagentEvents, subagentMeta };
}
