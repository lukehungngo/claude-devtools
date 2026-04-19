# Fix: "Session ended without completion" False Positive on Reload

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop "Session ended without completion" from showing on page reload for CLI sessions that are actively running but momentarily silent (e.g., running a long bash command).

**Architecture:** A one-line change in `ConversationView.tsx`. The fallback signal for "is this session dead?" uses `isRunning` (2-min mtime window), which incorrectly fires for any session that hasn't written a JSONL event in >2 minutes — including sessions blocked on long tool calls. The fix swaps it for `isActive` (12-hour window), which correctly distinguishes "session closed hours ago" from "session is running right now."

**Tech Stack:** React, TypeScript, Vitest

---

## File Structure

- **Modify:** `dashboard/src/components/conversation/ConversationView.tsx` (line 791) — one character swap: `isRunning` → `isActive`
- **Modify:** `dashboard/src/components/conversation/ConversationView.test.tsx` — add one test verifying isActive is used, not isRunning

---

### Task 1: Write the Failing Test

**Files:**
- Modify: `dashboard/src/components/conversation/ConversationView.test.tsx`

**Context:** The bug: `sessionIsRunning` is computed as `metrics?.session?.isRunning`. When a CLI session is running a long bash command (no JSONL writes for >2min), `isRunning=false` but `isActive=true`. The component passes `sessionIsRunning=false` to `TurnCard`, which renders "Session ended without completion." The fix uses `isActive` instead.

- [ ] **Step 1: Add the failing test to `ConversationView.test.tsx`**

Append this `describe` block at the end of `dashboard/src/components/conversation/ConversationView.test.tsx`:

```tsx
describe("ConversationView sessionIsRunning uses isActive not isRunning", () => {
  it("does NOT show indeterminate when isActive=true but isRunning=false (session running long tool)", () => {
    // Scenario: CLI session ran a 5-minute bash command. isRunning=false (2-min window),
    // but isActive=true (12-hour window). Should NOT show "Session ended without completion".
    const events: SessionEvent[] = [
      makeUserEvent("Run a long command", 0),
      {
        type: "assistant",
        uuid: "asst-no-end-turn",
        timestamp: "2026-01-01T00:00:01Z",
        sessionId: "sess-1",
        agentId: "main",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "tu-bash", name: "Bash", input: { command: "sleep 300" } }],
          model: "claude-sonnet-4-6",
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: "tool_use",
        },
      } as unknown as SessionEvent,
    ];
    const turns = groupEventsIntoTurns(events as SessionEvent[]);

    // metrics.session.isActive=true but isRunning=false (long-running tool, session quiet >2min)
    const metrics = {
      session: {
        id: "sess-1",
        projectHash: "ph1",
        path: "/p",
        startTime: "2026-01-01T00:00:00Z",
        lastModified: "2026-01-01T00:00:01Z",
        eventCount: 2,
        subagentCount: 0,
        isActive: true,
        isRunning: false,
      },
    } as unknown as import("../../lib/types").SessionMetrics;

    const { container } = render(
      <ConversationView events={events} turns={turns} metrics={metrics} />
    );

    const indicator = container.querySelector('[data-testid="turn-completion-indicator"]');
    // The turn should NOT be indeterminate — session is still active (within 12h)
    expect(indicator?.getAttribute("data-status")).not.toBe("indeterminate");
    expect(container.textContent).not.toContain("Session ended without completion");
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS (before the fix)**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/indeterminate-on-reload/dashboard
pnpm test --run src/components/conversation/ConversationView.test.tsx 2>&1 | tail -20
```

Expected: FAIL — the test finds `data-status="indeterminate"` or the text "Session ended without completion".

---

### Task 2: Implement the One-Line Fix

**Files:**
- Modify: `dashboard/src/components/conversation/ConversationView.tsx` (line 791)

- [ ] **Step 1: Apply the fix**

In `dashboard/src/components/conversation/ConversationView.tsx`, find the block at lines 787–792:

```tsx
        sessionIsRunning={
          // Prefer authoritative SDK session_state_changed signal over mtime heuristic
          streamingState.sessionState != null
            ? streamingState.sessionState === "running"
            : metrics?.session?.isRunning
        }
```

Change `isRunning` → `isActive`:

```tsx
        sessionIsRunning={
          // Prefer authoritative SDK session_state_changed signal over mtime heuristic
          streamingState.sessionState != null
            ? streamingState.sessionState === "running"
            : metrics?.session?.isActive
        }
```

- [ ] **Step 2: Run the new test to verify it PASSES**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/indeterminate-on-reload/dashboard
pnpm test --run src/components/conversation/ConversationView.test.tsx 2>&1 | tail -20
```

Expected: All tests PASS including the new one.

- [ ] **Step 3: Run the full test suite to verify no regressions**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/indeterminate-on-reload/server && pnpm test --run 2>&1 | tail -5
cd /Users/soh/working/ai/claude-devtools/.worktrees/indeterminate-on-reload/dashboard && pnpm test --run 2>&1 | tail -5
```

Expected: All 550 server tests and 1269+ dashboard tests PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/soh/working/ai/claude-devtools/.worktrees/indeterminate-on-reload
git add dashboard/src/components/conversation/ConversationView.tsx
git add dashboard/src/components/conversation/ConversationView.test.tsx
git commit -m "fix: use isActive not isRunning to decide session liveness on reload

isRunning (2-min mtime) fires false for any session quiet >2 min,
including sessions blocked on a long bash tool call. isActive (12-hour
window) correctly distinguishes dead sessions from running-but-silent ones."
```

---

## Self-Review

**Spec coverage:**
- Root cause: `isRunning` used where `isActive` should be → COVERED (Task 2 Step 1)
- Regression: existing test for `sessionIsRunning=false` → "indeterminate" still works because that test passes `sessionIsRunning={false}` directly to `TurnCard`, not via `ConversationView` → NOT AFFECTED by this fix
- New test covers the reload scenario with `isActive=true, isRunning=false` → COVERED (Task 1)

**Placeholder scan:** No placeholders. All code shown verbatim.

**Type consistency:** `metrics?.session?.isActive` — `isActive` is already on `SessionInfo` (see `dashboard/src/lib/types.ts` line 154: `isActive?: boolean`). No type changes needed.
