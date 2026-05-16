# TASK-C3 (FU-3) — Hook↔tool_use hover correlation

## Summary

Bidirectional hover correlation between Hooks-tab rows and tool_use blocks
in the conversation. Hovering a hook row outlines the matching tool block
in purple; hovering a tool block tints the matching hook row's background.

State is held at the common ancestor (AppLayout) and exposed through
LayoutContext. Leaf components (ToolEntryRow, ToolCallBlock) read the
highlight directly from context so per-hover updates do NOT bust the
MemoTurnCard memoization (advisor recommendation).

## Files modified

- `dashboard/src/contexts/LayoutContext.ts` — added
  `highlightedToolUseId`, `setHighlightedToolUseId`, `highlightedHookId`,
  `setHighlightedHookId`.
- `dashboard/src/contexts/LayoutContext.test.ts` — updated mock value.
- `dashboard/src/__tests__/group5-wiring.test.tsx` — updated mock value.
- `dashboard/src/routes/AppLayout.tsx` — added two `useState` for highlight
  state; pass `onHookHover` + `highlightedHookId` to BottomPanel; expose
  both via LayoutContext.
- `dashboard/src/components/bottom-panel/BottomPanel.tsx` — accept and
  forward `onHookHover` + `highlightedHookId` to HooksTab. (Only the props
  and the HooksTab JSX site — TABS array left untouched for B5.)
- `dashboard/src/components/bottom-panel/HooksTab.tsx` — accept new props;
  wire `onMouseEnter`/`onMouseLeave` on each row (fires only when
  `toolUseID` is truthy); apply `var(--purple-dim)` background tint on
  matching row.
- `dashboard/src/components/viewer/ToolCallBlock.tsx` — accept
  `highlighted?: boolean` + `onToolHover?` props; add
  `data-testid="tool-call-{toolUseId}"`; render a 2px `var(--purple)`
  outline when highlighted; bubble id on mouseenter/leave.
- `dashboard/src/components/conversation/ToolEntries.tsx` —
  `ToolEntryRow` (the live render path) reads highlight from LayoutContext,
  applies the same outline, and bubbles id on hover. data-testid mirrors
  the ToolCallBlock pattern (`tool-call-{entry.id}`).

## Files created

- `dashboard/src/components/viewer/ToolCallBlock.test.tsx` — 4 new tests
  covering data-testid, highlighted outline, no-highlight default, and
  hover callback fire-on-enter/null-on-leave.

## Tests added

- HooksTab.test.tsx (+4 tests, 19 total):
  - fires `onHookHover` with `toolUseID` on row mouseenter
  - fires `onHookHover` with `null` on row mouseleave
  - does NOT fire when row has no `toolUseID` (cancelled hook)
  - tints the matching row when `highlightedHookId` matches
- ToolCallBlock.test.tsx (new, +4 tests): see above.

Total new tests: **+8**.

## Verification

```
pnpm vitest run src/components/bottom-panel/HooksTab.test.tsx
# 19 passed (19)

pnpm vitest run src/components/viewer
# 38 passed (38)

npx tsc -p dashboard --noEmit
# clean
```

Full suite (`dashboard/src/components/conversation`, `bottom-panel`,
`contexts`, `viewer`): 529 passing tests, no regressions.

## Notes & follow-ups

**Prop drilling depth — would context help later?** Already migrated to
context. The original spec described drilling through
`MemoTurnCard → TurnCard → TurnRow → ToolEntries → ToolEntryRow`, which
would have busted the `MemoTurnCard` memoization on every hover (530+ rows
re-rendering at 60Hz). Instead, `ToolEntryRow` and `ToolCallBlock` read
the highlight from `LayoutContext` directly. Drilling depth: **zero**.

**Pre-existing rules-of-hooks lint error.** `ToolEntries.tsx:441`
flags the existing `useState` call as conditional (after the `isAgentDispatch`
early return). I refactored my new `useContext` call to live above that
early return so the new code is hooks-rule compliant; the pre-existing
warning at line 441 is unchanged and out of scope for this task.

**StreamingTurnArea.test.tsx failures (3) seen in full-suite run** belong
to TASK-B4 (PreCompact attribution) currently in flight; verified pre-
existed in the working tree before my changes.

**Real-world correlation key.** Both ToolCallBlock and the live-rendered
ToolEntryRow use `toolUse.id` (= `entry.id`) as the correlation key, which
is the same value HooksTab's `toolUseID` carries. Direct equality.
