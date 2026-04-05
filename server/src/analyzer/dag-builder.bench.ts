import { bench, describe } from "vitest";
import { buildAgentDAG } from "./dag-builder.js";
import { generateSubagentData } from "../test-utils/generate-events.js";
import type { SessionEvent } from "../types.js";

/**
 * Generate main-session assistant events where each event contains one
 * Agent tool_use whose description matches the subagentMeta entries
 * produced by generateSubagentData (i.e. "task-N").
 */
function makeMainEventsWithAgentCalls(count: number): SessionEvent[] {
  const events: SessionEvent[] = [];
  const baseTime = 1_700_000_000_000;

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(baseTime + i * 1000).toISOString();
    events.push({
      type: "assistant",
      uuid: `main-uuid-${i}`,
      timestamp,
      sessionId: "bench-main-session",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: `main-tu-${i}`,
            name: "Agent",
            input: { description: `task-${i}` },
          },
        ],
        model: "claude-sonnet-4-6",
        id: `main-msg-${i}`,
        type: "message",
        stop_reason: "tool_use",
        usage: {
          input_tokens: 200,
          output_tokens: 80,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    } as unknown as SessionEvent);
  }

  return events;
}

// Pre-generate all data outside bench() calls to isolate DAG builder cost.
const datasets = Object.fromEntries(
  [5, 20, 50, 100].map((count) => {
    const mainEvents = makeMainEventsWithAgentCalls(count);
    const { subagentEvents, subagentMeta } = generateSubagentData(count);
    return [count, { mainEvents, subagentEvents, subagentMeta }];
  })
) as Record<
  number,
  {
    mainEvents: SessionEvent[];
    subagentEvents: Map<string, SessionEvent[]>;
    subagentMeta: Map<string, { agentType: string; description: string }>;
  }
>;

describe("buildAgentDAG", () => {
  for (const count of [5, 20, 50, 100]) {
    bench(`${count} agents`, () => {
      const { mainEvents, subagentEvents, subagentMeta } = datasets[count];
      buildAgentDAG(mainEvents, subagentEvents, subagentMeta);
    });
  }
});
