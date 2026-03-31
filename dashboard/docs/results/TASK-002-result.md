## TASK-002 Result: Per-tool-type stat badges on AgentCard

### Summary
Replaced the generic `toolCount` number prop with `toolStats` array prop on AgentCard. Tool usage now renders as individual pill badges (e.g., "Read x11", "Grep x6") in the header line, matching the v5 compact agent response mockup. Cost renders as a separate amber badge. Duration remains in the stats line below.

### Files Modified
- `/dashboard/src/components/conversation/AgentCard.tsx` -- Interface change (`toolCount` -> `toolStats`), badge rendering in header, cost badge, simplified stats line to duration-only
- `/dashboard/src/components/conversation/AgentCard.test.tsx` -- Updated old `toolCount` test, added 2 new tests for badge rendering and cost display

### Test Count
- 2 new tests added
- 1 existing test updated (stats line test now checks duration only)
- Total: 18 AgentCard tests passing, 853 total suite passing

### Concerns / Follow-ups
- The `ToolEntries.tsx` caller does not yet pass `toolStats` to AgentCard -- it will need a follow-up task to compute per-tool-type counts from agent sub-events and pass them through
- The removed `hasStats` variable was dead code after the refactor (stats line now only depends on `durationMs`)
