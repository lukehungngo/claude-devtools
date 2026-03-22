# Bug Fix Result: TASK-007

## Bugs Fixed

### Bug 1: EventStream.tsx item.text.trim() crash
- **File:** dashboard/src/components/viewer/EventStream.tsx:144
- **Test:** Covered indirectly via component guard; primary crash path is through AgentLogs
- **Fix:** Changed `item.text.trim()` to `(item.text || "").trim()`

### Bug 2: EventStream.tsx text={item.text} passes undefined to ResponseBlock
- **File:** dashboard/src/components/viewer/EventStream.tsx:146
- **Test:** Covered indirectly via ResponseBlock early-return guard
- **Fix:** Changed `text={item.text}` to `text={item.text || ""}`

### Bug 3: AgentLogs.tsx content.thinking.slice(0, 120) crash
- **File:** dashboard/src/components/AgentLogs.tsx:174
- **Test:** dashboard/src/__tests__/null-property-access.test.ts: "Bug 3: should not crash when thinking content has undefined/null thinking field"
- **Fix:** Changed `content.thinking.slice(0, 120)` to `(content.thinking || "").slice(0, 120)`

### Bug 4: AgentLogs.tsx content.text.slice(0, 120) crash (assistant)
- **File:** dashboard/src/components/AgentLogs.tsx:180
- **Test:** dashboard/src/__tests__/null-property-access.test.ts: "Bug 4: should not crash when text content has undefined/null text field"
- **Fix:** Changed `content.text.slice(0, 120)` to `(content.text || "").slice(0, 120)`

### Bug 5: AgentLogs.tsx content.text.slice(0, 120) crash (user event)
- **File:** dashboard/src/components/AgentLogs.tsx:235
- **Test:** dashboard/src/__tests__/null-property-access.test.ts: "Bug 5: should not crash when user text content has undefined/null text field"
- **Fix:** Changed `content.text.slice(0, 120)` to `(content.text || "").slice(0, 120)`

### Bug 6: ResponseBlock.tsx text.trim() crash when text is null/undefined
- **File:** dashboard/src/components/viewer/ResponseBlock.tsx:6
- **Test:** Guarded at call sites (EventStream passes `|| ""`), plus added early-return `if (!text || !text.trim())`
- **Fix:** Changed `if (!text.trim())` to `if (!text || !text.trim())`

### Bug 7: AgentLogs.tsx content.name.startsWith crash (tool_use with undefined name)
- **File:** dashboard/src/components/AgentLogs.tsx:149
- **Test:** dashboard/src/__tests__/null-property-access.test.ts: "Bug 8: should not crash when tool_use has undefined name"
- **Fix:** Added `const name = content.name || ""` before string operations

### Bug 8: ToolCallBlock.tsx toolUse.input and toolUse.name could be undefined
- **File:** dashboard/src/components/viewer/ToolCallBlock.tsx:10-18, 38, 68, 73-74, 96
- **Fix:** Guarded `toolUse.input || {}` in extractFilePath/extractCommand, `toolUse.name || ""` throughout component

## Build Status
- Lint: N/A (not run, no lint script configured for dashboard)
- Typecheck: PASS (both server and dashboard, zero errors)
- Tests: PASS (7 total, 7 new)

## Files Modified
- dashboard/src/components/viewer/EventStream.tsx
- dashboard/src/components/viewer/ResponseBlock.tsx
- dashboard/src/components/viewer/ToolCallBlock.tsx
- dashboard/src/components/AgentLogs.tsx
- dashboard/src/__tests__/null-property-access.test.ts (new - test file)
