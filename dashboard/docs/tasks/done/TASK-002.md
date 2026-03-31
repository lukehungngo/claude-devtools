# TASK-002: Add per-tool-type stat badges to AgentCard

## Objective
Replace generic `toolCount` with per-tool-type stat badges like the mockup: "Read ×11", "Grep ×6", "Bash ×4".

## Routing
routing: Engineer directly — known React component pattern

## Files
- `dashboard/src/components/conversation/AgentCard.tsx` (modify)
- `dashboard/src/components/conversation/AgentCard.test.tsx` (modify)

## Approach
1. Replace `toolCount?: number` prop with `toolStats?: Array<{name: string, count: number}>`
2. In the header div, after the description span and before ExpandHint, render toolStats as pill badges
3. Each badge: `<span>` with `style={{ background: "var(--bg-h)", fontSize: 10, fontFamily: "var(--font-mono)", padding: "2px 6px", borderRadius: "var(--radius)", color: "var(--t2)" }}` 
4. Format text as `${name} ×${count}`
5. Keep `cost` prop, render in yellow mono: `<span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--amb)" }}>`
6. Remove old `statParts` logic that joins `${toolCount} tools`
7. Keep `durationMs` in stats line if provided

## Acceptance Criteria
- `toolStats={[{name:"Read",count:11},{name:"Grep",count:6}]}` renders two badge elements
- Each badge shows "Read ×11", "Grep ×6"
- `cost={6.67}` renders "$6.67" in amber color
- Existing tests still pass (some may need updating for prop changes)
- `cd dashboard && pnpm test -- --grep "AgentCard"` passes

## Do Not Touch
- ToolEntries.tsx (that's TASK-003)
- Any other component files
