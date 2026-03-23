# Bug Fix Result: TASK-008

## Bugs Fixed
### Bug 1: SSE streaming parser drops stdout responses at chunk boundaries
- **File:** dashboard/src/components/viewer/CommandDispatch.tsx:57-78
- **Test:** dashboard/src/lib/parseSSELines.test.ts (7 tests covering chunk splitting, partial lines, multi-byte safety)
- **Fix:** Added line buffer to accumulate partial lines across chunks; pass `{ stream: true }` to `decoder.decode()`

### Bug 2: React key warning from duplicate UUIDs in AgentLogs
- **File:** dashboard/src/components/AgentLogs.tsx:630,638
- **Test:** dashboard/src/components/AgentLogs.key-uniqueness.test.ts (2 tests confirming duplicate UUIDs from data layer)
- **Fix:** Changed `key={entry.uuid}` to `key={`${entry.uuid}-${i}`}` using map index for uniqueness

## Build Status
- Lint: N/A (not run per CLAUDE.md: "No linter configured" note, though eslint exists)
- Typecheck: PASS (dashboard clean; server has pre-existing vitest module errors unrelated to changes)
- Tests: PASS (61 total, 9 new)

## Files Modified
- dashboard/src/components/viewer/CommandDispatch.tsx
- dashboard/src/components/AgentLogs.tsx
- dashboard/src/lib/parseSSELines.ts (new - extracted SSE line parser utility)
- dashboard/src/lib/parseSSELines.test.ts (new - 7 tests)
- dashboard/src/components/AgentLogs.key-uniqueness.test.ts (new - 2 tests)
