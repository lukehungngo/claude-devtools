# Agent Log Export & UX Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add data export to the Agent Log tab and fix whitespace/truncation UX issues so all groups are collapsed by default and content is compact.

**Architecture:** Two independent changes: (1) Export button in the header that serializes `LogEntry[]` and `TimelineGroup[]` to JSON and triggers a download. (2) UX fix — start with all groups collapsed (`collapsedGroups` initialized to all indices), reduce vertical padding, and ensure messages use `text-ellipsis` properly.

**Tech Stack:** React, TypeScript, Vitest, Tailwind (`dt-*` tokens)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `dashboard/src/components/AgentLogs.tsx` | Main component — add export button, fix collapsed default, reduce spacing |
| `dashboard/src/lib/exportAgentLog.ts` | Pure function: serialize entries/groups to JSON, trigger download |
| `dashboard/src/lib/exportAgentLog.test.ts` | Unit tests for the export serialization |
| `dashboard/src/components/bottom-panel/AgentLogTab.test.tsx` | Update existing tests if needed |

---

### Task 1: Add `exportAgentLog()` utility

**Files:**
- Create: `dashboard/src/lib/exportAgentLog.ts`
- Create: `dashboard/src/lib/exportAgentLog.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// dashboard/src/lib/exportAgentLog.test.ts
import { describe, it, expect } from "vitest";
import { buildExportPayload } from "./exportAgentLog";

describe("buildExportPayload", () => {
  it("returns structured JSON with entries and groups", () => {
    const entries = [
      {
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        agentId: "main",
        agentType: "main",
        message: "hello",
        toolName: null,
        isError: false,
        cost: 0.1,
      },
    ];
    const groups = [
      {
        agentId: "main",
        agentType: "main",
        depth: 0,
        entries,
        startTime: "2026-01-01T00:00:00Z",
        endTime: "2026-01-01T00:00:05Z",
        durationMs: 5000,
        cost: 0.1,
      },
    ];

    const result = buildExportPayload(entries, groups);
    const parsed = JSON.parse(result);

    expect(parsed.entries).toHaveLength(1);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.totalEntries).toBe(1);
    expect(parsed.totalGroups).toBe(1);
  });

  it("includes rawMessage when present", () => {
    const entries = [
      {
        uuid: "u1",
        timestamp: "2026-01-01T00:00:00Z",
        agentId: "main",
        agentType: "main",
        message: "short",
        rawMessage: "full long message content here",
        toolName: "Read",
        isError: false,
        cost: 0,
      },
    ];

    const result = buildExportPayload(entries, []);
    const parsed = JSON.parse(result);
    expect(parsed.entries[0].rawMessage).toBe("full long message content here");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd dashboard && npx vitest run src/lib/exportAgentLog.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// dashboard/src/lib/exportAgentLog.ts
import type { LogEntry, TimelineGroup } from "../components/AgentLogs";

interface ExportPayload {
  exportedAt: string;
  totalEntries: number;
  totalGroups: number;
  entries: LogEntry[];
  groups: Array<{
    agentId: string;
    agentType: string;
    depth: number;
    entryCount: number;
    startTime: string;
    endTime: string;
    durationMs: number;
    cost: number;
  }>;
}

export function buildExportPayload(
  entries: LogEntry[],
  groups: TimelineGroup[]
): string {
  const payload: ExportPayload = {
    exportedAt: new Date().toISOString(),
    totalEntries: entries.length,
    totalGroups: groups.length,
    entries,
    groups: groups.map((g) => ({
      agentId: g.agentId,
      agentType: g.agentType,
      depth: g.depth,
      entryCount: g.entries.length,
      startTime: g.startTime,
      endTime: g.endTime,
      durationMs: g.durationMs,
      cost: g.cost,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd dashboard && npx vitest run src/lib/exportAgentLog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/lib/exportAgentLog.ts dashboard/src/lib/exportAgentLog.test.ts
git commit -m "feat: add exportAgentLog utility for Agent Log data export"
```

---

### Task 2: Wire export button into AgentLogs header

**Files:**
- Modify: `dashboard/src/components/AgentLogs.tsx:482-502` (header section)

- [ ] **Step 1: Add import and export handler**

At the top of `AgentLogs.tsx`, add the import:

```typescript
import { buildExportPayload, downloadJson } from "../lib/exportAgentLog";
```

Inside the `AgentLogs` component, after the existing `resumeAutoScroll` callback (~line 477), add:

```typescript
const handleExport = useCallback(() => {
  const payload = buildExportPayload(filteredEntries, timelineGroups);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  downloadJson(payload, `agent-log-${timestamp}.json`);
}, [filteredEntries, timelineGroups]);
```

- [ ] **Step 2: Add export button to the header**

In the header `<div className="flex gap-1">` section (around line 492), add the export button before the auto-scroll button:

```tsx
<button
  onClick={handleExport}
  className="w-7 h-7 flex items-center justify-center rounded-dt-sm text-dt-text2 cursor-pointer border-none bg-transparent hover:bg-dt-bg3/50 transition-all duration-150 text-sm"
  title="Export agent log as JSON"
>
  &#x2913;
</button>
```

The `⤓` character (U+2913, downwards arrow to bar) is the download icon.

- [ ] **Step 3: Run tests**

Run: `cd dashboard && npx vitest run src/components/bottom-panel/AgentLogTab.test.tsx`
Expected: PASS (no breaking changes)

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/AgentLogs.tsx
git commit -m "feat: add export button to Agent Log header"
```

---

### Task 3: Collapse all groups by default and fix whitespace

**Files:**
- Modify: `dashboard/src/components/AgentLogs.tsx:377` (collapsedGroups init)
- Modify: `dashboard/src/components/AgentLogs.tsx:430-448` (flatItems memo)
- Modify: `dashboard/src/components/AgentLogs.tsx:590,660` (padding)

The current code initializes `collapsedGroups` as an empty Set (all expanded). We need to:
1. Start with all groups collapsed
2. Reduce vertical padding on rows
3. Make the header row more compact

- [ ] **Step 1: Initialize collapsedGroups from timelineGroups**

Replace the state initialization at line 377:

```typescript
// OLD:
const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

// NEW: Track which groups are EXPANDED (inverted logic — simpler for "all collapsed by default")
const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
```

Update the collapse toggle handler in the agent-header onClick (~line 582-589):

```typescript
onClick={() => {
  setExpandedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(groupIndex)) next.delete(groupIndex);
    else next.add(groupIndex);
    return next;
  });
}}
```

Update flatItems memo (~line 430-448) — flip the condition:

```typescript
const flatItems: FlatItem[] = useMemo(() => {
  const items: FlatItem[] = [];
  for (let gi = 0; gi < timelineGroups.length; gi++) {
    const group = timelineGroups[gi];
    items.push({ kind: "agent-header", group, groupIndex: gi });
    if (expandedGroups.has(gi)) {  // was: !collapsedGroups.has(gi)
      for (let ei = 0; ei < group.entries.length; ei++) {
        items.push({
          kind: "entry",
          entry: group.entries[ei],
          depth: group.depth,
          groupIndex: gi,
          entryIndex: ei,
        });
      }
    }
  }
  return items;
}, [timelineGroups, expandedGroups]);
```

Update the collapse arrow direction (~line 599) — flip the rotation:

```tsx
<span className={`text-[8px] text-dt-text2 transition-transform duration-150 ${isCollapsed ? "-rotate-90" : "rotate-0"}`}>
```

becomes:

```tsx
const isExpanded = expandedGroups.has(groupIndex);
// ...
<span className={`text-[8px] text-dt-text2 transition-transform duration-150 ${isExpanded ? "rotate-0" : "-rotate-90"}`}>
```

- [ ] **Step 2: Reduce row padding for compactness**

Agent header rows (~line 590): Change `py-1.5` to `py-1`:
```tsx
className="flex items-center gap-2 py-1 cursor-pointer select-none border-b border-white/[0.03]"
```

Entry rows (~line 660): Change `py-1.5` to `py-0.5`:
```tsx
className={`flex items-start gap-2 py-0.5 pr-3 text-[11px] border-b border-white/[0.02] ...`}
```

Update virtualizer row height estimates (~line 454):
```typescript
estimateSize: (index: number) => flatItems[index]?.kind === "agent-header" ? 28 : 22,
```

- [ ] **Step 3: Run all Agent Log tests**

Run: `cd dashboard && npx vitest run src/components/bottom-panel/AgentLogTab.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/AgentLogs.tsx
git commit -m "fix: collapse Agent Log groups by default and reduce whitespace"
```

---

### Task 4: Fix message truncation — ensure text-ellipsis works in flex layout

**Files:**
- Modify: `dashboard/src/components/AgentLogs.tsx:687-702` (message span)

The truncation issue: `text-ellipsis` requires `overflow: hidden` AND a constrained width. In a flex layout with `flex-1 min-w-0`, the message span can still overflow if the parent flex container doesn't constrain it.

- [ ] **Step 1: Fix the message span classes**

Replace the message span (~line 687-702):

```tsx
{/* Message */}
<span
  onClick={() => hasMore && toggleExpand(entry.uuid)}
  className={`text-dt-text1 leading-[1.3] flex-1 min-w-0 ${
    isExpanded
      ? "whitespace-pre-wrap break-all"
      : "truncate"
  } ${hasMore ? "cursor-pointer" : "cursor-default"}`}
>
  {highlightMessage(displayMessage)}
  {hasMore && !isExpanded && (
    <span className="text-[9px] text-dt-accent ml-1 opacity-70">{"\u25B6"}</span>
  )}
  {isExpanded && (
    <span className="text-[9px] text-dt-accent ml-1 opacity-70">{"\u25BC"}</span>
  )}
</span>
```

Key changes:
- Use Tailwind's `truncate` class (combines `overflow-hidden`, `text-ellipsis`, `whitespace-nowrap`) instead of separate classes
- Reduce `leading-[1.4]` to `leading-[1.3]` for compactness

- [ ] **Step 2: Verify the entry row parent constrains width**

The entry row div (~line 659) uses `flex items-start gap-2`. Confirm it has no `overflow-x-hidden` issue. The parent `scrollRef` div (~line 531) already has `overflow-x-hidden`, which should constrain child widths. No change needed here — just verify.

- [ ] **Step 3: Run tests**

Run: `cd dashboard && npx vitest run src/components/bottom-panel/AgentLogTab.test.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `cd dashboard && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/AgentLogs.tsx
git commit -m "fix: use Tailwind truncate class for proper text ellipsis in Agent Log"
```

---

## Dependency Graph

```
Task 1 (export utility) → Task 2 (wire export button)
Task 3 (collapse default + spacing) — independent
Task 4 (truncation fix) — independent

Parallel-safe: Task 1 and Task 3/4 can run in parallel.
Task 2 depends on Task 1.
```

## Risk Assessment

- **Inverted collapsedGroups logic** — Renaming `collapsedGroups` to `expandedGroups` changes the boolean sense. Every reference must be updated. Risk: missing one reference causes groups to expand/collapse backwards. Mitigation: search for all `collapsedGroups` references before committing.
- **Virtualizer height estimate mismatch** — Reducing padding without updating `estimateSize` causes scroll jitter. Mitigation: Task 3 updates both together.
- **Export button position** — Adding a button to the header shouldn't break layout, but verify it doesn't overlap on narrow panels.

## Self-Review

1. **Spec coverage:** Export (Task 1+2) ✓, Whitespace (Task 3) ✓, Truncation (Task 4) ✓, Collapse by default (Task 3) ✓
2. **Placeholder scan:** No TBDs, TODOs, or vague steps found.
3. **Type consistency:** `LogEntry` and `TimelineGroup` types are imported from `AgentLogs.tsx` in Task 1. `buildExportPayload` signature matches usage in Task 2. `expandedGroups` replaces `collapsedGroups` consistently in Task 3.
