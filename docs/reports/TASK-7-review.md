---
task_id: TASK-7
title: "TrendRow + TrendSection Components"
verdict: APPROVED_WITH_CHANGES
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 5
  p3: 3
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-18T20:22:34"
commit: "5456e353c1cbd121aa8616374689e4d3dae4bd62"
---

## Review: TASK-7 — TrendRow + TrendSection Components

### Business Alignment

- [PASS] TrendRow renders entity name, call count, DualSparkline, and verdict chip — confirmed by reading TrendRow.tsx (lines 102-127) and all 8 tests passing.
- [PASS] DualSparkline renders teal solid polyline for tokensIn and purple dashed polyline for total — TrendRow.tsx lines 79-98 match spec visual intent.
- [PASS] TrendSection renders title, legend header with both line styles (teal solid "In", purple dashed "Out"), empty state — TrendSection.tsx lines 10-54.
- [PASS] Verdict styles match spec: improving = `text-dt-green bg-dt-green/10`, stable = `text-dt-text2 bg-dt-bg2`, regressing = `text-dt-red bg-dt-red/10` — TrendRow.tsx lines 23-27.
- [PASS] All `dt-*` Tailwind tokens used throughout. No inline `style={{}}` found.
- [PASS] Named exports only; no default exports.
- [PARTIAL] Design spec calls for shared y-scale (max across all individual `in` and `out` values). Implementation uses separate maxIn and maxTotal scales, which misrepresents ratio — but this is a minor visual divergence, not a data integrity violation. Annotated as P2.

### Build Status

PASS

```
npx tsc --noEmit -p dashboard/tsconfig.json  → 0 errors
pnpm -C dashboard test TrendRow.test.tsx TrendSection.test.tsx --run
  ✓ TrendSection.test.tsx (4 tests) 19ms
  ✓ TrendRow.test.tsx (8 tests) 20ms
  Test Files  2 passed (2)
      Tests  12 passed (12)
ESLint v9.39.4 → 0 warnings, 0 errors
```

### P0 — Blockers

None.

### P1 — Must Fix

None.

### P2 — Should Fix

**TrendRow.tsx:52-53 — Separate y-scales violate shared-scale spec and misrepresent in/out ratio.**
The design spec (TASK-7-design.md line 137) requires: "Both series share the same y-scale (max is the maximum across ALL in + out values)." The implementation computes `maxIn = Math.max(...weekly.map(w => w.in), 1)` and `maxTotal = Math.max(...weekly.map(w => w.in + w.out), 1)` independently. This inflates the teal (in) line relative to the purple (total) line, misrepresenting the actual ratio. Fix: use a single `const maxVal = Math.max(...weekly.flatMap(w => [w.in, w.out]), 1)` and apply it to both y-scale functions.

**TrendRow.tsx:52-53 — Math.max spread on large weekly arrays is fragile.**
`Math.max(...weekly.map(...))` spreads the full mapped array into function arguments. While `weekly` is bounded to ~52 items (weeks), this is an established JS anti-pattern that can throw RangeError with larger inputs. The spec and design doc recommend `weekly.flatMap(...reduce)` or an explicit loop. Prefer `weekly.reduce((acc, w) => Math.max(acc, w.in, w.in + w.out), 1)` for a single pass.

**TrendSection.tsx:39 — Legend says "Out" but DualSparkline renders `w.in + w.out` (total), not pure out.**
The purple dashed line in DualSparkline computes `yTotal(w.in + w.out)` (total tokens per week), but the legend in TrendSection labels it "Out". If the design intent is "tokens out" (generation), the sparkline should use `w.out` not `w.in + w.out`. If the intent is "total", the legend should say "Total". Either way there is a label/data mismatch. The design spec (TASK-7-design.md line 131) says "Purple dashed = tokens out", which means the purple polyline should use `w.out`, not `w.in + w.out`.

**TrendSection.tsx — Missing loading and error states from spec.**
The design spec defines Loading (skeleton rows with `animate-pulse`) and Error (alert banner with `role="alert"`) states, plus an optional `loading`, `error`, and `emptyMessage` prop. The TrendSectionProps interface in the implementation is missing `loading`, `error`, and `emptyMessage`. The empty message is hardcoded to "No data in this period" rather than using the per-instance `emptyMessage` prop. While not yet wired to real data, these props are in the spec and their absence will require a breaking interface change when the page connects them.

**TrendSection.tsx — Missing "Show more" toggle for > 10 rows.**
The design spec (TASK-7-design.md line 220) requires a "Show more" text button when `entries.length > 10`. The implementation renders all rows unconditionally. For 20-row lists (server maximum), this adds significant DOM height with no truncation. Implement local `showAll` state + `entries.slice(0, showAll ? undefined : 10)`.

### P3 — Optional

**TrendRow.tsx:76-77 — DualSparkline `aria-label` is generic.**
The spec says the aria-label should be `"Weekly token trend: {entry.name}. Tokens in trend (teal). Tokens out trend (purple dashed)."` The implementation uses the static string `"trend sparkline"`. This reduces accessibility for screen reader users but does not affect visual output.

**TrendRow.tsx:119 — VerdictChip uses `rounded` instead of `rounded-dt-xs`.**
The spec (TASK-7-design.md line 192) says `rounded-dt-xs` matching the existing `DeltaChip`. The implementation uses the generic Tailwind `rounded` class. Minor visual divergence.

**TrendRow.tsx:108-110 — CallsBadge format is `{calls} calls` instead of `{calls}×`.**
The spec (TASK-7-design.md line 182) specifies the `×` multiplication sign (U+00D7) format: `"42×"`. The implementation renders `"15 calls"`. This is not spec-compliant, but the test only checks `.textContent` contains the number, so it passes. Consider fixing for visual density compliance.

### Verdict

APPROVED_WITH_CHANGES

### Summary

The core visual primitives (DualSparkline, VerdictChip, TrendSection card shell) are correct and all 12 tests pass cleanly with zero TypeScript or ESLint errors. The implementation is functionally sound for the happy path. However, five should-fix issues were found: the DualSparkline uses separate y-scales (violating the shared-scale requirement that ensures ratio comparability), the purple sparkline plots `in+out` total rather than `out` alone (mismatched with the "Out" legend label), the TrendSection is missing `loading`/`error`/`emptyMessage` props, and the "Show more" truncation for > 10 rows is absent. None block correctness today, but the y-scale and label mismatch produce a visually misleading sparkline that should be fixed before the component is wired to live data.
