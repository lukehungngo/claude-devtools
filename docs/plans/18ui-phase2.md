## UI-18b: Phase-Level Tool Grouping & Prompt Collapse

**Extends:** UI-18 (Enhanced Conversation Response Rendering)
**Depends on:** UI-14 (Tool call grouping — Level 1, DONE)
**Absorbs:** Prompt collapse feature (new)
**Status:** TODO
**Priority:** High — single biggest visual noise reduction remaining

---

## Problem

The current `ToolEntries.tsx` groups consecutive same-type tool calls (Level 1). This produces 10 rows for what is logically 2 phases of work. Three specific failures:

1. **Singletons escape grouping.** A lone `Grep "ContentItem"` or a single `Edit /path/to/Turn...` between two groups gets its own full row. These should merge into the surrounding phase.

2. **Type-boundary resets lose context.** `Grep → Read → Edit → Bash → Grep → Read → Edit` produces 7 rows. But both Grep→Read→Edit cycles are the same refactor. The grouping algorithm resets at every tool-type boundary, missing the semantic relationship.

3. **No phase label.** "Edit 5 files" tells you what tool ran. "Refactored VerdictBanner" tells you what happened. The user cares about the latter.

Additionally, long user prompts (pasted error logs, conversation dumps, task lists) create vertical noise that pushes the actual response off-screen.

---

## Solution

Two new compaction layers on top of the existing Level 1 grouping:

### Layer A: Level 2 Phase-Grouping (tool calls)

Group tool calls by **intent phase**, not just consecutive type. A phase is a cluster of tool calls that work toward a single sub-goal.

#### Phase boundary detection

A new phase starts when ANY of these are true:

1. **Assistant text gap.** The assistant wrote prose between two tool-call blocks. The prose is the phase boundary — it means the agent completed one thought and started another.

2. **File-set disjunction.** The current tool's target files share zero overlap with the previous 3 tools' targets. Example: tools touching `VerdictBanner.tsx`, `FindingBanner.tsx`, `ConversationView.tsx` → new tool touches `TurnDivider.tsx` with no overlap → new phase.

3. **Agent dispatch boundary.** A `Task` or `Agent` tool call always starts a new phase. The subagent's internal tool calls form their own sub-phase.

4. **Verification pattern.** A `Bash` running `test`, `lint`, `typecheck`, or `build` after a sequence of Edit calls is a verification step. It belongs to the current phase (does not start a new one) but can be labeled as verification.

#### Phase label inference

Priority order for generating the phase label:

1. **From assistant thinking/text preceding the phase.** If the assistant said "Now I'll refactor VerdictBanner..." before the tool calls, extract the intent. Truncate to 60 chars.

2. **From the first Grep/Glob pattern.** If the phase starts with `Grep "VerdictBanner|extractVerdict"`, the label is "Refactored VerdictBanner".

3. **From the dominant file path.** If 4/6 tools target files in `components/conversation/`, label is "Updated conversation components".

4. **Fallback.** "{N} tool calls" — only if nothing better is available.

#### Rendering

```
▸ ✓ Refactored VerdictBanner + FindingBanner    Grep 3 · Read 5 · Edit 9 · Bash 1
▸ ✓ Updated ContentItem + TurnDivider           Grep 1 · Edit 1 · Bash 3
```

- Collapsed by default. Click to expand → shows Level 1 groups inside.
- Phase row shows: chevron, status icon, phase label, tool-type pill counts.
- Status: ✓ if all tools succeeded, ✗ if any error (auto-expand on error).
- Pill counts use the existing colored badges (`Grep 3`, `Read 5`, etc.).

#### When NOT to phase-group

- **Single tool call:** Never wrap a single tool in a phase. Show it as a regular Level 1 row.
- **2 consecutive same-type tools:** Already handled by Level 1 (`Read 2 files`). No phase wrapper needed.
- **Error tools:** Always visible as individual rows. Never hide inside a collapsed phase.
- **Agent dispatch (Task/Agent):** Gets its own `AgentCard` component (UI-18 Principle 6), not a phase group.

#### Singleton absorption

A singleton tool call (1 tool that doesn't match the type above or below) gets absorbed into the nearest phase:

- If the singleton's target files overlap with the phase above → absorb upward.
- Else if overlap with phase below → absorb downward.
- Else → keep as standalone row (genuinely independent).

Example: A lone `Bash rm VerdictBanner.tsx` between two Edit groups. The `rm` touches VerdictBanner → overlaps with the Edit group above → absorbed into the "Refactored VerdictBanner" phase.

---

### Layer B: Prompt Collapse (user messages)

#### Content type taxonomy

Every user prompt is classified into one of 5 types. Classification runs top-to-bottom, first match wins:

| # | Type | Detection | Collapse rule |
|---|------|-----------|---------------|
| 1 | **Command/trigger** | Starts with `/`, matches `<next>`, `<continue>`, known workflow triggers, `!` bash prefix | **Never collapse.** Render command as pill: `[/dev-loop] implement auth flow --auto` |
| 2 | **Short intent** | Total text ≤ 5 lines AND ≤ 500 chars | **Never collapse.** Show full text. |
| 3 | **Structured task list** | Contains 3+ numbered items (`1.`, `2.`, `-`) or `TASK-{id}` patterns | **Show first 3 items + collapse rest.** `+N more tasks (click to expand)` |
| 4 | **Intent + pasted blob** | First sentence ends with `:` or newline, remainder is ≥ 5 lines of code/log/JSON/XML | **Show intent line + collapse blob.** `+N lines of {type} (click to expand)` |
| 5 | **Long prose** | Text exceeds 500 chars but doesn't match above patterns | **Show first 3 lines + collapse rest.** `+N lines (click to expand)` |

#### Blob type detection (for semantic collapse label)

When collapsing a blob (type 4), detect the content type for the label:

| Heuristic | Label |
|-----------|-------|
| Lines starting with `at `, `Error:`, `TypeError:`, `Traceback` | `+N lines of error log` |
| Lines with heavy indentation + `{`/`}`/`;`/`import`/`function`/`const` | `+N lines of code` |
| Starts with `{` or `[`, valid-looking JSON | `+N lines of JSON` |
| Contains `<` tags, XML-like | `+N lines of markup` |
| Resembles conversation (alternating speaker turns, timestamps) | `+N lines of conversation context` |
| Default | `+N lines` |

#### Command pill rendering

Commands and workflow triggers render with visual distinction:

```
[/dev-loop]  implement auth flow --auto
[/compact]   focus on auth module
[<next>]
[!git status]
```

- Pill background: `var(--bg-info)` / `var(--text-info)` for slash commands.
- Pill background: `var(--bg-warn)` / `var(--text-warn)` for `<next>`, `<continue>` tokens.
- Pill background: `var(--bg-s)` / `var(--t1)` for `!` bash commands.
- Arguments shown as regular text after the pill.

---

## Implementation

### Files to create

| File | Purpose |
|------|---------|
| `dashboard/src/lib/phaseGrouping.ts` | Phase detection algorithm + label inference |
| `dashboard/src/lib/promptClassifier.ts` | Prompt content type classification |
| `dashboard/src/components/conversation/PhaseGroup.tsx` | Phase group wrapper component |
| `dashboard/src/components/conversation/CollapsiblePrompt.tsx` | Collapsible user prompt component |
| `dashboard/src/components/conversation/CommandPill.tsx` | Command/trigger pill rendering |

### Files to modify

| File | Change |
|------|--------|
| `dashboard/src/components/conversation/ToolEntries.tsx` | Import `phaseGrouping`, wrap existing Level 1 groups in Level 2 phases |
| `dashboard/src/components/conversation/ConversationView.tsx` | Use `CollapsiblePrompt` for user message rendering |

### Algorithm: `phaseGrouping.ts`

```typescript
interface Phase {
  label: string;
  groups: ToolGroup[];       // Level 1 groups from existing groupToolEntries()
  status: "success" | "running" | "error";
  toolCounts: Record<string, number>;  // { Read: 5, Grep: 3, Edit: 9 }
}

function groupIntoPhases(
  groups: ToolGroup[],
  assistantTextBoundaries: number[],  // indices where assistant text appears
  thinkingContext?: string[],         // assistant text/thinking for label inference
): Phase[]
```

Phase boundary detection runs in order:
1. Split at assistant text boundaries (definitive).
2. Within each text-bounded section, check file-set disjunction (Jaccard similarity < 0.1 between rolling window of 3 tools and the next tool).
3. Absorb singletons using file-path overlap.
4. Infer labels from thinking context, grep patterns, or dominant file paths.

### Algorithm: `promptClassifier.ts`

```typescript
type PromptType =
  | { type: "command"; command: string; args: string }
  | { type: "short_intent" }
  | { type: "task_list"; items: string[]; visibleCount: number }
  | { type: "intent_blob"; intent: string; blob: string; blobType: string; blobLines: number }
  | { type: "long_prose"; visibleLines: string[]; remainingLines: number }

function classifyPrompt(text: string): PromptType
```

---

## Acceptance criteria

```bash
# Phase grouping tests
cd dashboard && pnpm vitest run src/lib/phaseGrouping.test.ts

# Prompt classifier tests
cd dashboard && pnpm vitest run src/lib/promptClassifier.test.ts

# Component tests
cd dashboard && pnpm vitest run src/components/conversation/PhaseGroup.test.tsx
cd dashboard && pnpm vitest run src/components/conversation/CollapsiblePrompt.test.tsx

# Type check
cd dashboard && npx tsc --noEmit

# Visual verification
# 1. Open a session with 10+ tool calls → should show ≤3 phase groups
# 2. Paste a long error log as prompt → should show intent + collapsed blob
# 3. Type "/dev-loop implement X" → should show command pill
# 4. Error tool calls → always visible, never hidden in collapsed phase
```

### Specific assertions

- 10 consecutive tool calls across 2 logical refactors → renders as 2 phase groups (not 10 rows).
- A singleton `Bash rm file.tsx` between two Edit groups → absorbed into the overlapping phase.
- `Grep "pattern" → Read 3 → Edit 5 → Bash rm → Grep 2 → Read 2 → Edit 3` with all files overlapping → 1 phase.
- Same sequence but second cycle touches completely different files → 2 phases.
- Phase with 1 failing tool → phase row shows ✗, auto-expanded.
- User prompt starting with `/dev-loop` → command pill, never collapsed.
- User prompt `"fix this:\n" + 50-line stack trace` → intent visible, blob collapsed with "+50 lines of error log".
- User prompt `"<next>"` → pill, always visible.
- User prompt with 7 numbered tasks → shows 3 + "+4 more tasks".
- User prompt under 5 lines → always shown in full.

---

## Performance constraints

- Phase grouping must be O(n) where n = number of tool calls in the turn. No nested loops over the full event list.
- Prompt classification must be O(1) — runs once per user message, no regex backtracking on large blobs.
- Expand/collapse state is local component state. No context/store updates on toggle.
- Collapsed blobs are NOT removed from DOM — they're hidden with `display: none` so expand is instant.

---

## Out of scope

- AI-powered phase labeling (calling Claude to summarize what a phase did). Labels are heuristic-only.
- Cross-turn phase grouping. Phases are scoped to a single assistant response.
- Reordering tool calls. Display order always matches execution order.
- Persistent collapse state across page navigation. Reset on remount.
