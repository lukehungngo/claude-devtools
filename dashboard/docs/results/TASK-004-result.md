## TASK-004 Result: Tool-specific badge colors for CollapsedGroupRow

### Summary
Added tool-type-specific colors to the count badge in `CollapsedGroupRow`. Previously all badges used generic `var(--bg-h)` / `var(--t3)`. Now badges match the HTML mockup with color-coded backgrounds per tool category.

### Color mapping
| Tool category | Background | Text |
|---|---|---|
| Read, Glob, ListDir, ls, tree | `var(--teal-dim)` | `var(--teal)` |
| Grep, WebSearch, WebFetch | `var(--accent-dim)` | `var(--accent)` |
| Bash, Execute | `var(--yellow-dim)` | `var(--yellow)` |
| Edit, Write | `var(--green-dim)` | `var(--green)` |
| Unknown | `var(--bg-h)` | `var(--t3)` |

### Files modified
- `src/components/conversation/ToolEntries.tsx` -- added exported `getToolBadgeColors()` helper, wired into `CollapsedGroupRowInner`
- `src/components/conversation/ToolEntries.test.tsx` -- added 11 new tests (9 unit tests for `getToolBadgeColors`, 2 integration tests for rendered badge colors)

### Test count added
11 new tests (864 total, all passing)

### Verification
- `pnpm test` -- 864/864 pass
- `npx tsc --noEmit` -- clean
- No debug prints, TODOs, or commented-out code
