# Conversation Signal/Noise Collapse Policy — Design

**Status:** Approved scope (option 3 — surgical collapse-policy rewrite)
**Date:** 2026-05-18
**Scope:** Dashboard conversation panel — default expanded/collapsed state of tool-call entries and thinking blocks.

## Problem

The conversation panel today gives equal visual weight to every tool call. A turn that's conceptually "Claude planned, dispatched 3 subagents, and ran a few bookkeeping calls" renders as ~14 rows: state-changing actions sit next to grouped `TaskUpdate ×3` and `TaskUpdate ×2` rows, the panel scrolls past anything interesting, and the thinking — which is the highest-signal content in the turn — is hidden behind a click even when it's 780 characters.

Two screenshots from the user (2026-05-18 21:33 and 21:35) show this concretely:
- A 14-row tool-call block where 5 rows are bookkeeping (`TaskUpdate`) and 3 are the actually-interesting subagent dispatches.
- A thinking block collapsed to `▶ WORKING 9 steps · 780 chars` — about a paragraph, but invisible until clicked.

## Goal

> **Show reasoning and state changes. Hide accounting and reads. Threshold by length.**

After this change, the same turn renders as ~5-6 rows: the thinking expanded inline, the 3 subagent dispatches one row each, and a single chip — `+ 11 task updates · 4 reads · 2 bashes` — replacing the wall of bookkeeping rows.

## Non-goals

- Macro-level "skim mode" / one-line-per-turn session view. (That's the follow-up — option 1 in the brainstorm.)
- Per-turn outcome chips at the turn header (`📝 3 edits · 🤖 2 subagents`). Same follow-up.
- Restructuring the tool-call DOM, collapsible wrapper component, or click-to-expand interaction itself — only changes the **default** state and the **grouping rules**.
- Insights / sidebar / bottom panel / top bar. Conversation panel only.

## The signal-vs-noise rule

| Category | Default | Tools |
|---|---|---|
| **Reasoning** | Expanded (truncate at 1500 chars with inline "show more") | Thinking blocks, response text |
| **Spawn** | Expanded, 1 row each | `Task`, `Agent` (and synonyms: `dispatch_agent`) |
| **State change** | Expanded, 1 row each | `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Bash` (any exit code), `Delete` |
| **Routine read-only** | Collapsed into a single chip with counts | `Read`, `Glob`, `Grep`, `LS`, `BashOutput`, `NotebookRead`, `WebFetch`, `WebSearch` |
| **Internal accounting** | Collapsed into a single chip with counts | `TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList`, `TaskOutput`, `TaskStop`, `TaskUpdate`, `TodoWrite` |
| **Unknown** | Treat as routine read-only (safe default) | Any tool name not in the table above |

The chips render as muted, single-line indicators that the user can click to expand into the existing per-row view. The view that exists today becomes the *expanded* state, not the *default* state.

### Two distinct chips — not one

Routine and accounting collapse into **two separate chips** in the order they first appeared:

```
+ 4 reads · 2 greps · 1 glob          (routine)
+ 11 task updates · 3 task creates    (accounting)
```

Keeping them separate matters because:
- Routine reads suggest "Claude was investigating something" — sometimes interesting.
- Accounting (task list updates) is pure ledger keeping — never interesting unless debugging the agent's planning behavior.

A user scanning the panel learns the shape from chip *labels*, not by clicking.

### Thinking length threshold

| Length | Default state |
|---|---|
| `< 1500` chars | Fully expanded inline |
| `≥ 1500` chars | First ~1000 chars shown + "Show more" link that toggles inline expansion (no separate modal, no separate collapse triangle) |

1500 was chosen because most thinking blocks in practice are 200-1200 chars (a few short paragraphs of reasoning). Long blocks (multi-thousand chars) come from extended thinking on complex prompts and are the exception. 1000 chars of preview is roughly 5 sentences — enough to know if the reasoning is worth scrolling more.

A `prefers-reduced-motion: reduce` user doesn't need different treatment — the expansion is instant DOM mutation.

## Design

### New module — `dashboard/src/lib/toolClassification.ts`

Single exported function:

```ts
export type ToolCategory =
  | "spawn"         // Task, Agent — fan-out into a subagent
  | "state"         // Edit, Write, Bash, etc. — mutates the world
  | "routine"       // Read, Glob, Grep — observes the world
  | "accounting";   // TaskCreate/TaskUpdate/TodoWrite — agent's own ledger

export function classifyToolCall(name: string): ToolCategory;
```

Lookup table is a single `Record<string, ToolCategory>` keyed by tool name. Names not in the table return `"routine"` (safe default — they're shown but folded into the chip).

This is the single source of truth used by `ToolEntries.tsx` and (later) any macro-summary code that needs to count categories.

### Modified — `ToolEntries.tsx`

Today this component renders all tool entries as a vertical list of rows (some grouped by `name × count` already). Change:

1. **Pass each entry through `classifyToolCall`** to get its category.
2. **Render in three sections**, in fixed order:
   1. **State + Spawn**: one row each, full detail (description, args, tokens, duration). This is the current renderer applied to a filtered list.
   2. **Routine chip** (only if any routine entries exist): one row showing `+ <n> reads · <n> greps · <n> globs · <n> ls`. Click → expands inline to show the full row list of routine tools (the existing per-row renderer scoped to this category).
   3. **Accounting chip** (only if any accounting entries exist): one row showing `+ <n> task updates · <n> task creates · <n> todos`. Same expand behavior.

Visual treatment of the chips:

- Muted background (`var(--bg-s)` or similar), no border.
- Same height as a tool row, single line of mono text.
- Subtle right-arrow / triangle on the left to signal expandability.
- On expand: chip stays visible as a header, rows render below it.
- Counts use compact labels — singular when count is 1 (`+ 1 read`, not `+ 1 reads`).

### Modified — `ThinkingBlock.tsx` / `ThinkingGroup`

Today the thinking block defaults to collapsed regardless of length. Change:

1. **On mount**, check the combined character length of all thinking content for the block.
2. If `< 1500`: render expanded by default. Hide the triangle / "click to expand" affordance entirely (there's nothing to expand).
3. If `≥ 1500`: render the first 1000 chars + an inline `… [Show more]` button. Clicking expands the rest inline. (No modal, no separate scroll surface.) Once expanded, the button changes to `[Show less]`.

The existing keyboard accessibility (the wrapping element being a button or having `role="button"`) is preserved when length ≥ 1500; not needed when fully expanded.

## Implementation files

| File | Change |
|---|---|
| `dashboard/src/lib/toolClassification.ts` (new) | The category lookup |
| `dashboard/src/lib/toolClassification.test.ts` (new) | Unit tests — each known tool maps to expected category, unknown → routine |
| `dashboard/src/components/conversation/ToolEntries.tsx` | Filter into 3 sections, render chips for routine + accounting, keep current row renderer for state + spawn |
| `dashboard/src/components/conversation/ToolEntries.test.tsx` (existing or extend) | New tests: routine collapses to chip; chip click expands inline; state + spawn always show rows |
| `dashboard/src/components/viewer/ThinkingBlock.tsx` | Length-aware default + inline show-more |
| `dashboard/src/components/viewer/ThinkingBlock.test.tsx` (existing or new) | Tests: <1500 expanded, ≥1500 truncated with show-more, toggle works |

Total: 2 new files + 2 existing edits + 1-2 test extensions. No CSS file changes needed (use existing tokens).

## Tests

### Unit — `toolClassification.test.ts`

Each row of the category table is a test. Plus:

- Unknown tool name (`"FrobnicateThing"`) → returns `"routine"`.
- Case-sensitive (`"task"` ≠ `"Task"`) — match the actual names Claude Code emits.

### Component — `ToolEntries.test.tsx` (new cases)

- Given a list of 3 Read + 2 Edit + 1 Task tool entries: renders 1 routine chip ("+ 3 reads"), 2 expanded Edit rows, 1 expanded Task row. 4 rows total (chip + 2 + 1), not 6.
- Routine chip click → renders the 3 Read rows inline below it.
- Accounting chip is separate from routine chip, even if both have entries.
- A turn with only accounting entries renders just one chip, no other rows.

### Component — `ThinkingBlock.test.tsx` (new cases)

- 500-char thinking content → renders fully visible, no "show more" affordance.
- 1500-char thinking content → renders first ~1000 chars + "Show more" button. Click → renders all content.
- "Show more" button toggles to "Show less" when expanded.
- 1499 chars → expanded (edge case).
- 1500 chars exactly → truncated (edge case — uses `≥` not `>`).

## Edge cases

| Case | Behavior |
|---|---|
| Turn has zero tool calls | No chips, no sections. Just thinking + response. |
| Turn has 1 routine call (e.g. 1 `Read`) | Chip still appears: `+ 1 read`. Single-row collapse is acceptable; consistency beats one-row exception. |
| Turn has 50 routine calls | Chip says `+ 50 reads`. Clicking expands all 50 inline. (No paginating here — same UX as today, just gated behind one click.) |
| Tool errored (`is_error: true`) | If the tool is routine/accounting, it's STILL collapsed into the chip — but the chip text uses a red dot or `(1 failed)` suffix to surface the error. **Compromise: surface errors without breaking the collapse rule.** |
| Thinking with embedded code blocks | Treat as plain char count for the 1500 threshold. Code is reasoning. |
| Multiple thinking blocks in one turn | Sum their lengths for the threshold check. If the sum ≥ 1500, only the first block is truncated; subsequent blocks behave normally (rare in practice). |
| Tool name with leading whitespace or unknown casing | `classifyToolCall` trims and uses exact case-sensitive match. Documented in code. |

## Risks

| Risk | Mitigation |
|---|---|
| Routine chip hides a critical error a user needed to see | The `(1 failed)` suffix on the chip surfaces the error. If multiple failures in the same category, show count: `+ 4 reads (1 failed)`. |
| User expects to always see TaskUpdate (they're debugging agent task tracking) | Add a future setting `showAllToolCalls` later if requested. For v1, defer. The chip click is fast enough. |
| Thinking truncated at 1500 — user can't tell content was cut | The `Show more` button itself is the indicator. Make it visually distinct from a passive "click for details" — use accent color or chevron. |
| `classifyToolCall` lookup misses a new tool name Anthropic ships | Default `"routine"` is safe (visible via chip, never hidden). Add a sentry log when an unknown name is encountered so we can update the table. |
| Tests get noisy because every existing tool-call test must now account for chips | Update affected tests to assert chip presence + count instead of row count. Pre-existing tests asserting row count for routine tools will break — that's intentional, it's the regression. |

## Out of scope (deferred — option 1 follow-up)

These are not addressed in this design and should be tracked separately:

- **Skim mode** — one-line-per-turn session-level view.
- **Turn header outcome chips** — `📝 3 edits · 🤖 2 subagents · ⚠ 1 error` at the top of each turn card.
- **Cost-weighted highlighting** — bold rows / chips that cost more than $0.50.
- **Tool call timing inline** — show duration next to chip (`+ 4 reads (3.2s total)`).
- **Filter/find within turn** — search inside a turn's content.
- **User-configurable categorization** — let power users move tools between categories.

Each of these is a clear next step but none is required for this change to ship and feel right.
