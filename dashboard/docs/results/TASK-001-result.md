## TASK-001 Result: Fix ResponseBlock border green to accent

### Summary
Changed the ResponseBlock left border from `border-dt-green` to `border-dt-accent` to match the v5-compact-agent-response mockup which specifies `border-left: 2px solid var(--accent)` (purple).

### Files Modified
- `src/components/viewer/ResponseBlock.tsx` -- line 25: `border-dt-green` -> `border-dt-accent`
- `src/components/viewer/ResponseBlock.test.tsx` -- line 115-122: updated test name and assertion from `border-dt-green` to `border-dt-accent`

### Test Count
- 0 tests added, 1 test updated
- All 849 tests pass
- Typecheck clean

### Concerns or Follow-ups
- The success checkmark span on line 26 still uses `text-dt-green`. This was not in scope for this task but may need a separate review if the mockup specifies a different color for success indicators.
