# HUD Read-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TopBar a pure read-only HUD — remove all interactive controls (ModelSwitcher, FastModeToggle, effort, compact) so the HUD only displays current state, never mutates it.

**Architecture:** TopBar always shows a static `HudMetric` for model (from `metrics.models`, ground truth), never `ControlsZone`. The `sessionControl` hook in `SessionPage` stays (used for actual control elsewhere), but its values are no longer forwarded to `TopBar`. `ControlsZone` import is removed from `TopBar`.

**Tech Stack:** React + TypeScript, Vitest

---

## File Map

- Modify: `dashboard/src/components/TopBar.tsx` — remove control props from interface, remove ControlsZone branch, always render HudMetric for Model, always show Context
- Modify: `dashboard/src/routes/AppLayout.tsx` — remove 8 control props from `<TopBar>` render (~lines 316-323)
- Modify: `dashboard/src/routes/SessionPage.tsx` — remove `setSessionControl` wiring (the useSessionControl hook stays but stop passing to layout context)
- Modify: `dashboard/src/contexts/LayoutContext.tsx` — remove `sessionControl` from context if it exists only for TopBar
- Modify: `dashboard/src/components/__tests__/TopBar.test.tsx` — add test asserting model HudMetric always shown for live sessions

---

### Task 1: Identify and confirm sessionControl flow

**Files:**
- Read: `dashboard/src/contexts/LayoutContext.tsx`
- Read: `dashboard/src/routes/SessionPage.tsx` (lines 106-135)

- [ ] **Step 1: Check if sessionControl is used anywhere besides TopBar**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly
grep -rn "sessionControl" dashboard/src/ --include="*.tsx" --include="*.ts"
```

Expected: Only `LayoutContext.tsx`, `SessionPage.tsx`, `AppLayout.tsx` reference it.

---

### Task 2: Remove ControlsZone branch from TopBar

**Files:**
- Modify: `dashboard/src/components/TopBar.tsx`

- [ ] **Step 1: Write the failing test — TopBar shows model HudMetric even when live + control props passed**

Add to `dashboard/src/components/__tests__/TopBar.test.tsx` inside the existing `describe("TopBar")` block:

```typescript
describe("HUD read-only — model always shown", () => {
  it("renders Model HudMetric even when isLive=true", () => {
    renderTopBar({ metrics: STUB_METRICS, isLive: true });
    expect(screen.getByText("Model")).toBeDefined();
    expect(screen.getByText(/Sonnet/)).toBeDefined();
  });

  it("renders Context even when isLive=true", () => {
    const metricsWithPct = { ...STUB_METRICS, contextPercent: 45, contextWindowSize: 200000 } as unknown as SessionMetrics;
    renderTopBar({ metrics: metricsWithPct, isLive: true });
    expect(screen.getByText("Context")).toBeDefined();
    expect(screen.getByText("45%")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to confirm they currently FAIL**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly/dashboard
pnpm test -- --reporter=verbose src/components/__tests__/TopBar.test.tsx 2>&1 | tail -30
```

Expected: "HUD read-only" tests FAIL because ControlsZone replaces Model/Context for live sessions.

- [ ] **Step 3: Remove control props from TopBar interface and implementation**

In `dashboard/src/components/TopBar.tsx`:

Remove these imports:
```typescript
import { ControlsZone } from "./controls/ControlsZone";
import type { ModelOption } from "./controls/ModelSwitcher";
```

Remove from `Props` interface (delete lines 20-27):
```typescript
  // P5-01 control props
  model?: string;
  availableModels?: ModelOption[];
  fastMode?: boolean;
  effort?: EffortLevel;
  onModelSelect?: (modelId: string) => void;
  onFastToggle?: () => void;
  onEffortChange?: (level: EffortLevel) => void;
  onCompact?: () => void;
```

Also remove `EffortLevel` from the types import since it's no longer used in Props (check if used elsewhere in the file first).

Update the function signature — remove the 8 destructured control params:
```typescript
export function TopBar({ metrics, repoName, branch, isLive, hasPermissionPending, viewingTurnNumber, onClearViewingTurn, permissionMode = "default", onPermissionModeChange }: Props) {
```

Change `activeModel` derivation (remove `model ??`):
```typescript
  const activeModel = realModels.length > 0 ? realModels[realModels.length - 1] : null;
```

Replace the entire `isLive && onModelSelect && ...` conditional block (lines 177-197) with the always-on version:
```tsx
          <>
            <HudMetric label="Model" value={modelName} />
            <HudSep />
          </>
```

Remove the `!(isLive && onModelSelect)` guard around Context (lines 201-241) so Context is always shown:
```tsx
          <>
            <div className="flex flex-col items-center gap-[2px]">
              <span className="t-eyebrow">Context</span>
              <div className="flex items-center gap-1">
                <span className="t-metric">
                  {contextPct}%
                </span>
                <div
                  style={{
                    width: 42,
                    height: 4,
                    borderRadius: 2,
                    background: "var(--bd)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${contextPct}%`,
                      borderRadius: 2,
                      background: contextColor,
                      transition: "width .3s, background .3s",
                    }}
                  />
                </div>
                {metrics.contextWindowSize > 0 && (
                  <span
                    className="t-mono-xs"
                    style={{ color: "var(--t3)", fontSize: 9 }}
                  >
                    of {formatTokens(metrics.contextWindowSize)}
                  </span>
                )}
              </div>
            </div>
            <HudSep />
          </>
```

- [ ] **Step 4: Run TopBar tests to confirm new tests PASS**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly/dashboard
pnpm test -- --reporter=verbose src/components/__tests__/TopBar.test.tsx 2>&1 | tail -30
```

Expected: All tests PASS including new "HUD read-only" tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly
git add dashboard/src/components/TopBar.tsx dashboard/src/components/__tests__/TopBar.test.tsx
git commit -m "feat: make TopBar HUD read-only — remove ControlsZone, always show Model+Context"
```

---

### Task 2: Remove control props from AppLayout's TopBar render

**Files:**
- Modify: `dashboard/src/routes/AppLayout.tsx` (~lines 316-324)

- [ ] **Step 1: Remove the 8 control props from the TopBar JSX**

In `dashboard/src/routes/AppLayout.tsx`, find the `<TopBar>` render block and remove these lines:
```typescript
            model={sessionControl?.model ?? undefined}
            availableModels={sessionControl?.availableModels}
            fastMode={sessionControl?.fastMode}
            effort={sessionControl?.effort}
            onModelSelect={sessionControl?.onModelSelect}
            onFastToggle={sessionControl?.onFastToggle}
            onEffortChange={sessionControl?.onEffortChange}
            onCompact={sessionControl?.onCompact}
```

- [ ] **Step 2: Run typecheck to confirm no TypeScript errors**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly/dashboard
npx tsc --noEmit 2>&1 | head -40
```

Expected: Zero errors.

- [ ] **Step 3: If sessionControl is now unused in AppLayout, remove it**

Check if `sessionControl` is still referenced in AppLayout after removing the TopBar props. If the `const { ..., sessionControl, setSessionControl, ... }` destructuring still pulls `sessionControl` but it's no longer used, remove it from the destructure.

```bash
grep -n "sessionControl" /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly/dashboard/src/routes/AppLayout.tsx
```

If `sessionControl` only appeared in the TopBar props, remove it from the destructure and remove the `setSessionControl` call if no longer needed.

- [ ] **Step 4: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly
git add dashboard/src/routes/AppLayout.tsx
git commit -m "refactor: remove control props from AppLayout TopBar render"
```

---

### Task 3: Clean up LayoutContext and SessionPage if sessionControl is now orphaned

**Files:**
- Read: `dashboard/src/contexts/LayoutContext.tsx`
- Modify (if needed): `dashboard/src/contexts/LayoutContext.tsx`
- Modify (if needed): `dashboard/src/routes/SessionPage.tsx`

- [ ] **Step 1: Check if sessionControl is still used anywhere**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly
grep -rn "sessionControl\|setSessionControl" dashboard/src/ --include="*.tsx" --include="*.ts"
```

Expected: If only SessionPage.tsx references it (setting it) and AppLayout no longer reads it for TopBar, then `sessionControl` in context is dead. If nothing consumes it, remove it.

- [ ] **Step 2: Remove sessionControl from LayoutContext if unused**

If no component reads `sessionControl` from context anymore:

In `dashboard/src/contexts/LayoutContext.tsx`, remove:
- The `sessionControl` field from the context interface
- The `sessionControl` state and `setSessionControl` from the provider
- Any related types (`SessionControlState` etc. if only used for this)

In `dashboard/src/routes/SessionPage.tsx`, remove:
- The `setSessionControl` from the `useLayoutContext()` destructure
- The `useEffect` that calls `setSessionControl(...)` (both the setting call and the null-on-unmount cleanup)
- The `useSessionControl` hook usage if it was only for passing to TopBar

NOTE: The `useSessionControl` hook itself does real work (model/fast/effort state + sending to server). Keep it if it's wired to other UI (PromptInput, etc.). Only remove the `setSessionControl` bridge to context.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly/dashboard
pnpm test 2>&1 | tail -20
```

Expected: All 1270 tests pass.

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly/dashboard
npx tsc --noEmit 2>&1 | head -40
```

Expected: Zero errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly
git add dashboard/src/contexts/LayoutContext.tsx dashboard/src/routes/SessionPage.tsx
git commit -m "refactor: remove sessionControl from LayoutContext — no longer consumed by TopBar"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly
cd server && pnpm test 2>&1 | tail -5 && cd ../dashboard && pnpm test 2>&1 | tail -5
```

Expected: All tests pass.

- [ ] **Step 2: Run full typecheck**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/hud-readonly
cd server && npx tsc --noEmit && echo "server OK" && cd ../dashboard && npx tsc --noEmit && echo "dashboard OK"
```

Expected: Both report OK.

- [ ] **Step 3: Write result file**

Write to `docs/reports/bugfix-result.md`:
```markdown
# Bug Fix Result: hud-readonly

## Bug
TopBar rendered interactive ControlsZone (ModelSwitcher, FastModeToggle, effort, compact) for live sessions instead of static HUD display.

## Reproduction Test
Added tests in TopBar.test.tsx — "HUD read-only" suite:
- renders Model HudMetric even when isLive=true
- renders Context even when isLive=true

## Fix Applied
- `TopBar.tsx`: Removed control props from interface, removed ControlsZone import, replaced conditional branch with always-on HudMetric+Context
- `AppLayout.tsx`: Removed 8 control props from TopBar render
- `LayoutContext.tsx` / `SessionPage.tsx`: Removed sessionControl context bridge (orphaned)

## Tests
All tests pass. New reproduction tests pass.
```
