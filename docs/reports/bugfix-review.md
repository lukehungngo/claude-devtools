---
task_id: hud-readonly
title: "TopBar HUD read-only fix"
verdict: APPROVED_WITH_CHANGES
depth: standard
model: "claude-sonnet-4-6"
findings:
  p0: 0
  p1: 0
  p2: 2
  p3: 1
business_alignment: PASS
build_status: PASS
reviewed_at: "2026-04-18T10:01:44Z"
commit: "555f1126bac9e8b664d78e0fc511194614e469a1"
---

## Review: hud-readonly — TopBar HUD read-only fix

### Business Alignment

- [PASS] Bug reproduced and fixed: `TopBar.tsx` no longer accepts control props (ControlsZone, ModelSwitcher, FastModeToggle removed), Model and Context are always shown as static HudMetric regardless of `isLive`.
- [PASS] Plan step "useSessionControl hook stays (used for actual control elsewhere)" — plan explicitly permits leaving the hook in place. The fix correctly removed only the `setSessionControl` context bridge, not the hook itself.
- [PASS] Plan step "LayoutContext remove sessionControl if consumed only by TopBar" — the context no longer declares `sessionControl` or `setSessionControl`. Confirmed by reading `LayoutContext.ts` — neither field is present.
- [PASS] 1269 tests pass.

### Build Status

PASS — `pnpm test` (dashboard): 1269 tests, 109 files, 0 failures.

TypeScript: `tsc --noEmit` reports 3 pre-existing errors in `useSessionControl.test.ts` (Cannot find name `global`) and `globals.test.ts` (Cannot find `fs`/`url`/`path` modules). These are pre-existing environmental issues; the diff does not touch these files and does not introduce any new tsc errors.

### P0 — Blockers

None.

### P1 — Must Fix

None.

### P2 — Should Fix

**Dead control components still ship in the bundle**

`dashboard/src/components/controls/ControlsZone.tsx`, `ModelSwitcher.tsx`, and `FastModeToggle.tsx` have zero production consumers. The plan's file map only listed modifying `TopBar.tsx`, `AppLayout.tsx`, `SessionPage.tsx`, `LayoutContext.ts`, and `TopBar.test.tsx` — it did not call for deleting the control components. However, these components mutate server state via `useSessionControl` callbacks passed down to them. Leaving them in the bundle means future code can inadvertently re-wire them and reintroduce the bug. The related test files (`ControlsZone.test.tsx`, `ModelSwitcher.test.tsx`, `FastModeToggle.test.tsx`) cover components that are no longer reachable from any route.

The plan explicitly scoped this fix as "remove from TopBar; hook stays for use elsewhere," so this is not a plan violation — but the plan's intent was "TopBar never mutates state." Having the control components unused and untethered is a maintenance footgun.

Recommendation: In a follow-up, either delete the control component files or document in a comment why they're retained for future use.

**`SessionControlState` type in `lib/types.ts:308-313` is now unreferenced from any component or context**

The interface `SessionControlState` was removed from `LayoutContext.ts` but the type declaration itself remains in `dashboard/src/lib/types.ts` (lines 308-313). No component imports or uses it. Dead type in the public type module adds confusion about intended usage.

### P3 — Optional

**Pre-existing unused `Menu` import in `SessionPage.tsx:11`**

`import { Menu } from "lucide-react"` was already present and unused on `master` before this fix. The diff does not introduce it. Minor cleanup opportunity.

### Verdict

APPROVED_WITH_CHANGES

### Summary

The core fix is correct and complete: TopBar.tsx's Props interface lost all 8 control props, ControlsZone import is gone, Model and Context are always rendered as static HudMetric regardless of isLive. AppLayout.tsx passes no control state. LayoutContext.ts no longer exposes sessionControl/setSessionControl. The two new invariant regression tests directly exercise the bug condition (isLive=true) and confirm it stays fixed. Test count went from 1270 to 1269 net (deleted controls test file offset by 2 new tests). The P2 items are dead-code leftovers that the plan explicitly did not scope for deletion — they are non-blocking but should be addressed in a cleanup pass to prevent the control components from being accidentally re-wired.
