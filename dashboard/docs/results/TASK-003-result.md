## TASK-003 Result: Wire tool stats from ToolEntries to AgentCard

### Summary
Added `extractToolStatsFromResult()` helper that parses tool usage patterns (e.g., "Read x11", "Grep x6") from agent dispatch result content, and wired it into the AgentCard render in ToolEntryRow via the `toolStats` prop.

### Files Modified
- `src/components/conversation/ToolEntries.tsx` -- Added `extractToolStatsFromResult()` export and wired `toolStats` prop to AgentCard
- `src/components/conversation/ToolEntries.test.tsx` -- Added 9 tests (7 unit tests for extraction, 2 integration tests for wiring)

### Test Count Added
9 new tests (all passing, 873 total)

### Details
- `extractToolStatsFromResult(content)` handles both `string` and `unknown[]` (content block arrays)
- Regex pattern: `/([A-Z][a-zA-Z]*)\s*[x x](\d+)/g` matches "Read x11", "Grep x6", "Edit x3"
- Returns empty array for unparseable content (no false positives)
- `cost` prop intentionally not wired (no per-agent cost data in events, per spec)

### Concerns
- The regex only matches capitalized tool names followed by x/xN. If Claude Code changes its stat format, this parser would need updating. This is acceptable since it degrades gracefully (returns empty array).
