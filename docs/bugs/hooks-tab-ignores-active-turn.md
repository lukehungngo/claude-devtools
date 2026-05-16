# Bug G: Hooks tab ignores active turn (whole-session always)

**Severity:** P2 — confusing UX, inconsistent with conversation pane focus and with sibling tabs (Tasks, Detail) that DO scope to the active turn.
**Filed:** 2026-05-17
**Reporter symptom:** "Why does the Hooks tab still show every hook in the session when I click an older turn? Other tabs narrow down."

## Symptom

Opening a session with N turns, the Hooks tab in the bottom panel shows every hook attachment from the whole session — regardless of which turn the conversation pane is anchored on, and regardless of explicit turn clicks in the turn-history sidebar.

The Tasks tab and Detail tab in the same bottom panel both scope to the active turn (via `activeTurnIndex` / `viewingTurnNumber`). The Hooks tab is the odd one out: clicking turn dividers produces no change in the hooks list or the summary stats (`N hooks`, `avg ms`, `total Xs`).

## Root cause (verified)

`dashboard/src/components/bottom-panel/HooksTab.tsx:312-322` (pre-fix):

```ts
export function HooksTab({
  events = [],
  activeTurnIndex: _,     // ← prop received but explicitly renamed to `_` and ignored
  onHookHover,
  highlightedHookId = null,
  liveHooks,
}: HooksTabProps): JSX.Element {
  const rows = useMemo<HookRow[]>(() => {
    return events.filter(isHookAttachment).map(toRow).filter((r): r is HookRow => r !== null);
  }, [events]);
```

The `activeTurnIndex: _` destructure is the antipattern: the prop was added to the interface and threaded through `BottomPanel.tsx` so the call site looks correct, but inside the component it's renamed to `_` so the unused-variable lint stays quiet. The `useMemo` then reads the unscoped `events` prop and the whole-session list flows through.

`BottomPanel.tsx` was also missing the `turns` prop forward — `HooksTab` had no way to translate `activeTurnIndex` (a number) into a `(startIndex, endIndex)` event range without it, so even if the destructure were fixed the component had no event-slice helper to lean on. Sibling tabs (`DetailTab`) take `turns` + `activeTurnIndex` and call `getEventsForTurn(turn, allEvents)` from `dashboard/src/lib/turnSnapshot.ts`. That's the established pattern — `HooksTab` just didn't follow it.

## Fix

`dashboard/src/components/bottom-panel/HooksTab.tsx` — add `turns` to props, consume `activeTurnIndex`, and scope the events via `getEventsForTurn` before filtering for hook attachments.

```diff
  import type { LiveHookState } from "../../lib/streaming-types";
  import { formatDuration } from "../../lib/cost";
+ import { getEventsForTurn } from "../../lib/turnSnapshot";
+ import type { TurnSnapshot } from "../../lib/turnSnapshot";

  interface HooksTabProps {
    events?: SessionEvent[];
+   /**
+    * Turn snapshots used to scope the hooks list to a single turn when
+    * `activeTurnIndex` resolves to a valid index. Absent / empty falls back
+    * to the whole-session view (Bug G — same pattern other tabs use).
+    */
+   turns?: TurnSnapshot[];
    /** Currently viewed turn — filters hooks to that turn when set. */
    activeTurnIndex?: number | null;
    ...
  }

  export function HooksTab({
    events = [],
-   activeTurnIndex: _,
+   turns = [],
+   activeTurnIndex,
    onHookHover,
    highlightedHookId = null,
    liveHooks,
  }: HooksTabProps): JSX.Element {
    const rows = useMemo<HookRow[]>(() => {
+     // Bug G — scope JSONL hook rows to the active turn when one is selected.
+     // Falls back to the whole session when turns/activeTurnIndex are absent
+     // or out of range. liveHooks are merged separately below so in-flight
+     // entries attach to whatever scope view is current.
+     const scopedEvents =
+       activeTurnIndex != null && turns[activeTurnIndex]
+         ? getEventsForTurn(turns[activeTurnIndex], events)
+         : events;
-     return events.filter(isHookAttachment).map(toRow).filter((r): r is HookRow => r !== null);
+     return scopedEvents
+       .filter(isHookAttachment)
+       .map(toRow)
+       .filter((r): r is HookRow => r !== null);
-   }, [events]);
+   }, [events, turns, activeTurnIndex]);
```

`dashboard/src/components/bottom-panel/BottomPanel.tsx` — forward `turns` to `HooksTab` (the prop is already destructured at the BottomPanel function signature for other tabs):

```diff
              ) : activeTab === "hooks" ? (
                <HooksTab
                  events={events}
+                 turns={turns}
                  activeTurnIndex={activeTurnIndex}
                  onHookHover={onHookHover}
                  highlightedHookId={highlightedHookId}
                  liveHooks={liveHooks}
                />
```

## Edge cases

1. **`turns` empty or `activeTurnIndex == null`** → falls back to whole-session view. Preserves behavior for callers that don't have turn data (test fixtures, future surfaces).
2. **`activeTurnIndex` out of range** (e.g. `turns[99]` when only 3 turns exist) → `turns[activeTurnIndex]` is `undefined`, the ternary falls through to `events`. No crash, no empty render — same whole-session fallback. Verified by regression test "falls back to whole session when activeTurnIndex is out of range".
3. **Turn with zero hook attachments** (e.g. T2 in the fixture) → `scopedEvents.filter(isHookAttachment)` returns `[]` → the existing empty-state branch (`rows.length === 0 && visibleLiveHooks.length === 0`) renders the "No hook executions recorded for this session." copy. (Copy could be sharpened to "for this turn" in a follow-up, but the gating logic is correct.)
4. **`liveHooks` independent of scoping** — `useVisibleLiveHooks` operates on the SDK-streamed map keyed by `hook_id`, untouched by the new event-slice. In-flight hooks remain visible in any scope view, which matches "live hooks attach to whatever scope view is current" from the spec.

## Regression tests

`dashboard/src/components/bottom-panel/HooksTab.test.tsx` — new `describe("HooksTab activeTurnIndex scoping (Bug G)")` block with five tests built on a 3-turn fixture (hooks in T1 and T3, none in T2):

1. `defaults to active turn — last turn` — `activeTurnIndex=2` → only T3's hook visible.
2. `scopes to clicked turn` — `activeTurnIndex=0` → only T1's hook visible.
3. `falls back to whole session when turns/activeTurnIndex absent` — no props → all hooks visible.
4. `shows empty state for a turn with no hooks (T2)` — `activeTurnIndex=1` → empty-state copy.
5. `falls back to whole session when activeTurnIndex is out of range` — `activeTurnIndex=99` → whole-session fallback.

**Both-directions verification:** With the HooksTab.tsx fix stashed, tests 1, 2, and 4 fail (whole-session rows leak into scoped views). With the fix restored, all 5 pass.

## Related

- `docs/bugs/tasks-tab-not-auto-scoped-to-active-turn.md` — same pattern, fixed earlier. This bug is the Hooks-tab analogue.
- `dashboard/src/components/bottom-panel/DetailTab.tsx` — reference for the `getEventsForTurn(turn, allEvents)` consumption pattern.
- `dashboard/src/lib/turnSnapshot.ts` — `getEventsForTurn` helper; uses `turn.startIndex` + `turn.endIndex` for an O(1) slice.
