# Turn History — Implementation Spec

> Scope: Only the Turn History feature and parts that change to support it.
> Everything else (sidebar, topbar HUD metrics, conversation rendering, bottom panel tabs) stays as-is.

---

## What is Turn History

A **collapsible left panel** that lists all turns in the session. Clicking a turn:
1. Scrolls conversation to that turn's divider
2. Re-scopes the active bottom panel tab (Agent Graph, Tool Call, Raw Log) to that turn

The panel is **visible by default**, collapse state persisted in `localStorage`.

---

## Layout change

```
BEFORE:
┌──────────┬──────────────────────────────────────┐
│ Sidebar  │  Conversation (full width)            │
│          │                                       │
│          ├───────────────────────────────────────┤
│          │  Bottom Panel (Agent Graph / etc.)     │
└──────────┴───────────────────────────────────────┘

AFTER:
┌──────────┬────────────┬─────────────────────────┐
│ Sidebar  │  Turn      │  Conversation            │
│          │  History   │                           │
│          │  (260px)   │                           │
│          │            │                           │
│          │  [collap-  │                           │
│          │   sible]   │                           │
│          ├────────────┴─────────────────────────┤
│          │  Bottom Panel (Agent Graph / etc.)     │
└──────────┴──────────────────────────────────────┘
```

Only the center area changes. Sidebar untouched. Bottom panel untouched (already turn-scoped via `currentActiveTurnIndex`).

---

## New component: `TurnHistoryPanel`

### Location
`dashboard/src/components/TurnHistoryPanel.tsx`

### Props
```ts
interface TurnHistoryPanelProps {
  turns: Turn[];                    // all turns in session
  activeTurnIndex: number | null;   // currently selected turn (null = live/latest)
  onSelectTurn: (index: number) => void;
  isOpen: boolean;
  onToggle: () => void;
}
```

### Turn item — what to show

Each turn row displays:

```
┌─────────────────────────────────────────────┐
│ T65  implement turn stepper in topbar   now │
│ [PM] [EX]                     $0.26  40s   │
└─────────────────────────────────────────────┘
```

**Row 1:** Turn number (mono, accent when active) + prompt text (truncated) + relative time
**Row 2:** Agent dots (only when >1 agent) + cost + duration (right-aligned)

**NO tool call chips.** Only agent dots for multi-agent turns. Single-agent turns show nothing on row 2 except cost/duration.

### Active turn indicator
- Gold left border (`3px solid var(--acc)`)
- Background: `var(--acc-bg)`
- Turn number color: `var(--acc)`

### Running turn indicator
- Small green pulsing dot next to the time label on the latest turn (if session is live)

### Data source
Turns already exist in the session data. The turn model:

```ts
// Already available from session events
interface TurnForHistory {
  index: number;           // position in session
  turnNumber: number;      // T65, T66, etc.
  prompt: string;          // user message text (first line, truncated)
  duration: string;        // formatted duration
  cost: string;            // formatted cost
  agents: AgentSummary[];  // agents active in this turn
  isRunning: boolean;      // true if this turn is still in progress
  relativeTime: string;    // "now", "1h", "3h ago"
}

interface AgentSummary {
  name: string;    // "PM", "SWE", "EX"
  color: string;   // CSS variable for agent color
  bgColor: string; // CSS variable for agent bg color
}
```

---

## Collapse behavior

### Toggle button
- When open: `‹` chevron in the panel header → collapses panel
- When closed: `☰` hamburger button appears in a thin bar at the top of conversation area → reopens panel

### Animation
- CSS transition: `width 0.25s ease, min-width 0.25s ease`
- Open width: `260px`
- Closed width: `0px` (fully hidden, border-right removed)

### Persistence
```ts
// On toggle:
localStorage.setItem('turnHistoryOpen', JSON.stringify(isOpen));

// On mount:
const saved = localStorage.getItem('turnHistoryOpen');
const defaultOpen = saved !== null ? JSON.parse(saved) : true; // default: open
```

---

## Click behavior: turn selection

When user clicks a turn in the panel:

1. **Set `selectedTurnIndex`** — this already exists in `SessionPage.tsx` / `AppLayout.tsx`
2. **Conversation scrolls** — call `scrollToTurnDivider(turnIndex)` to scroll the conversation panel to that turn's `TurnDivider` element
3. **Bottom panel syncs** — already handled by `currentActiveTurnIndex` → `filterDagForTurn` in Agent Graph, turn-scoped filtering in Tool Call and Raw Log

No new state machinery needed. The `selectedTurnIndex` → `currentActiveTurnIndex` flow already exists and drives all bottom panel tabs.

---

## Topbar stepper integration

The existing `ViewingTurnPill` in `TopBar.tsx` already shows which turn is selected. The Turn History panel is an additional navigation surface — both control the same `selectedTurnIndex` state.

When stepping with `◀ T65 ▶` in the topbar:
- Turn History panel highlights the new active turn and scrolls it into view
- Conversation scrolls to that turn
- Bottom panel syncs

This is the same `onSelectTurn` callback, just triggered from a different UI element.

---

## Scope indicator in bottom panel

Add a small scope pill in the bottom panel tab bar (right-aligned):

```
Agent Graph | Tool Call | Raw Log | Cost          Scoped to [T65]
```

**Component:** Inline in `BottomPanel.tsx` tab bar
**Content:** `Scoped to T{turnNumber}` — only shown when a specific turn is selected (not when following live/latest)
**Style:** `font-family: mono, font-size: 10px, color: var(--t3)` with the turn number in a small pill (`background: var(--acc-bg), color: var(--acc)`)

---

## Files to change

| File | Change | Effort |
|------|--------|--------|
| `dashboard/src/components/TurnHistoryPanel.tsx` | **NEW** — the panel component | ~3h |
| `dashboard/src/routes/SessionPage.tsx` | Add `TurnHistoryPanel` to layout, manage `isOpen` state, pass turn data | ~1h |
| `dashboard/src/components/bottom-panel/BottomPanel.tsx` | Add scope pill in tab bar | ~30m |
| `dashboard/src/styles/globals.css` | Add Turn History panel styles (or use CSS modules) | ~30m |

### Files NOT changed
- `TopBar.tsx` — turn stepper already spec'd separately, no dependency on Turn History panel
- `ConversationView.tsx` — turn dividers already exist and are clickable
- `TraceTab.tsx` / `RawLogTab.tsx` / `ToolCallTab.tsx` — already turn-scoped via `currentActiveTurnIndex`
- Sidebar — untouched
- Any data layer — turns already available from session events

---

## Estimated total effort

~5 hours for a senior engineer familiar with the codebase.

Breakdown:
- TurnHistoryPanel component: 3h (layout, scroll sync, collapse animation, localStorage)
- Layout integration in SessionPage: 1h (flex layout, state wiring)
- Bottom panel scope pill: 30m
- Styling + polish: 30m

---

## Edge cases

1. **0 turns (empty session):** Show empty state: "No turns yet" centered in panel
2. **Very long prompts:** Truncate with `text-overflow: ellipsis` at 1 line
3. **100+ turns:** Virtual scrolling not needed at this scale — native overflow-y: auto is fine up to ~500 items
4. **Live session, new turn arrives:** If following latest (no explicit selection), auto-scroll the turn list to bottom. If viewing a past turn, don't auto-scroll — just append the new turn at the bottom
5. **Turn selected in conversation (via TurnDivider click):** Turn History panel highlights that turn and scrolls it into view. Same `selectedTurnIndex` state.
6. **Panel collapsed + turn selected:** Selection still works — bottom panel and conversation still sync. Panel just isn't visible.
7. **Resize / responsive:** Panel has fixed 260px width. On very narrow screens (<900px total), consider auto-collapsing. Not critical for v1.