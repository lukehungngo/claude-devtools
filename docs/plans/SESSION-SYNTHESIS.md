# Session synthesis — verified bugs + features

**Updated 2026-05-16 after JSONL verification pass (21 sessions, 199,301 events).**

---

## Verification pass — what changed

| Earlier claim | Verdict | Evidence |
|---|---|---|
| TodoWrite is the real tool | ❌ FALSE | 0 calls in 199k events |
| TaskCreate/TaskUpdate are dead branches | ❌ FALSE | 56 + 107 real calls |
| `t.id` is the canonical stable ID we should read | ❌ FALSE | Tasks don't have `id` field. `subject` carries the human ID; `TaskUpdate.taskId` is server-assigned sequential |
| Subagent TodoWrite contaminates main via missing `isSidechain` filter | ❌ FALSE | 0 sidechain events in 199k. The premise is false. |
| Partial/streaming `tool_use` can shrink the list | ⚠️ LIKELY FALSE | SSE pipeline emits full assistant message at `content_block_stop`; partial `tool_delta` is a separate event type that doesn't reach the deriver |
| `normalizeStatus` catch-all degrades unknown values | ⚠️ NOT OBSERVED | Only `in_progress` and `completed` ever emitted |
| Subagent execution lives in sidechain events | ❌ FALSE | Lives in `tool_result` user events keyed by `tool_use_id` of the Agent dispatch |
| Bottom Tasks tab not turn-scoped | ✅ TRUE | `BottomPanel:86` confirmed |
| Spacing scale `--sp-*` missing | ✅ TRUE | Verified |
| CASRow raw hexes | ✅ TRUE | Verified |
| Legacy alias bloat | ✅ TRUE | Verified |

---

## Open work (verified, prioritized)

### 🔴 P0 — Data correctness

#### B-A. TaskUpdate has no handler
- **File:** `dashboard/src/lib/sessionTasks.ts`
- **What:** `TASK_TOOLS` lists `TaskUpdate` but no `else if` branch handles it. 107 status updates per session silently dropped → "0/11 completed" symptom.
- **Doc:** `docs/bugs/task-derivation-gaps.md` (P0 section)
- **Fix:** add TaskUpdate branch that maps `taskId` → entry, normalizes status.

#### B-B. Subagent state not joined from `tool_result`
- **Files:** `dashboard/src/lib/turnSnapshot.ts`, `server/src/analyzer/agentStatus.ts`
- **What:** Turn completion checks main agent's `end_turn` only. Should also require every `Agent` tool_use to have a matching `tool_result` user event before declaring the turn done.
- **Doc:** `docs/bugs/subagent-execution-missed.md`
- **Data confirmed available:** every Agent dispatch in completed sessions had a matching `tool_result` keyed by `tool_use_id`. Live subagents naturally appear as "no result yet" → "running".

### 🟠 P1 — Visible correctness

#### B-C. TaskCreate uses `description`, should use `subject`
- **File:** `dashboard/src/lib/sessionTasks.ts`
- **What:** Real TaskCreate input has `subject` (terse, with built-in ID like `"TASK-001: …"`) AND `description` (long body). We show `description`. Panel ends up showing the long-form prompt instead of the task title.
- **Doc:** `docs/bugs/task-derivation-gaps.md` (P1 #1)

#### B-D. taskId binding fragile
- **File:** `dashboard/src/lib/sessionTasks.ts`
- **What:** TaskUpdate refers to `taskId: "1", "2", …` (server-assigned). To match, either read the tool_result for each TaskCreate or assume sequential. Doc proposes sequential as v1.
- **Doc:** `docs/bugs/task-derivation-gaps.md` (P1 #2)

#### B-E. Bottom Tasks tab ignores turn scope
- **File:** `dashboard/src/components/bottom-panel/BottomPanel.tsx:86`
- **What:** Calls `deriveSessionTasks(events)` with no turn slice. Sibling tabs respect `viewingTurnNumber`.
- **Doc:** `docs/bugs/tasks-not-scoped-to-turn.md`

#### F-1. Add `--sp-*` spacing scale
- **File:** `dashboard/src/styles/globals.css`
- **What:** 12-step spacing tokens missing; 78+ components use raw `padding: "Xpx Ypx"`.
- **Doc:** `docs/design/ui-ux-validation-report.md` (Gap #1)

#### F-2. Replace Tailwind hexes in `CASRow.tsx`
- **File:** `dashboard/src/components/insights/CASRow.tsx:15-22`
- **What:** `#6366f1`, `#f59e0b`, … off-system. Swap to `--span-*` or add `--cat-*` aliases.
- **Doc:** `docs/design/ui-ux-validation-report.md` (Gap #2)

#### F-3. Deprecate legacy alias tokens
- **File:** `dashboard/src/styles/globals.css`
- **What:** 20+ duplicate names (`--bg-0..4`, `--accent*`, `--border*`, `--cyan/purple/pink/rose/sky/orange`). Drift risk.
- **Doc:** `docs/design/ui-ux-validation-report.md` (Gap #3)

### 🟡 P2 — Polish

| # | What | Doc |
|---|---|---|
| F-4 | Rename `--focus-ring` → `--ring` for design parity | ui-ux-validation-report.md Gap #4 |
| F-5 | Audit 479 inline `style={{…}}` — convert boilerplate to classes | ui-ux-validation-report.md Gap #5 |
| F-6 | Background Agents + Agent Graph visual rebuild per Anthropic design | harden-background-agents-and-agent-graph.md |

### 🔵 P3 — Micro-UX

| # | What | Doc |
|---|---|---|
| F-7 | Clicking "Active Only" silently triggers `onRefresh()` | ux-backlog.md |

---

## Dropped (now confirmed not-bugs)

- ~~Subagent TodoWrite contaminates main task list~~ — no sidechain events exist
- ~~Partial/streaming tool_use shrinks list~~ — full assistant ships once content_block_stop fires
- ~~`t.id` is the stable ID we should read~~ — wrong field; use `subject` + sequential taskId
- ~~TaskCreate/TaskUpdate are dead branches~~ — they're the real, only tools
- ~~normalizeStatus catch-all causes drift~~ — no unknown values observed

---

## Dependency graph (revised)

```
┌─────────────────────────────────────────────────────────────┐
│ B-A (TaskUpdate handler)  ─┐                                │
│ B-C (subject field)        ├─►  one PR: task derivation fix │
│ B-D (taskId binding)       │                                │
└────────────────────────────┴────────────────────────────────┘
                                │
                                ▼
                       B-E (turn scope) ───► uses shared per-turn derivation

┌──────────────────────────────────────────────────────────────┐
│ B-B (tool_result join) ───► turnSnapshot + agentStatus rewrite│
│                                                              │
│   Needed for: F-6 visual polish (which expects live state)   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ F-1 (--sp-*) ──┐                                             │
│ F-2 (CASRow)   ├─► design-system hygiene PR (one round)      │
│ F-3 (aliases)  │                                             │
│ F-4 (--ring)   │                                             │
└────────────────┴──► unblocks F-5 (inline-style audit)        │
                                ▼                              │
                       F-6 (visual rebuild) ──────────────────►
```

## Recommended ship order

1. **B-A + B-C + B-D** — one PR. Test fixture exercises the full flow. Fixes the most user-visible symptom.
2. **B-B** — separate PR. Larger surface (turnSnapshot + agentStatus). Higher review cost.
3. **F-1 + F-2 + F-3 + F-4** — one "design-system hygiene" PR. Grep-replace + smoke-test all themes.
4. **B-E** — pull shared per-turn derivation into `lib/sessionTasks.ts`. Small PR.
5. **F-5** — audit & cleanup pass. Open-ended.
6. **F-6** — visual rebuild on top of clean tokens, scope-aware tabs, correct data.
7. **F-7** — drop-in micro-UX.

## Coordination

- Other agent still active on repo per session note. Hold start of any wave until their branch merges.
- B-A and F-1 are tiny (≤20 lines each) — could be cherry-picked into their branch if needed.
- The single biggest unblocking move is **B-A** — it converts "0/11 completed" into the right number with minimal risk.
