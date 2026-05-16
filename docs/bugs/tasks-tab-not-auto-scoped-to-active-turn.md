# Bug: Tasks tab does not auto-scope to the active turn (whole-session by default)

**Severity:** P2 — confusing UX, inconsistent with conversation pane focus
**Filed:** 2026-05-16
**Reported version:** v0.3.12
**Reporter symptom:** "Why is the list of tasks not scoped to turn but I think it's the whole session?"

**Status of related doc:** `docs/bugs/tasks-not-scoped-to-turn.md` (Phase 1) was implemented — explicit turn clicks DO scope the Tasks tab. This doc covers Phase 2 — making the default (no explicit click) scope to the active turn instead of falling through to whole-session.

## Symptom

Opening a session with many turns, the Tasks tab in the bottom panel shows a long cumulative task list (e.g. 56 entries spanning T-001..T-056) and a count of `48/56 completed`. The user is looking at the latest turn (T46 in the conversation pane is the rightmost / scrolled-into-view turn), but the Tasks tab is unscoped — no "Scoped to T<N>" label, no narrowing of the list.

Clicking an older turn (e.g. T34) in the turn-history sidebar does narrow the list (45 tasks, "Scoped to T34" label appears). But the default view ignores the conversation pane's anchor.

## Why this is wrong

The conversation pane is anchored on `effectiveTurnIndex` (last turn by default). Every other surface in the bottom panel takes its cue from that anchor — except the Tasks tab, which falls through to whole-session cumulative state when no explicit turn is clicked.

Result: user has to know to click a turn divider to get the Tasks tab to "wake up" and scope. Without that click, the Tasks tab is silently showing whole-session — no UI hint that scoping even exists.

## Root cause (verified)

`dashboard/src/components/bottom-panel/BottomPanel.tsx` (pre-fix, around line 140):

```ts
const sessionTasks = useMemo(
  () =>
    viewingTurnNumber !== undefined
      ? getTasksAtTurn(tasksByTurn, viewingTurnNumber)
      : deriveSessionTasks(events),       // ← whole-session fallback
  [tasksByTurn, viewingTurnNumber, events],
);
```

And the "Scoped to T<N>" label (around line 331) gated on the same condition:

```tsx
{viewingTurnNumber !== undefined && (
  ...Scoped to T{viewingTurnNumber}...
)}
```

`viewingTurnNumber` is driven by `SessionPage.tsx:289-294`:

```ts
useEffect(() => {
  const turnNumber =
    selectedTurnIndex != null ? turns[selectedTurnIndex]?.turnNumber : undefined;
  setViewingTurnNumber(turnNumber);
}, [selectedTurnIndex, turns, setViewingTurnNumber]);
```

`selectedTurnIndex` is `null` until the user explicitly clicks a turn divider — so the default state is `viewingTurnNumber = undefined` → Tasks tab unscoped → label hidden.

Meanwhile two lines above (`SessionPage.tsx:270-273`):

```ts
const effectiveTurnIndex = useMemo(
  () => selectedTurnIndex ?? (turns.length > 0 ? turns.length - 1 : null),
  [selectedTurnIndex, turns.length],
);
```

`effectiveTurnIndex` falls back to the last turn — and is what drives the Detail/Raw/Trace tabs in the bottom panel. The Tasks tab is the odd one out.

## Verified evidence (empirical)

Live browser test on session `23ba0306-...`:

| User action | URL | `viewingTurnNumber` | Pill | Tasks tab count |
|---|---|---|---|---|
| Open session (no click) — viewing T46 implicit | `/session/.../23ba0306-…` | `undefined` | none | **56** (`48/56 completed`) |
| Click T34 in turn-history sidebar | (same URL) | `34` | "T34" + "Scoped to T34" | **45** (`43/45 completed`) |

Scoping mechanically works when triggered. The bug is that it's not auto-triggered.

## Fix

`dashboard/src/components/bottom-panel/BottomPanel.tsx` — two changes inside one file, no API/prop changes elsewhere.

```diff
+ // Default scope to the latest turn when the user hasn't explicitly clicked one.
+ // Keeps the Tasks tab aligned with whatever turn the conversation pane is
+ // anchored on (effectiveTurnIndex). Without this, Tasks falls through to
+ // deriveSessionTasks (whole-session cumulative), which is out of sync.
+ const lastTurnNumber = turns.length > 0 ? turns[turns.length - 1].turnNumber : undefined;
+ const effectiveScopeTurn = viewingTurnNumber ?? lastTurnNumber;

  const sessionTasks = useMemo(
    () =>
-     viewingTurnNumber !== undefined
-       ? getTasksAtTurn(tasksByTurn, viewingTurnNumber)
+     effectiveScopeTurn !== undefined
+       ? getTasksAtTurn(tasksByTurn, effectiveScopeTurn)
        : deriveSessionTasks(events),
-   [tasksByTurn, viewingTurnNumber, events],
+   [tasksByTurn, effectiveScopeTurn, events],
  );
```

And widen the "Scoped to T<N>" label gate to use `effectiveScopeTurn`:

```diff
- {viewingTurnNumber !== undefined && (
+ {effectiveScopeTurn !== undefined && (
    ...Scoped to T{effectiveScopeTurn}...
  )}
```

## Notes on what was deliberately NOT changed

- **`TopBar.tsx` pill** — kept user-driven (only shows when user explicitly clicks an older turn) and dismissible. Making it ambient would break the "click X to clear" UX because the value would immediately re-default to the active turn, so the dismiss action would do nothing visible.
- **`SessionPage.tsx`** — `viewingTurnNumber` source logic stays. The change is local to BottomPanel so other consumers of `viewingTurnNumber` keep their current "user explicitly scoped" semantics.

## Mathematical note

At the latest turn, `getTasksAtTurn(byTurn, lastTurnNumber)` returns the same data as `deriveSessionTasks(events)` (cumulative-at-latest ≡ whole-session-cumulative). So the **count does not change** at the latest turn. What the user gains is:

1. A visible "Scoped to T<N>" label proving the data IS scoped.
2. Consistent behavior when navigating to older turns — no surprise transition from "whole session" to "scoped".
3. Architectural cleanliness — Tasks tab now follows the same anchor as Detail/Raw/Trace.

## Regression test (implemented)

`dashboard/src/components/bottom-panel/BottomPanel.test.tsx` — new `describe("Tasks tab auto-scoping")` block:

1. `auto-scopes Tasks to the latest turn when viewingTurnNumber is undefined` — render with turns=[1,2,3] and TaskCreate events in T1+T2, no clicks. Assert "Scoped to T3" label visible and tasks list length = 2.
2. `respects explicit viewingTurnNumber over auto-scope` — same events, explicit `viewingTurnNumber=1`. Assert "Scoped to T1" label and tasks list length = 1.
3. `hides the scope label and shows no tasks when turns is empty` — `turns=[]`. Assert no label, no tasks.

Test 1 fails on master (`Scoped to` label not rendered when `viewingTurnNumber=undefined`); passes with the fix.

## Related

- `docs/bugs/tasks-not-scoped-to-turn.md` — Phase 1, implemented. Should be marked superseded by this Phase 2 doc.
- Sidechain contamination (subagent `TaskCreate` calls merging into main's list) — separate ticket, still unaddressed.
