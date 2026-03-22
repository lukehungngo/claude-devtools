# Bug Fix Result: TASK-005

## Bugs Fixed

### P1-1: WebSocket reconnect leaks connections (`useWebSocket.ts:21-23`)
- **File:** `dashboard/src/hooks/useWebSocket.ts`
- **Test:** No test runner configured
- **Fix:** Refactored to use a `connect()` function that sets up all handlers (onopen, onclose, onmessage). Reconnect calls `connect()` with exponential backoff (1s, 2s, 4s... capped at 30s). Tracks `unmountedRef` to prevent reconnect after unmount. Resets attempt counter on successful connection.

### P1-2: Stop button non-functional (`CommandDispatch.tsx:132-148`)
- **File:** `dashboard/src/components/viewer/CommandDispatch.tsx`
- **Test:** No test runner configured
- **Fix:** Added `AbortController` ref. Stop button's `onClick` calls `controller.abort()`. Abort signal passed to `fetch()`. On abort, appends "[Aborted]" to output.

### P1-3: liveEvents grows unbounded (`useEventStream.ts:38`)
- **File:** `dashboard/src/hooks/useEventStream.ts`
- **Test:** No test runner configured
- **Fix:** Capped `liveEvents` at 2000 entries. When exceeding, trims oldest entries via `slice()`.

### P1-4: Command output discarded (`CommandDispatch.tsx:60-62`)
- **File:** `dashboard/src/components/viewer/CommandDispatch.tsx`
- **Test:** No test runner configured
- **Fix:** CommandDispatch now manages its own `output` state array. SSE data appends to output. Output renders above input in a scrollable terminal-style area (monospace, `var(--bg-3)` background, max 200px height). Removed dependency on external `onOutput` callback.

### P2-1: Clear/Maximize buttons non-functional (`SessionViewer.tsx:126-141`)
- **File:** `dashboard/src/components/viewer/SessionViewer.tsx`
- **Test:** No test runner configured
- **Fix:** Removed both Clear and Maximize buttons. Kept only the permission mode indicator.

### P2-2: Empty useEffect for selectedAgent (`AgentLogs.tsx:393-398`)
- **File:** `dashboard/src/components/AgentLogs.tsx`
- **Test:** No test runner configured
- **Fix:** Removed the empty `useEffect` block entirely.

### P2-3: EventStream no virtualization
- **File:** `dashboard/src/components/viewer/EventStream.tsx`
- **Test:** No test runner configured
- **Fix:** Added MAX_VISIBLE cap of 500 events. When exceeded, shows last 500 events with a "Showing last 500 of N events" indicator.

### P2-4: Type bypass `null as unknown as string` (`AgentLogs.tsx:176-179`)
- **File:** `dashboard/src/components/AgentLogs.tsx`
- **Test:** No test runner configured
- **Fix:** Changed `null as unknown as string` to `""` (empty string). The caller already converts falsy values to `null` via `info.toolName || null`.

### P2-5: ErrorBlock never rendered (`EventStream.tsx`)
- **File:** `dashboard/src/components/viewer/EventStream.tsx`
- **Test:** No test runner configured
- **Fix:** Imported `ErrorBlock`. In `renderUserEvent`, added logic to detect `tool_result` items with `is_error: true` and render them as `ErrorBlock` components.

### P2-6: console.log debug statements
- **Files:** `dashboard/src/components/viewer/ToolCallBlock.tsx:98`, `dashboard/src/components/AgentLogs.tsx:277`
- **Test:** No test runner configured
- **Fix:** Replaced `console.log("[DevTools] open file:", ...)` with `// TODO: Phase 5+ would open in editor` comments.

### P2-7: Unused React import in TopBar
- **File:** `dashboard/src/components/TopBar.tsx:1`
- **Test:** No test runner configured
- **Fix:** Removed `import React from "react"`.

## Build Status
- Lint: PASS (0 errors, 12 pre-existing warnings in server/ -- out of scope)
- Typecheck: PASS (dashboard + server)
- Tests: No test runner configured

## Files Modified
- `dashboard/src/hooks/useWebSocket.ts`
- `dashboard/src/hooks/useEventStream.ts`
- `dashboard/src/components/viewer/CommandDispatch.tsx`
- `dashboard/src/components/viewer/SessionViewer.tsx`
- `dashboard/src/components/viewer/EventStream.tsx`
- `dashboard/src/components/AgentLogs.tsx`
- `dashboard/src/components/viewer/ToolCallBlock.tsx`
- `dashboard/src/components/TopBar.tsx`
