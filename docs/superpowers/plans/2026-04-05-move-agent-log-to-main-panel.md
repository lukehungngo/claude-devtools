# Implementation Plan: Move Agent Log to Main Panel

## Goal
Move the Agent Log tab from the bottom panel to the main/middle panel, as a third tab alongside Conversation and Raw Log.

## Tasks

### TASK-001: Add "agent-log" to main panel tab type and rendering
- **Agent:** engineer
- **Files:**
  - Modify: `dashboard/src/routes/SessionPage.tsx`
- **Approach:** Extend the `mainTab` state union from `"conversation" | "raw-log"` to `"conversation" | "raw-log" | "agent-log"`. Add `"agent-log"` to the tab bar array. Render `AgentLogTab` (imported from `components/bottom-panel/AgentLogTab`) when `mainTab === "agent-log"`, passing `allEvents`, `dag`, `subagentMeta`, `selectedAgent`, `onSelectAgent` (reuse `handleAgentPillClick`), `activeTurnIndex` (`effectiveTurnIndex`), and `turns`. Show the "Scoped to T{n}" pill for agent-log tab too (when a turn is selected). The tab label should be "Agent Log".
- **Tests:** Add a test in `dashboard/src/routes/SessionPage.test.tsx` (or create if not exists) that verifies: (a) the Agent Log tab button renders, (b) clicking it switches `mainTab` to "agent-log".
- **Verify:** `cd dashboard && npx vitest run src/routes/ --reporter verbose && npx tsc --noEmit`
- **Depends on:** none
- **Est:** 5 min

### TASK-002: Remove "agent-log" from bottom panel
- **Agent:** engineer
- **Files:**
  - Modify: `dashboard/src/components/bottom-panel/BottomPanel.tsx`
- **Approach:** Remove `"agent-log"` from the `BottomTab` type union and the `TABS` array. Remove the `AgentLogTab` rendering branch from the tab content switch. Remove the `AgentLogTab` import. This leaves the bottom panel with 3 tabs: Agent Graph, Tool Call, Cost.
- **Tests:** Update any existing BottomPanel tests that reference "agent-log" tab. Run `cd dashboard && npx vitest run src/components/bottom-panel/ --reporter verbose`.
- **Verify:** `cd dashboard && npx vitest run --reporter verbose 2>&1 | tail -10 && npx tsc --noEmit`
- **Depends on:** TASK-001
- **Est:** 3 min

### TASK-003: Verify and commit
- **Agent:** engineer
- **Files:** none (verification only)
- **Approach:** Run full test suite + type check. Verify no broken imports or references to "agent-log" in bottom panel code. Commit all changes together.
- **Tests:** Full suite
- **Verify:** `cd dashboard && pnpm test && npx tsc --noEmit`
- **Depends on:** TASK-002
- **Est:** 2 min

## Dependency Graph
```
TASK-001 → TASK-002 → TASK-003
```

## Risk Assessment
- **AgentLogTab imports**: `AgentLogTab` currently lives in `components/bottom-panel/`. After moving its usage to SessionPage, the file stays where it is (it's a reusable component). No file move needed.
- **Props availability**: SessionPage already has access to `allEvents`, `dag` (via `metrics?.dag`), `subagentMeta`, `selectedAgent`, `handleAgentPillClick` — all the props AgentLogTab needs.
- **Scoped-to-turn pill**: The "Scoped to T{n}" indicator currently only shows for raw-log. It should also show for agent-log since we just wired turn filtering in the previous fix.
