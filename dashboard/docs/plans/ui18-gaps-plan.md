# Implementation Plan: UI-18 Gaps — Match Mockup Visual Fidelity

## Goal
Close the remaining visual gaps between the conversation response rendering and the HTML mockup at `docs/design/v5-compact-agent-response.html`. Focus on what the user SEES.

## Tasks

### TASK-001: Fix ResponseBlock border green → purple/accent
- **Agent:** engineer
- **Files:** `dashboard/src/components/viewer/ResponseBlock.tsx`, `dashboard/src/components/viewer/ResponseBlock.test.tsx`
- **Approach:** Change `border-dt-green` to `border-dt-accent` in the ResponseBlock className (line 25). Update the test at ResponseBlock.test.tsx line 120 that asserts `border-dt-green` to assert `border-dt-accent` instead. The mockup uses `border-left: 2px solid var(--accent)` (purple) for assistant text blocks.
- **Tests:** Update existing test asserting border color class.
- **Verify:** `cd dashboard && pnpm test -- --grep "ResponseBlock" --reporter verbose`
- **Depends on:** none
- **Est:** 2 min

### TASK-002: Add per-tool-type stat badges to AgentCard
- **Agent:** engineer
- **Files:** `dashboard/src/components/conversation/AgentCard.tsx`, `dashboard/src/components/conversation/AgentCard.test.tsx`
- **Approach:** Replace the single `toolCount?: number` prop with `toolStats?: Array<{name: string, count: number}>`. Render each as a pill badge in the header matching the mockup's `.ad-stat` pattern: `<span>` with `background: var(--bg-h)`, `font-family: var(--font-mono)`, `fontSize: 10`, `padding: 2px 6px`, `borderRadius: var(--radius)`, `color: var(--t2)`. Format as "Read ×11", "Grep ×6", etc. Keep the existing `cost` prop and render it in yellow mono (`color: var(--amb)`) like mockup's `.ad-cost`. Update tests to verify toolStats renders pill badges.
- **Tests:** Test that `toolStats={[{name:"Read",count:11},{name:"Grep",count:6}]}` renders two badge elements with correct text.
- **Verify:** `cd dashboard && pnpm test -- --grep "AgentCard" --reporter verbose`
- **Depends on:** none
- **Est:** 4 min

### TASK-003: Wire tool stats + cost from ToolEntries to AgentCard
- **Agent:** engineer
- **Files:** `dashboard/src/components/conversation/ToolEntries.tsx`, `dashboard/src/components/conversation/ToolEntries.test.tsx`
- **Approach:** In `ToolEntryRow`, when rendering an AgentCard for an agent dispatch entry, compute `toolStats` from the agent's `resultContent` by parsing text for tool call patterns. Also, for consecutive tool entries that follow an agent dispatch (entries between two agent dispatches or between an agent dispatch and the end), count their types and pass as `toolStats`. The simpler approach: parse the result text content to extract tool usage stats. If the result text contains patterns like "Read ×N" or mentions tool names, extract counts. Fallback: count nothing (leave toolStats undefined). Pass `cost` from entry.toolInput if available. This wires the existing AgentCard props that are currently never passed.
- **Tests:** Add test: agent dispatch entry with resultContent containing tool mentions renders AgentCard with stats.
- **Verify:** `cd dashboard && pnpm test -- --grep "ToolEntries" --reporter verbose`
- **Depends on:** TASK-002
- **Est:** 5 min

### TASK-004: Add tool-specific badge colors to CollapsedGroupRow
- **Agent:** engineer
- **Files:** `dashboard/src/components/conversation/ToolEntries.tsx`, `dashboard/src/components/conversation/ToolEntries.test.tsx`
- **Approach:** In `CollapsedGroupRowInner`, change the count badge's background and text color from generic `var(--bg-h)` / `var(--t3)` to tool-specific colors. Add a helper `getToolBadgeColors(toolName: string): {bg: string, text: string}` that returns: Read/Glob/ListDir → `{bg: "var(--teal-dim)", text: "var(--teal)"}`, Grep/WebSearch → `{bg: "var(--acc-bg)", text: "var(--acc)"}`, Bash → `{bg: "var(--amb-bg)", text: "var(--amb)"}`, Edit/Write → `{bg: "var(--grn-bg)", text: "var(--grn)"}`. Apply to the count badge span. Check CSS vars exist — fall back to the border color mapping if needed (use `var(--bg-h)` and the `getToolBorderColor` output).
- **Tests:** Test that collapsed group for Read tools renders badge with tool-specific colors.
- **Verify:** `cd dashboard && pnpm test -- --grep "ToolEntries" --reporter verbose`
- **Depends on:** none
- **Est:** 3 min

### TASK-005: Wire TaskGrid data from session events
- **Agent:** engineer
- **Files:** `dashboard/src/components/conversation/ConversationView.tsx`, `dashboard/src/components/conversation/ToolEntries.tsx`, `dashboard/src/routes/SessionPage.tsx`
- **Approach:** Extract task items from session events. Look for `TaskCreate`/`TodoWrite` tool_use events in the session data. In ConversationView, parse allEvents to extract task items (id, name, status) and pass to TaskGrid. The existing TaskGrid component and ConversationView prop `taskItems` are already wired — the only gap is SessionPage not passing data. Approach: add a `useMemo` in ConversationView that scans events for TaskCreate/TodoWrite tool calls and extracts task entries. If none found, TaskGrid won't render (it already returns null for empty tasks). No changes needed in SessionPage — ConversationView can derive tasks internally.
- **Tests:** Add test: events containing TaskCreate tool_use render TaskGrid.
- **Verify:** `cd dashboard && pnpm test -- --grep "ConversationView" --reporter verbose`
- **Depends on:** none
- **Est:** 5 min

## Dependency Graph
TASK-001 (parallel safe)
TASK-002 → TASK-003
TASK-004 (parallel safe)
TASK-005 (parallel safe)

## Risk Assessment
- CSS variable names may differ between mockup and actual theme. Engineers must check `globals.css` / `tailwind.config.js` for actual var names.
- Agent result content format is unstructured text — extracting tool stats from it may be unreliable. Fallback: show nothing when stats can't be parsed.
- TaskCreate/TodoWrite events may not exist in most sessions — TaskGrid should gracefully return null.
