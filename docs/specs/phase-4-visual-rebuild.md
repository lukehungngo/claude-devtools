# Phase 4 Spec — Background Agents & Agent Graph visual rebuild

**Loop step:** Step 2 applied (REVISE) · **Status:** blocked on Phase 1/2/3
**Severity:** P2 polish — visual + interaction quality
**Source design:** `docs/design/anthropic-handoff/dashboard.html` (Background agents `1812-2028`, Agent Graph `2034-2121`) + `docs/design/anthropic-handoff/colors_and_type.css`
**Validation:** [`docs/design/ui-ux-validation-report.md`](../design/ui-ux-validation-report.md)

---

## Why

Both surfaces fall short of the approved design:

- **Background Agents** dispatch block has no live-running pill, no live-duration ticker, no live-activity bullet, no structured Prompt/Return/Meta expansion.
- **Agent Graph** timeline lacks token overlay on bars, running-bar pulse, focused-row emphasis, time-axis ticks, "Scoped to T<N>" pill, and the keyboard hint row.

---

## Prerequisites

### Hard dependencies (this ticket fails without them)

| Phase | Concrete failure if missing |
|---|---|
| Phase 1 — task derivation | TaskCreate `subject` field unread → row labels show the long-form prompt body instead of `"TASK-001: …"`. Status pills always show "pending" because TaskUpdate has no handler. |
| Phase 2 — design hygiene | `var(--sp-*)` tokens undefined → all paddings collapse to `0` or render as literal text. `--ring` token undefined → no focus ring. |
| Phase 3 — synthetic-agent join | Agent Graph renders ~3 nodes per turn instead of all dispatched agents (22 in the screenshot session). No data path exists to show running subagents. |
| **Stop-agent API** (new prereq, see C5 below) | Keyboard hint row (`x stop`, `ctrl+x ctrl+k stop all`) has no backend. Either ship the API or feature-flag the entire `bghint-row` off. **Partial-hint shipping is rejected.** |

### Soft dependency (parallel, non-blocking)

- Inline-style audit of `src/components/bottom-panel/` and `src/components/conversation/`. Convert obvious boilerplate to semantic classes once `--sp-*` exists.

---

## Scope

### A. Background agents dispatch block (in-conversation)

**Where:** new `BackgroundAgentGroup.tsx` + `BackgroundAgentRow.tsx` under `src/components/conversation/`. Audit existing dispatch render in `ToolEntries.tsx` / `AgentCard.tsx` first (the design treats dispatch as its own collapsible group, distinct from per-tool entries).

**Design ref:** `dashboard.html:1812-2028`

**Data source (clarified from review C3):** the group renders the **union** of:
1. Phase 3's `turnSnapshot.syntheticAgentDispatch` map entries (synthetic agents from `Agent` tool_use without sidechain events)
2. Real subagent nodes from the DAG (when sidechain events exist — other Claude Code variants)

Keyed by `tool_use.id`. Deduplicate where a real DAG node and a synthetic entry refer to the same dispatch (real wins; synthetic is the fallback).

In this Claude Code variant (verified 0/199k sidechain events), the group is **entirely synthetic-driven**. The component must handle that case as the primary path, not an edge case.

Layout:

```
⎇  Background agents ×3   [1 RUNNING]  ✓ 2 done   12m 04s   ↓ 337.8k   $5.78
   └─ ▸ ENG  TASK-C3  hook ↔ tool correlation   ● running   3m 34s   ↓ 104.6k   $1.88
   └─ ▸ ENG  TASK-C1  bound summarize-up-to     ✓ done      5m 53s   ↓ 129.5k   $2.04
   └─ ▸ ENG  TASK-B3  claude project purge      ✓ done      2m 29s   ↓ 103.7k   $1.86
```

Expanded `<details class="arow">` body shows:

- **Prompt** — original dispatch task description (from `Agent.input.description`)
- **Live activity** (running only) — `live-bullet` pulsing dot + line like `Reading hookRegistry.ts… 3s ago`. **For synthetic agents** (no live activity events): show a generic "Subagent in progress…" line.
- **Return** (done only) — result summary. **For synthetic agents:** show the matching `tool_result.content[0].text` (truncated to 200 chars).
- **Meta** — `model · tools used · spawned timestamp`. **For synthetic agents:** model from `Agent.input.model` (or "unknown"), tools used `—`, spawned timestamp from the dispatching assistant event.

#### Token / cost display (clarified from review C2)

For **synthetic agents**, token totals and cost are unknown (Phase 3: emit `null`). UI renders `—` not `0`:

- `arow-tok` slot: `—`
- `arow-cost` slot: `—`
- Group summary `↓ 337.8k` / `$5.78`: sum across **real** agents only. If all agents are synthetic, summary shows just the count and duration.

The mock-perfect token strings in the design HTML are **prototype-only**. Real data won't match them for synthetic agents.

#### Live duration ticker (clarified from review C1)

**`spawnedAt` is not an event field.** It's derived from the dispatching assistant event's `timestamp`:
- For synthetic agents: `turnSnapshot.syntheticAgentDispatch[id].spawnedAt`
- For real agents: `AgentNode.startTime` from the DAG

Ticker updates every 1s while `status === "running"`. Uses `Date.now() - new Date(spawnedAt).getTime()` for elapsed.

Visual contract:

| Element | Token | Source |
|---|---|---|
| Running pill background | `var(--acc)` text `#fff`, animated `arow-run-pulse 1.6s` | design line 1196-1204 |
| Live bullet | `var(--acc)`, `bg-pulse 1s` animation | design line 1224-1231 |
| Done status | `var(--grn-bg) / var(--grn)` | design line 1193 |
| Failure status | `var(--red-bg) / var(--red)` | design line 1209 |
| Row badge (ENG/QA/DC) | `var(--span-swe)` / `--span-qa` / `--span-doc` (+ `-t` text pair) | design line 1834 |
| Task ID | `var(--acc)` mono | design line 1180-1184 |
| Live duration | `var(--acc)` mono | design line 1216-1217 |
| Border (live row) | `var(--acc)` + linear-gradient summary background | design line 1215-1220 |

### B. Agent Graph trace timeline (bottom panel)

**Where:** `dashboard/src/components/bottom-panel/TraceTab.tsx` + `BottomPanel.tsx` tab bar.
**Design ref:** `dashboard.html:2034-2121` + CSS `632-779`

Grid columns: `[caret] [Agent] [Model] [Duration] [Cost] [Timeline]`

Required visuals:

1. **Tab badge:** `Agent Graph **N**` — N = count of agents in current turn scope. (clarified from review C4) Phase 3 yields N=22 for the screenshot session. Cap displayed N at `99+`. For N ≥ 10, badge width must remain ≤ 28px without truncating digits. Use `--acc-bg` background / `--acc` text.
2. **Scope pill:** `Scoped to **T26**` right-aligned in tab bar (use existing `viewingTurnNumber`).
3. **Time-axis ticks** in header row: 0m / 2m / 4m / 6m / 8m / 10m / 12m. Auto-scale to max agent duration.
4. **Timeline bar** positioned by computed `left:%` + `width:%`, colored by agent-category span token (main = `--span-pm`, engineer = `--span-swe`, docs = `--span-doc`, etc.).
5. **Token overlay** on the bar: `129.5k` style, right-aligned within the cell. **Synthetic agents:** overlay reads `—`.
6. **Running bar:** `.bar.run` with `pulse 1.6s` animation + inline `running` label in the bar (design line 748).
7. **Focused row:** stronger background `var(--bg-h)`, bolder agent name `var(--t1) font-weight:700`, accent border `2px solid var(--acc)` on caret column (design line 696-704).
8. **Live dot** beside agent name when in-flight: `var(--grn)` dot, `pulse 1.5s`.
9. **Keyboard hint row** at the bottom: `Enter view · x stop · ctrl+x ctrl+k stop all · ↑↓ navigate · Focused: TASK-C1 · sonnet-4-6 · spawned 23:42:47` (design line 761-779).

### C. Shared visual tokens (already present after Phase 2)

All required tokens exist in `globals.css` after Phase 2 hygiene lands:

- `--span-pm / --span-swe / --span-doc / --span-qa / --span-bug / --span-rev` + `-t` text pairs
- `--resp-dispatch / --resp-dispatch-bg` (chevron + meta accent)
- `--acc-bg-strong` (`arow-run-pulse` shadow)
- `--grn-bg / --red-bg / --amb-bg / --teal-bg`
- `--sp-*` (Phase 2 prereq)

If any are missing in `[data-theme="dark"]` or `[data-theme="oled"]`, add per-theme. Verify contrast pairs ≥4.5:1 in dark mode.

---

## Acceptance criteria

### Visual

- [ ] Side-by-side diff of `docs/design/anthropic-handoff/dashboard.html` (rendered in browser, running-state preserved) vs live app, scoped to the two surfaces: every listed element present, ±2px alignment, identical token usage. **A11y exceptions allowed where prototype lacks them** (e.g., min touch target on row caret = 24px even if design HTML uses 16px). Document each divergence.
- [ ] All paddings/gaps in new components use `--sp-*` tokens. Zero raw `padding: "Xpx Ypx"` literals.
- [ ] All colors via CSS vars or `dt-*` Tailwind classes. Zero raw hex.

### Live state

- [ ] Live duration ticker updates every 1s for any agent with `status === "running"`. Driven by `spawnedAt` derived from `syntheticAgentDispatch[id].spawnedAt` (synthetic) or `AgentNode.startTime` (real).
- [ ] Running pill (`.running-pill`) and live bullet (`.live-bullet`) reuse the existing `pulse` keyframe in `globals.css`.
- [ ] Agent Graph running timeline bar animates; non-running bars are static.
- [ ] When an agent transitions running → done, animations stop within 1 frame.

### Data tolerance

- [ ] Synthetic agents render `—` for token / cost / tools-used cells. Never `0`.
- [ ] Group summary (`↓ 337.8k`, `$5.78`) sums **real agents only**; if all agents synthetic, the summary slots are hidden, leaving only count + duration.
- [ ] Tab badge displays `99+` for any N ≥ 100.

### Interaction

- [ ] Clicking an Agent Graph row sets focused state; arrow keys (when trace panel has focus) move focus up/down.
- [ ] `Enter` on focused row opens the agent in the conversation pane.
- [ ] **Stop-agent API:** Phase 4 requires `POST /api/agents/:id/stop` endpoint or the entire `bghint-row` ships feature-flagged off (`bottomPanel.keyboardHints = false` by default). No partial-hint shipping.
- [ ] If the stop API ships: `x` keystroke stops focused running agent; `Ctrl+X Ctrl+K` stops all running agents.
- [ ] Tab badge count = active agent count in current turn scope. Updates live.
- [ ] Keyboard hint row hides when trace panel is collapsed.

### Accessibility

- [ ] All interactive icons have `aria-label` (badges, status pills, status dots).
- [ ] Color is not the only indicator: status pills always pair `var(--grn)` etc. with an icon or text label.
- [ ] `prefers-reduced-motion` respected — pulse/run animations stop or become single-step (use existing global override at `globals.css:298`).
- [ ] Focus ring visible on row focus using `--ring`.
- [ ] Tab order: filter buttons → tab labels → scope pill → table rows → keyboard hint row.
- [ ] Min focusable target: row caret + status pill ≥ 24×24px even if design HTML is smaller.

### Test

- [ ] New `TraceTab` unit tests cover: focused-row state, count badge with cap, scope pill text, running bar animation class applied, keyboard hint row visibility tied to collapse state, synthetic agents render `—` tokens.
- [ ] New `BackgroundAgentGroup` component tests cover: synthetic-only path, mixed real+synthetic path, running pill, live-duration update from `spawnedAt`, expanded body sections, done/error state rendering.
- [ ] Existing snapshot tests stay green after Phase 2 token rename.

---

## Where it lives in the codebase

| Design section | Current file(s) | Action |
|---|---|---|
| Background agents `<details>` group | `src/components/conversation/AgentCard.tsx` and `ToolEntries.tsx` (audit) | new `BackgroundAgentGroup.tsx` + `BackgroundAgentRow.tsx` |
| Agent Graph timeline | `src/components/bottom-panel/TraceTab.tsx` | rewrite render, keep data wiring |
| Trace dock tab bar | `src/components/bottom-panel/BottomPanel.tsx` | add count badge to active tab, scope pill |
| Stop-agent endpoint | `server/src/http/routes/agent-routes.ts` (or wherever active sessions live) | new POST handler (prereq, separate ticket if it doesn't exist) |
| Pulse / spin keyframes | `dashboard/src/styles/globals.css` | reuse existing |

---

## Non-goals

- Data sourcing changes — if a value isn't already computed (e.g., per-agent token total for real agents), defer to a follow-up.
- The Tweaks panel + edit-mode iframe protocol from the design HTML.
- The `colors_and_type.css` typography classes already exist as `.t-*` in `globals.css` — do not re-import the design CSS file.
- Mobile-responsive variants. Dashboard is desktop-first.

---

## Dependencies / coordination

- Coordinate with the other agent currently working on this repo. Land **after** their branch merges.
- Land **after** Phases 1, 2, 3 (see hard-dependency table above).
- Stop-agent API: new prereq. If absent, ship `bottomPanel.keyboardHints = false`.
- Touches `BottomPanel.tsx`, `TraceTab.tsx`, conversation components — likely conflicts with active branches; rebase before merge.

---

## Related

- `docs/design/ui-ux-validation-report.md` — token-hygiene findings (Phase 2 prereq)
- `docs/bugs/subagent-execution-missed.md` — addressed by Phase 3
- `docs/bugs/tasks-not-scoped-to-turn.md` — addressed by Phase 1
- `docs/bugs/task-derivation-gaps.md` — addressed by Phase 1

---

## Loop status

- [x] Step 1: Spec drafted (predecessor `harden-background-agents-and-agent-graph.md` consolidated here)
- [x] Step 2: Spec review — **REVISE issued, 6 concerns applied:**
  - C1: `spawned_at` not a real field → renamed, derive from dispatching assistant event
  - C2: synthetic agents render `—` not mock token strings; group summary excludes synthetics
  - C3: BackgroundAgentGroup data source = union of synthetic dispatch map + real DAG nodes
  - C4: tab badge cap at `99+`, max-width 28px for ≥10 digits
  - C5: stop-agent API is a hard prereq; partial-hint shipping rejected; feature-flag fallback
  - C6: per-phase failure modes table added to Prereqs
- [x] Step 3: Implementation plan → `docs/plans/phase-4-impl-plan.md` (T1-T13)
- [ ] Step 4: Execute (blocked: Phases 1/2/3 + other agent + Stop-Agent API)
- [ ] Step 5: Gap review
