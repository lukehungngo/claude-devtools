# TASK-001: Fix ResponseBlock border green → purple/accent

## Objective
Change assistant text block left border from green to purple/accent to match mockup.

## Routing
routing: Engineer directly — known pattern, single-line CSS class change

## Files
- `dashboard/src/components/viewer/ResponseBlock.tsx` (modify)
- `dashboard/src/components/viewer/ResponseBlock.test.tsx` (modify)

## Approach
1. In ResponseBlock.tsx line 25, change `border-dt-green` to `border-dt-accent`
2. In ResponseBlock.test.tsx line 120, change assertion from `border-dt-green` to `border-dt-accent`

## Acceptance Criteria
- `border-dt-accent` class is on the ResponseBlock wrapper div
- Test passes asserting `border-dt-accent`
- `cd dashboard && pnpm test -- --grep "ResponseBlock"` passes

## Do Not Touch
- Any other files
