# TASK-003: Wire tool stats + cost from ToolEntries to AgentCard

## Objective
Pass tool stats and cost to AgentCard from ToolEntries so agent dispatch cards show "Read ×11 · Grep ×6 · $6.67" like the mockup.

## Routing
routing: Engineer directly — wiring existing props through existing component hierarchy

## Files
- `dashboard/src/components/conversation/ToolEntries.tsx` (modify)
- `dashboard/src/components/conversation/ToolEntries.test.tsx` (modify)

## Approach
1. In ToolEntries.tsx, the AgentCard is rendered in ToolEntryRow for agent dispatch entries (line ~249)
2. The agent's `resultContent` is typically text from the subagent. Parse it to extract tool stats if possible.
3. Simpler approach: Look at the `ToolEntry` data. The `toolInput` for Agent/Task tool_use contains the prompt. The `resultContent` contains the agent's output text.
4. Add a helper `extractToolStatsFromResult(content: string | unknown[]): Array<{name: string, count: number}>` that:
   - Converts content to text string
   - Scans for patterns like "Read ×N", "Grep ×N", or tool call counts
   - Falls back to empty array if nothing found
5. Pass `toolStats={extractToolStatsFromResult(entry.resultContent)}` and `cost` (if available in entry metadata) to AgentCard
6. For cost: there's no direct cost field on ToolEntry. Leave cost undefined for now (it requires server-side per-agent cost which isn't in the event data). Document this gap.

## Acceptance Criteria
- AgentCard receives toolStats when result content contains tool call information
- Graceful fallback: empty toolStats when content has no parseable tool info
- `cd dashboard && pnpm test -- --grep "ToolEntries"` passes

## Do Not Touch
- AgentCard.tsx (that's TASK-002)
- Other component files
