# Expand Playwright E2E Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive Playwright E2E tests covering critical user flows beyond the 3 basic tests already in place (homepage, navigation, performance).

**Architecture:** Tests run against the real dev server (Vite on :24183 proxying to Express on :3142). Tests that need session data use conditional skip when no sessions exist. All tests go in `dashboard/e2e/`.

**Tech Stack:** Playwright, TypeScript

**Existing infrastructure:**
- `@playwright/test@^1.59.1` already installed
- `dashboard/playwright.config.ts` configured (Chromium, baseURL :24183, webServer managed)
- `dashboard/e2e/` has 3 specs: `homepage.spec.ts`, `navigation.spec.ts`, `performance.spec.ts`
- Scripts: `pnpm test:e2e`, `pnpm test:e2e:ui`

---

## Tasks

### TASK-001: Add test helpers and fixtures

- **Agent:** engineer
- **Files:**
  - Create: `dashboard/e2e/helpers.ts`
- **Approach:** Create shared helpers for E2E tests: `navigateToFirstSession(page)` (navigates to homepage, finds first session link, clicks it, waits for session page), `skipIfNoSessions(page, test)` (checks for sessions and skips if none), and `waitForConversation(page)` (waits for conversation view to be visible). These reduce duplication across specs.
- **Tests:** Helpers are tested implicitly by TASK-002+ specs that use them.
- **Verify:** `cd dashboard && npx tsc --noEmit`
- **Depends on:** none
- **Est:** 3 min

### TASK-002: Add session page layout E2E tests

- **Agent:** engineer
- **Files:**
  - Create: `dashboard/e2e/session-layout.spec.ts`
- **Approach:** Test that a session page renders all 3 main panel tabs (Conversation, Raw Log, Agent Log) and all 3 bottom panel tabs (Agent Graph, Tool Call, Cost). Verify tab switching works — clicking "Raw Log" tab shows the raw log view, clicking "Agent Log" shows agent log, clicking back to "Conversation" shows conversation. Test that the Turn History sidebar is visible.
- **Tests:**
  - Session page shows 3 main tabs
  - Clicking "Raw Log" tab switches content
  - Clicking "Agent Log" tab switches content
  - Clicking "Conversation" tab returns to conversation
  - Bottom panel shows Agent Graph / Tool Call / Cost tabs
  - Turn History sidebar is visible
- **Verify:** `cd dashboard && pnpm test:e2e -- session-layout`
- **Depends on:** TASK-001
- **Est:** 5 min

### TASK-003: Add turn selection E2E tests

- **Agent:** engineer
- **Files:**
  - Create: `dashboard/e2e/turn-selection.spec.ts`
- **Approach:** Test the turn selection flow that was recently fixed. Navigate to a session, verify turn history shows turns. If multiple turns exist, click a non-last turn and verify the conversation view scrolls/filters, the bottom panel updates (Agent Graph shows filtered data), and clicking "Latest" or the last turn returns to full view. Use data-testid attributes where available.
- **Tests:**
  - Turn history panel shows turn entries
  - Clicking a turn highlights it
  - Clicking a different turn changes conversation content
  - Bottom panel Agent Graph updates on turn change
- **Verify:** `cd dashboard && pnpm test:e2e -- turn-selection`
- **Depends on:** TASK-001
- **Est:** 5 min

### TASK-004: Add bottom panel interaction E2E tests

- **Agent:** engineer
- **Files:**
  - Create: `dashboard/e2e/bottom-panel.spec.ts`
- **Approach:** Test bottom panel tab switching and resize handle. Navigate to session, verify Agent Graph tab is active by default. Switch to Tool Call tab, verify it shows tool call content. Switch to Cost tab, verify it shows cost breakdown. Test that the resize handle exists and is draggable (drag from initial position, verify panel height changes).
- **Tests:**
  - Agent Graph tab visible by default
  - Switching to Tool Call tab shows tool call content
  - Switching to Cost tab shows cost information
  - Resize handle exists and panel resizes on drag
- **Verify:** `cd dashboard && pnpm test:e2e -- bottom-panel`
- **Depends on:** TASK-001
- **Est:** 5 min

### TASK-005: Add theme toggle and topbar E2E tests

- **Agent:** engineer
- **Files:**
  - Create: `dashboard/e2e/topbar.spec.ts`
- **Approach:** Test topbar functionality. Verify status dot is visible (already covered but extend). Test theme toggle — click theme button, verify `data-theme` or class changes on html/body. Test that session metadata (model name, duration, cost) appears in topbar when viewing a session.
- **Tests:**
  - Theme toggle switches between light/dark
  - Session metadata appears in topbar on session page
  - Status indicator shows connection status
- **Verify:** `cd dashboard && pnpm test:e2e -- topbar`
- **Depends on:** TASK-001
- **Est:** 4 min

### TASK-006: Add search/filter E2E tests

- **Agent:** engineer
- **Files:**
  - Create: `dashboard/e2e/search.spec.ts`
- **Approach:** Test the transcript search functionality if it exists in ConversationView. Navigate to a session with content, open search (Cmd+F or search icon), type a query, verify matches are highlighted or result count appears. If search is not yet interactive, test the sidebar repo filtering — type in sidebar search, verify repo list filters.
- **Tests:**
  - Search input appears on activation
  - Typing filters/highlights results
  - Clearing search restores full view
- **Verify:** `cd dashboard && pnpm test:e2e -- search`
- **Depends on:** TASK-001
- **Est:** 4 min

### TASK-007: Add error resilience E2E tests

- **Agent:** engineer
- **Files:**
  - Create: `dashboard/e2e/resilience.spec.ts`
- **Approach:** Test graceful handling of edge cases. Navigate to a non-existent session URL (`/session/fake-id-12345`), verify app shows error or redirects gracefully without crashing. Test that navigating back to homepage works after error. Verify no unhandled JS exceptions in console across navigation.
- **Tests:**
  - Invalid session URL shows error state (not crash)
  - Navigation back to homepage works after error
  - No unhandled exceptions across page transitions
- **Verify:** `cd dashboard && pnpm test:e2e -- resilience`
- **Depends on:** none
- **Est:** 4 min

### TASK-008: Update Makefile and verify full suite

- **Agent:** engineer
- **Files:**
  - Modify: `dashboard/Makefile` or root `Makefile`
- **Approach:** Add `test:e2e` target to the root Makefile if not present (runs `cd dashboard && pnpm test:e2e`). Run the full E2E suite to verify all tests pass. Fix any flaky tests by adding appropriate waits or skip conditions.
- **Tests:** Full suite green
- **Verify:** `cd dashboard && pnpm test:e2e`
- **Depends on:** TASK-001 through TASK-007
- **Est:** 3 min

## Dependency Graph

```
TASK-001 (helpers)
  ├→ TASK-002 (session layout)
  ├→ TASK-003 (turn selection)
  ├→ TASK-004 (bottom panel)
  ├→ TASK-005 (topbar)
  └→ TASK-006 (search)

TASK-007 (resilience) — independent, no deps

TASK-008 (verify full suite) — after all others
```

## Risk Assessment

- **No sessions on test machine:** All session-dependent tests must use `skipIfNoSessions()` pattern. The test server reads from `~/.claude/projects/` which may be empty on CI.
- **Server not running:** Playwright config has `webServer` that starts `pnpm dev`, but this only starts Vite. Express server on :3142 must also be running for API calls. Tests that need real data should handle API 502/connection errors gracefully.
- **Flaky selectors:** Prefer `data-testid` and `role` selectors over text content. Some text selectors may break if copy changes.
- **CI environment:** Tests skip in CI if no real session data. Consider adding mock fixtures in a future iteration.
