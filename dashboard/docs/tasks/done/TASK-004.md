# TASK-004: Add tool-specific badge colors to CollapsedGroupRow

## Objective
Change the count badge in CollapsedGroupRow from generic gray to tool-type-specific colors matching the mockup.

## Routing
routing: Engineer directly — CSS color change in existing component

## Files
- `dashboard/src/components/conversation/ToolEntries.tsx` (modify)
- `dashboard/src/components/conversation/ToolEntries.test.tsx` (modify)

## Approach
1. Add a helper `getToolBadgeColors(toolName: string): {bg: string, text: string}` in ToolEntries.tsx
2. Color map (check globals.css for actual CSS var names):
   - Read/Glob/ListDir: `{bg: "var(--teal-dim, var(--bg-h))", text: "var(--teal, var(--t3))"}`
   - Grep/WebSearch: `{bg: "var(--acc-bg, var(--bg-h))", text: "var(--acc, var(--t3))"}`
   - Bash/Execute: `{bg: "var(--amb-bg, var(--bg-h))", text: "var(--amb, var(--t3))"}`
   - Edit/Write: `{bg: "var(--grn-bg, var(--bg-h))", text: "var(--grn, var(--t3))"}`
   - Default: `{bg: "var(--bg-h)", text: "var(--t3)"}`
3. In CollapsedGroupRowInner (line ~410-419), replace the hardcoded `background: "var(--bg-h)"` and `color: "var(--t3)"` with colors from `getToolBadgeColors(group.name)`
4. Check `globals.css` for actual variable names — they might be `--teal-bg`, `--teal-dim`, etc.

## Acceptance Criteria
- Read group badge has teal-tinted background and teal text
- Grep group badge has accent-tinted background and accent text
- Different tool types have visually distinct badge colors
- `cd dashboard && pnpm test -- --grep "ToolEntries"` passes

## Do Not Touch
- AgentCard.tsx
- Other component files
