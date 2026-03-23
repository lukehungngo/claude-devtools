# Bug Fix Result: TASK-009

## Bugs Fixed

### Bug 1: Server leaves stdin open after spawn, causing 3s warning
- **File:** server/src/http/routes.ts:208
- **Test:** server/src/http/routes-command.test.ts: "should call child.stdin.end() after spawn to prevent stdin warning"
- **Fix:** Added `child.stdin.end()` immediately after `spawn()` call so Claude CLI does not wait 3s for stdin input

### Bug 2: Frontend does not filter known stderr warnings
- **File:** dashboard/src/components/viewer/CommandDispatch.tsx:71
- **Test:** dashboard/src/lib/filterStderrWarnings.test.ts (5 tests) + dashboard/src/components/viewer/CommandDispatch.test.ts: "should filter stderr lines containing known harmless warnings"
- **Fix:** Created `isIgnoredStderrWarning()` utility and used it to skip "no stdin data received" and "redirect stdin explicitly" warnings in the SSE parsing loop

### Bug 3: Frontend does not handle done/error SSE event types
- **File:** dashboard/src/components/viewer/CommandDispatch.tsx:71
- **Test:** dashboard/src/components/viewer/CommandDispatch.test.ts: "should handle done events with non-zero exit codes" + "should handle error events from the SSE stream"
- **Fix:** Added handling for `data.type === "done"` (shows exit code on non-zero) and `data.type === "error"` (shows error message) in the SSE parsing loop

## Build Status
- Lint: N/A (not run per CLAUDE.md: "No linter configured" note)
- Typecheck: PASS (both server and dashboard)
- Tests: PASS (79 server + 69 dashboard = 148 total, 9 new)

## Files Modified
- server/src/http/routes.ts -- added `child.stdin.end()` after spawn
- server/src/http/routes-command.test.ts -- new test file
- dashboard/src/components/viewer/CommandDispatch.tsx -- filter stderr warnings, handle done/error events
- dashboard/src/components/viewer/CommandDispatch.test.ts -- new test file
- dashboard/src/lib/filterStderrWarnings.ts -- new utility
- dashboard/src/lib/filterStderrWarnings.test.ts -- new test file
