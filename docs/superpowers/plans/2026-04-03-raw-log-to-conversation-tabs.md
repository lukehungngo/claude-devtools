# Raw Log → Conversation Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Raw Log out of the bottom panel and into a tabbed view alongside the conversation, so that selecting a turn shows its raw JSONL events in context.

**Architecture:** Add a tab bar ("Conversation" | "Raw Log") to `SessionPage`. The tab bar wraps the existing `ConversationView` and a new `RawLogView` component. `RawLogView` reuses the existing `RawLogTab` internals (EventRow, JsonMode) but is always scoped to the currently selected turn. The bottom panel loses its "Raw Log" tab entirely.

**Tech Stack:** React, TypeScript, Tailwind `dt-*` tokens, Vitest, @testing-library/react

---

### Task 1: Remove "Raw Log" from Bottom Panel

**Files:**
- Modify: `dashboard/src/components/bottom-panel/BottomPanel.tsx` (lines 11-19, 263-271)
- Modify: `dashboard/src/components/bottom-panel/BottomPanel.test.tsx`

- [ ] **Step 1: Write failing test — "raw-log" tab no longer exists**

In `dashboard/src/components/bottom-panel/BottomPanel.test.tsx`, add:

```tsx
it("does not render a Raw Log tab", () => {
  render(<BottomPanel />);
  expect(screen.queryByText("Raw Log")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npx vitest run src/components/bottom-panel/BottomPanel.test.tsx --reporter=verbose`
Expected: FAIL — "Raw Log" button still rendered.

- [ ] **Step 3: Remove raw-log from BottomTab type and TABS array**

In `dashboard/src/components/bottom-panel/BottomPanel.tsx`:

Change the type on line 11:
```typescript
export type BottomTab = "agent-graph" | "tool-call" | "agent-log" | "cost";
```

Remove the raw-log entry from TABS on lines 13-19:
```typescript
const TABS: { id: BottomTab; label: string }[] = [
  { id: "agent-graph", label: "Agent Graph" },
  { id: "tool-call", label: "Tool Call" },
  { id: "agent-log", label: "Agent Log" },
  { id: "cost", label: "Cost" },
];
```

Remove the `RawLogTab` import (line 8):
```typescript
// DELETE: import { RawLogTab } from "./RawLogTab";
```

Remove the raw-log rendering branch (lines 263-271):
```typescript
// DELETE the entire block:
// } : activeTab === "raw-log" ? (
//   <RawLogTab ... />
```

Remove `liveEvents` from the BottomPanel props interface and destructuring since it was only used by RawLogTab. Remove from `BottomPanelProps` interface (line 28):
```typescript
// DELETE: liveEvents?: SessionEvent[];
```

Remove from destructured props (line 50):
```typescript
// DELETE: liveEvents = [],
```

- [ ] **Step 4: Update existing BottomPanel tests**

Remove or update any tests in `BottomPanel.test.tsx` that reference "Raw Log" or the `raw-log` tab. If a test clicks the "Raw Log" tab or asserts its existence, remove that test.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd dashboard && npx vitest run src/components/bottom-panel/BottomPanel.test.tsx --reporter=verbose`
Expected: All PASS.

- [ ] **Step 6: Run type check**

Run: `cd dashboard && npx tsc --noEmit`
Expected: No errors. If there are errors from `AppLayout.tsx` passing `liveEvents` to BottomPanel, fix by removing that prop from the call site in `dashboard/src/routes/AppLayout.tsx` (around line 351).

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/bottom-panel/BottomPanel.tsx dashboard/src/components/bottom-panel/BottomPanel.test.tsx dashboard/src/routes/AppLayout.tsx
git commit -m "refactor: remove Raw Log tab from bottom panel"
```

---

### Task 2: Add tab bar to SessionPage (Conversation | Raw Log)

**Files:**
- Modify: `dashboard/src/routes/SessionPage.tsx`
- Test: `dashboard/src/routes/SessionPage.test.tsx` (create if needed, or use existing)

- [ ] **Step 1: Write failing test — tab bar renders with two tabs**

Create or modify `dashboard/src/routes/SessionPage.test.tsx`. Since SessionPage depends on router params and LayoutContext, a simpler approach is to test the tab bar as a small extracted component. But if there are existing SessionPage tests, add to those.

Minimal integration test (may need router wrapper):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

// We'll test the tab bar exists after Task 2 Step 3 implementation
// For now, verify the concept
describe("SessionPage tabs", () => {
  it("placeholder for tab bar test", () => {
    // Will be filled in after implementation is wired
    expect(true).toBe(true);
  });
});
```

Since SessionPage requires heavy context (router, LayoutContext, API), the real verification will be done via type-check and manual testing. Focus TDD on the extracted component in Task 3.

- [ ] **Step 2: Add tab state to SessionPage**

In `dashboard/src/routes/SessionPage.tsx`, add state for the active main tab:

```typescript
type MainTab = "conversation" | "raw-log";

// Inside SessionPage component, after other useState calls:
const [mainTab, setMainTab] = useState<MainTab>("conversation");
```

- [ ] **Step 3: Add tab bar and conditional rendering**

Replace the return JSX (lines 247-271) with:

```tsx
return (
  <div className="flex flex-col h-full overflow-hidden">
    {/* Tab bar */}
    <div className="flex shrink-0 border-b border-dt-border bg-dt-bg">
      {(["conversation", "raw-log"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setMainTab(tab)}
          className="bg-transparent border-none cursor-pointer"
          style={{
            padding: "8px 16px",
            fontSize: 11,
            color: mainTab === tab ? "var(--acc)" : "var(--t3)",
            borderBottom: `2px solid ${mainTab === tab ? "var(--acc)" : "transparent"}`,
            transition: "all .12s",
          }}
        >
          {tab === "conversation" ? "Conversation" : "Raw Log"}
        </button>
      ))}
      {mainTab === "raw-log" && selectedTurnIndex != null && (
        <div className="ml-auto flex items-center gap-[3px] text-[10px] text-dt-text3 pr-2">
          Scoped to{" "}
          <span className="font-mono text-[10px] font-semibold text-dt-accent bg-dt-accent-bg px-[5px] py-[1px] rounded-[3px]">
            T{turns[selectedTurnIndex]?.turnNumber}
          </span>
        </div>
      )}
    </div>

    {/* Tab content */}
    {mainTab === "conversation" ? (
      <>
        {!turnHistoryOpen && <ReopenBar onReopen={handleReopenTurnHistory} />}
        <ConversationView
          events={allEvents}
          turns={turns}
          metrics={metrics}
          isLive={isLive}
          sessionCwd={metrics.session.cwd}
          sessionId={metrics.session.id}
          projectHash={projectHash}
          activeSessionId={activeSessionId ?? undefined}
          onSessionStarted={setActiveSessionId}
          highlightedTurnIndex={highlightedTurnIndex}
          permissions={permissions}
          onPermissionDecide={decidePermission}
          onDecideSession={decidePermissionSession}
          questions={questions}
          onSubmitAnswer={submitAnswer}
          onAgentPillClick={handleAgentPillClick}
          onTurnClick={handleTurnClick}
          onOpenPanel={handleOpenPanel}
        />
      </>
    ) : (
      <RawLogView
        turns={turns}
        allEvents={allEvents}
        activeTurnIndex={selectedTurnIndex}
      />
    )}
  </div>
);
```

- [ ] **Step 4: Run type check**

Run: `cd dashboard && npx tsc --noEmit`
Expected: Error — `RawLogView` does not exist yet. That's expected, we build it in Task 3.

- [ ] **Step 5: Commit (WIP)**

```bash
git add dashboard/src/routes/SessionPage.tsx
git commit -m "feat(wip): add conversation/raw-log tab bar to SessionPage"
```

---

### Task 3: Create RawLogView component

**Files:**
- Create: `dashboard/src/components/conversation/RawLogView.tsx`
- Create: `dashboard/src/components/conversation/RawLogView.test.tsx`

This component reuses the event display logic from the existing `RawLogTab.tsx` but is always scoped to the selected turn. It shows "Select a turn to see raw events" when no turn is selected.

- [ ] **Step 1: Write failing test — renders empty state**

Create `dashboard/src/components/conversation/RawLogView.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RawLogView } from "./RawLogView";

afterEach(cleanup);

describe("RawLogView", () => {
  it("shows empty state when no turn is selected", () => {
    render(<RawLogView turns={[]} allEvents={[]} activeTurnIndex={null} />);
    expect(screen.getByText("Select a turn to view raw events")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npx vitest run src/components/conversation/RawLogView.test.tsx --reporter=verbose`
Expected: FAIL — module not found.

- [ ] **Step 3: Create RawLogView with empty state**

Create `dashboard/src/components/conversation/RawLogView.tsx`:

```tsx
import { useState, useCallback, useMemo, useEffect, useRef, memo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { SessionEvent, AssistantEvent, ContentItem } from "../../lib/types";
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import { getEventsForTurn } from "../../lib/turnSnapshot";

export interface RawLogViewProps {
  turns: TurnSnapshot[];
  allEvents: SessionEvent[];
  activeTurnIndex: number | null;
}

function formatTimestampMs(ts: string): string {
  try {
    const d = new Date(ts);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return ts;
  }
}

function truncate(text: string, max = 80): string {
  const clean = text.replace(/\n/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max) + "...";
}

function extractSummary(event: SessionEvent): string {
  if (event.type === "assistant") {
    const msg = (event as AssistantEvent).message;
    const content = msg.content;
    if (typeof content === "string") return truncate(content);
    if (Array.isArray(content)) {
      const textItem = content.find((c: ContentItem) => c.type === "text");
      if (textItem && "text" in textItem) return truncate(textItem.text);
      const toolItem = content.find((c: ContentItem) => c.type === "tool_use");
      if (toolItem && "name" in toolItem) return `[tool_use: ${toolItem.name}]`;
    }
    return "";
  }
  if (event.type === "user") {
    const msg = event.message;
    if (typeof msg.content === "string") return truncate(msg.content);
    if (Array.isArray(msg.content)) {
      const textItem = msg.content.find((c: ContentItem) => c.type === "text");
      if (textItem && "text" in textItem) return truncate(textItem.text);
      const resultItem = msg.content.find((c: ContentItem) => c.type === "tool_result");
      if (resultItem && "tool_use_id" in resultItem) return "[tool_result]";
    }
    return "";
  }
  if (event.type === "system") return event.subtype || "";
  if (event.type === "progress") return event.data?.type || "";
  return "";
}

function highlightJson(json: string): string {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"([^"]+)":/g, '<span style="color:var(--acc)">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span style="color:var(--grn)">"$1"</span>')
    .replace(/: (\d+\.?\d*)/g, ': <span style="color:var(--amb)">$1</span>')
    .replace(/: (true|false|null)/g, ': <span style="color:var(--red)">$1</span>');
}

const TYPE_COLORS: Record<string, string> = {
  user: "var(--blu, #3b82f6)",
  assistant: "var(--pur, #a855f7)",
  system: "var(--t3)",
  progress: "var(--amb, #f59e0b)",
};

function RawLogViewInner({ turns, allEvents, activeTurnIndex }: RawLogViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(() => new Set());

  const activeTurn =
    activeTurnIndex !== null && activeTurnIndex >= 0 && activeTurnIndex < turns.length
      ? turns[activeTurnIndex]
      : undefined;

  const turnEvents = useMemo(
    () => (activeTurn ? getEventsForTurn(activeTurn, allEvents) : []),
    [activeTurn, allEvents],
  );

  // Reset expanded rows when turn changes
  useEffect(() => {
    setExpandedRows(new Set());
  }, [activeTurnIndex]);

  // Auto-scroll to top when turn changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTurnIndex]);

  const toggleRow = useCallback((index: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  if (!activeTurn) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-base">
        Select a turn to view raw events
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto dt-scrollbar">
      {turnEvents.map((event, i) => {
        const isExpanded = expandedRows.has(i);
        const typeColor = TYPE_COLORS[event.type] ?? TYPE_COLORS.system;
        return (
          <div key={event.uuid ?? `raw-${i}`}>
            <div
              onClick={() => toggleRow(i)}
              className="flex items-center gap-2 px-3 py-1 font-mono text-[11px] border-b border-white/[0.04] cursor-pointer hover:bg-dt-bg2/50 transition-colors duration-100"
            >
              <span className="text-[9px] text-dt-text3 w-3 shrink-0">
                {isExpanded ? "\u25BC" : "\u25B6"}
              </span>
              <span className="text-dt-text3 w-[80px] shrink-0">
                {formatTimestampMs(event.timestamp)}
              </span>
              <span
                className="text-[10px] px-[5px] py-px rounded-[3px] shrink-0 font-medium"
                style={{ border: `1px solid ${typeColor}`, color: typeColor }}
              >
                {event.type}
              </span>
              <span className="text-dt-text1 overflow-hidden text-ellipsis whitespace-nowrap">
                {extractSummary(event)}
              </span>
            </div>
            {isExpanded && (
              <div className="px-4 py-2 bg-dt-bg2/40 border-b border-white/[0.04]">
                <pre
                  className="font-mono text-[11px] m-0 whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{
                    __html: highlightJson(JSON.stringify(event, null, 2)),
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const RawLogView = memo(RawLogViewInner);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npx vitest run src/components/conversation/RawLogView.test.tsx --reporter=verbose`
Expected: PASS.

- [ ] **Step 5: Add test — renders events for selected turn**

Add to `RawLogView.test.tsx`:

```tsx
import type { TurnSnapshot } from "../../lib/turnSnapshot";
import type { AssistantEvent } from "../../lib/types";

function makeEvent(uuid: string, ts: string): AssistantEvent {
  return {
    type: "assistant",
    uuid,
    timestamp: ts,
    sessionId: "s1",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "Hello world" }],
      model: "claude-sonnet-4-20250514",
      id: "msg-1",
      type: "message",
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  } as AssistantEvent;
}

it("renders events for the selected turn", () => {
  const events = [
    makeEvent("e1", "2026-04-01T10:00:00.000Z"),
    makeEvent("e2", "2026-04-01T10:00:01.000Z"),
  ];
  const turns: TurnSnapshot[] = [
    {
      turnNumber: 1,
      startIndex: 0,
      endIndex: 2,
      startTime: "2026-04-01T10:00:00.000Z",
      agentId: "main",
      isSubagent: false,
      type: "user",
    },
  ];
  render(<RawLogView turns={turns} allEvents={events} activeTurnIndex={0} />);
  // Should render 2 event rows
  expect(screen.getAllByText(/10:00:0/)).toHaveLength(2);
});
```

- [ ] **Step 6: Run tests**

Run: `cd dashboard && npx vitest run src/components/conversation/RawLogView.test.tsx --reporter=verbose`
Expected: All PASS.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/components/conversation/RawLogView.tsx dashboard/src/components/conversation/RawLogView.test.tsx
git commit -m "feat: add RawLogView component for turn-scoped raw event inspection"
```

---

### Task 4: Wire RawLogView into SessionPage

**Files:**
- Modify: `dashboard/src/routes/SessionPage.tsx`

- [ ] **Step 1: Add import**

In `dashboard/src/routes/SessionPage.tsx`, add:

```typescript
import { RawLogView } from "../components/conversation/RawLogView";
```

The tab state and JSX from Task 2 Step 3 already references `RawLogView`. This import makes it resolve.

- [ ] **Step 2: Run type check**

Run: `cd dashboard && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run full test suite**

Run: `cd dashboard && npx vitest run --reporter=verbose`
Expected: All tests pass. If any BottomPanel tests fail due to the removed `liveEvents` prop or `raw-log` tab, fix them by removing the offending assertions.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/routes/SessionPage.tsx
git commit -m "feat: wire RawLogView into SessionPage conversation tabs"
```

---

### Task 5: Clean up — remove unused RawLogTab from bottom panel

**Files:**
- Delete: `dashboard/src/components/bottom-panel/RawLogTab.tsx`
- Delete: `dashboard/src/components/bottom-panel/RawLogTab.test.tsx`
- Modify: `dashboard/src/routes/AppLayout.tsx` (remove `liveEvents` prop if not yet done)

- [ ] **Step 1: Verify no remaining imports of RawLogTab**

Run: `cd dashboard && grep -r "RawLogTab" src/ --include="*.ts" --include="*.tsx"`
Expected: Only hits in `RawLogTab.tsx` and `RawLogTab.test.tsx` (already removed from BottomPanel in Task 1).

- [ ] **Step 2: Delete the files**

```bash
rm dashboard/src/components/bottom-panel/RawLogTab.tsx
rm dashboard/src/components/bottom-panel/RawLogTab.test.tsx
```

- [ ] **Step 3: Remove liveEvents from AppLayout → BottomPanel if not already done**

In `dashboard/src/routes/AppLayout.tsx`, remove the `liveEvents={currentLiveEvents}` prop from the `<BottomPanel>` call (around line 351). Also check `LayoutContext.ts` — if `currentLiveEvents` is only used for BottomPanel, it can stay for now (other consumers may use it).

- [ ] **Step 4: Run full test suite + type check**

```bash
cd dashboard && npx tsc --noEmit && npx vitest run --reporter=verbose
```
Expected: All pass, no type errors.

- [ ] **Step 5: Commit**

```bash
git add -u dashboard/src/components/bottom-panel/ dashboard/src/routes/AppLayout.tsx
git commit -m "chore: remove unused RawLogTab files"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd dashboard && npx vitest run --reporter=verbose
```

- [ ] **Step 2: Run type check**

```bash
cd dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Manual smoke test**

1. Open dashboard, select a session
2. Verify "Conversation" and "Raw Log" tabs appear above the conversation
3. Default tab is "Conversation" — shows normal conversation view
4. Click a turn, switch to "Raw Log" tab — shows raw JSONL events for that turn
5. Click expand arrow on an event row — shows full JSON
6. Bottom panel has 4 tabs: Agent Graph, Tool Call, Agent Log, Cost (no Raw Log)
7. Switch between turns while on Raw Log tab — content updates
8. No turn selected + Raw Log tab — shows "Select a turn to view raw events"
