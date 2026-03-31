## TASK-005 Result: Wire TaskGrid data from session events

### Summary
Replaced the dead-code `taskItems` prop on `ConversationView` with a `useMemo` that derives task items from `tool_use` content in session events. The TaskGrid now automatically populates when the session contains `TodoWrite`, `TaskCreate`, or `TaskUpdate` tool calls.

### Changes

**`src/components/conversation/ConversationView.tsx`**
- Removed `taskItems` prop from `ConversationViewProps` interface
- Removed `import type { TaskGridProps }` (no longer needed)
- Added `derivedTasks` useMemo that scans `events` for assistant messages containing `tool_use` content items with task-related tool names
- TodoWrite: extracts `todos` array, maps `content` to `name`, normalizes `status` (completed/done -> done, in_progress -> in_progress, error -> error, else -> pending)
- TaskCreate: extracts `description` to `name`, defaults to pending status
- Uses the last TodoWrite event (replaces the full list each time, matching TodoWrite semantics)
- Updated TaskGrid render to use `derivedTasks` instead of `taskItems`

**`src/components/conversation/ConversationView.test.tsx`**
- Replaced 3 prop-based TaskGrid tests with 5 event-derived tests
- Added `makeAssistantWithToolUse` helper for creating tool_use events
- Tests cover: TodoWrite extraction, empty events, status mapping (completed/done -> done), multiple TodoWrite events (last wins), unknown status -> pending

### Test count
- Removed: 3 tests (prop-based taskItems)
- Added: 5 tests (event-derived tasks)
- Net: +2 tests
- All 853 tests pass, typecheck clean

### Concerns
- TaskUpdate tool handling is stubbed (comment in code). The spec did not define its input shape. If TaskUpdate events appear in real sessions, a follow-up task should define the expected behavior.
