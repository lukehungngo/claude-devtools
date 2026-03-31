# TASK-005: Wire TaskGrid data from session events

## Objective
Extract task items from session events so TaskGrid actually renders in production instead of being dead code.

## Routing
routing: Engineer directly — event parsing + prop wiring

## Files
- `dashboard/src/components/conversation/ConversationView.tsx` (modify)
- `dashboard/src/components/conversation/ConversationView.test.tsx` (modify if needed)

## Approach
1. In ConversationView, add a `useMemo` that scans `allEvents` for tool_use entries where `name === "TaskCreate"` or `name === "TodoWrite"`
2. For TaskCreate: extract `{id, name, status}` from tool input
3. For TodoWrite: extract todo items from the tool input (it contains a list of tasks with statuses)
4. Pass extracted tasks to the existing `TaskGrid` component (already imported and conditionally rendered)
5. Remove the `taskItems` prop from ConversationView — derive internally instead
6. If no task events found, tasks array is empty and TaskGrid returns null (existing behavior)

## Acceptance Criteria
- When events contain TaskCreate tool_use, TaskGrid renders with extracted tasks
- When events contain no task-related tools, TaskGrid doesn't render
- The `taskItems` prop on ConversationView can be removed (data derived internally)
- `cd dashboard && pnpm test -- --grep "ConversationView"` passes

## Do Not Touch
- TaskGrid.tsx (already works correctly)
- SessionPage.tsx (no longer needs to pass taskItems)
