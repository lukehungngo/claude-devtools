# TASK-003 Result: Agent Graph & Agents Log Redesign + Cross-Panel Interactions

## Summary

Redesigned the Agent Graph (Panel 3), Agents Log (Panel 4), and wired cross-panel interactions between TopBar, Graph, and Log. All components now match the mockup design with proper theming via CSS variables.

## Changes

### Part A: Agent Graph Redesign (`AgentFlowDAG.tsx` + `AgentNodeCard.tsx`)

- **Panel header**: Added "Agent Graph" title with chart icon, "real-time" accent badge, and Fit button
- **Graph canvas**: Radial gradient background matching mockup
- **Node styling**: Compact rectangular nodes (120x56px) with type-colored borders (main=accent, Explore=cyan, Plan=yellow, General=green), status dots with pulse animation for running nodes, drop-shadow glow for main node
- **Edge styling**: Default edges use `--border-active` color, active edges use `--accent` with dashed animation and arrow markers
- **Graph toolbar**: Bottom-left vertical stack with Zoom In/Out/Fit buttons (28x28px, bg-3 background)
- **Graph legend**: Top-right horizontal flex showing all 4 agent types with colored dots
- **Stats bar**: Bottom overlay showing Agents/Running/Completed/Total Cost/Tokens counts
- **Selected node**: Outline highlight when agent is selected via cross-panel interaction
- Wrapped ReactFlow in ReactFlowProvider to enable useReactFlow() hook for programmatic zoom/fit

### Part B: Agents Log Redesign (`AgentLogs.tsx`)

- **Panel header**: "Agents Log" title with chart icon, agent count badge, auto-scroll resume button
- **Filter bar**: 7 tabs (All, Main, Explore, Plan, General, Errors, Tools) with active/hover styles matching mockup
- **Log entries**: 4-column CSS grid (68px time, 80px agent badge, 1fr message, auto action badge)
- **Agent badges**: Color-coded by type matching graph node colors
- **Action badges**: Color-coded by tool type (Read/Grep=cyan, Write/Edit=green, Bash=orange, thinking=purple, error=red, spawn/completed=green)
- **Message highlighting**: File paths detected via regex and rendered in cyan monospace
- **Auto-scroll**: Active by default, pauses on manual scroll-up, resume button appears
- **Data source**: Changed from `useAgentLogs` (single agent) to transforming raw `SessionEvent[]` from `useSessionMetrics` -- shows ALL agents' events with client-side filtering, no extra API calls
- Exported `eventsToLogEntries()` transform function for potential reuse/testing

### Part C: Cross-Panel Interactions

- **App.tsx**: Added `selectedAgent` (nullable) and `toolFilter` shared state, wired to all panels
- **Graph -> Log**: Clicking a graph node sets `selectedAgent`, which highlights that agent's entries in the log
- **Log -> Graph**: Clicking an agent badge in the log sets `selectedAgent`, which outlines the corresponding graph node
- **TopBar -> Log**: Tool badge clicks call `onToolFilter(toolName)` which filters the Agents Log to that tool type (toggle behavior: click again to clear)
- **Session change**: Selecting a new session resets both `selectedAgent` and `toolFilter`

### Part D: CSS Additions (`globals.css`)

- Added `pulse-opacity` keyframe for running agent status dots
- Added `dash-offset` keyframe for active edge animation

## Files Modified

1. `dashboard/src/components/AgentFlowDAG.tsx` -- full redesign
2. `dashboard/src/components/AgentNodeCard.tsx` -- full redesign
3. `dashboard/src/components/AgentLogs.tsx` -- full redesign
4. `dashboard/src/App.tsx` -- cross-panel state wiring, removed useAgentLogs dependency
5. `dashboard/src/components/TopBar.tsx` -- added onToolFilter prop + click handler
6. `dashboard/src/styles/globals.css` -- added keyframe animations

## Files NOT Touched

- All server/ files
- dashboard/src/components/Layout.tsx
- dashboard/src/components/RepoList.tsx
- dashboard/src/components/viewer/*
- dashboard/src/hooks/useSessionData.ts

## Verification

- `cd dashboard && npx tsc --noEmit` -- clean (0 errors)
- `cd server && npx tsc --noEmit` -- clean (0 errors)
- `pnpm lint` -- 0 errors, 12 pre-existing warnings (all in server/ files)

## Test Count

0 (no test framework configured per CLAUDE.md)

## Concerns / Follow-ups

- The `useAgentLogs` hook is no longer used by App.tsx. It could be removed in a cleanup task, but it was not in the relevant_files list so left untouched.
- Log virtualization (react-window) is not implemented -- for 10,000+ entries this would be needed (P2 per spec). Current implementation renders all entries.
- The `eventsToLogEntries` transform skips `progress` events for cleaner output. If progress events are desired, the filter can be adjusted.
