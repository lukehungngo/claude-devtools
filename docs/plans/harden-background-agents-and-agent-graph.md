# Feature: harden Background Agents & Agent Graph UI

**Status:** planned · blocked on design-system hygiene PR (see Prereqs)
**Severity:** P2 polish — visual + interaction quality, no data correctness
**Source design:** `docs/design/anthropic-handoff/dashboard.html` (Background agents `1812-2028`, Agent Graph `2034-2121`) + `docs/design/anthropic-handoff/colors_and_type.css`
**Validation:** [`docs/design/ui-ux-validation-report.md`](../design/ui-ux-validation-report.md)

---

## Why

Both surfaces fall short of the approved design:

- **Background Agents** dispatch block has no live-running pill, no live-duration ticker, no live-activity bullet, no structured Prompt/Return/Meta expansion.
- **Agent Graph** timeline lacks token overlay on bars, running-bar pulse, focused-row emphasis, time-axis ticks, "Scoped to T<N>" pill, and the keyboard hint row.

Implementing this on top of the current `globals.css` would compound existing token-hygiene debt (479 inline styles, raw px paddings, palette drift in `CASRow`). So the work splits into a hygiene PR first, then the visual ticket on top.

---

## Prerequisites — design-system hygiene

Land **before** any visual work in this ticket. Track separately if a non-blocking subset.

### P1 prerequisites (must land first)

1. **Add `--sp-*` spacing scale to `globals.css`** — matches design `colors_and_type.css:27-30`:
   ```css
   --sp-0_5: 2px; --sp-1: 4px;  --sp-1_5: 6px; --sp-2: 8px;
   --sp-3: 12px; --sp-3_5: 14px; --sp-4: 16px; --sp-4_5: 18px;
   --sp-5: 20px; --sp-6: 24px;  --sp-7: 28px;  --sp-8: 32px;
   ```
   Unlocks consistent padding/gap values in every new component below.

2. **Deprecate legacy alias tokens** in `globals.css`:
   - `--bg-0..bg-4` → `--bg / --bg-s / --bg-e / --bg-h / --bg-sel`
   - `--text-0..text-2` → `--t1 / --t2 / --t3`
   - `--accent / --accent-hover / --accent-dim / --accent-glow` → `--acc / --acc-h / --acc-bg / --acc-glow`
   - `--border / --border-active / --border-subtle` → `--bd / --bd-s` (use `rgba(0,0,0,.04)` inline for the rare subtle case)
   - `--cyan / --purple / --orange / --pink` → use `--teal / --pur / --acc / --resp-*` semantic slots
   - `--focus-ring` → `--ring`

3. **Replace raw palette hexes in `CASRow.tsx`** with `--span-*` (or extend `--span-*` with stable category aliases) to keep the warm terracotta/cream palette consistent.

### P2 prerequisites (parallel, non-blocking)

4. Audit the ≥10 highest-inline-`style={{...}}` files in `src/components/bottom-panel/` and `src/components/conversation/`. Convert obvious boilerplate to semantic classes once `--sp-*` exists.

---

## Scope

### A. Background agents dispatch block (in-conversation)

**Where:** likely a new component under `src/components/conversation/` (audit existing dispatch render in `ToolEntries.tsx` / `AgentCard.tsx` first; the design treats dispatch as its own collapsible group, distinct from per-tool entries).

**Design ref:** `dashboard.html:1812-2028`

Replace the current ad-hoc dispatch rendering with a `<details class="agroup running">` block:

```
⎇  Background agents ×3   [1 RUNNING]  ✓ 2 done   12m 04s   ↓ 337.8k   $5.78
   └─ ▸ ENG  TASK-C3  hook ↔ tool correlation   ● running   3m 34s   ↓ 104.6k   $1.88
   └─ ▸ ENG  TASK-C1  bound summarize-up-to     ✓ done      5m 53s   ↓ 129.5k   $2.04
   └─ ▸ ENG  TASK-B3  claude project purge      ✓ done      2m 29s   ↓ 103.7k   $1.86
```

Expanded `<details class="arow">` body shows:

- **Prompt** — original dispatch task description
- **Live activity** (running only) — `live-bullet` pulsing dot + line like `Reading hookRegistry.ts… 3s ago`
- **Return** (done only) — result summary
- **Meta** — `model · tools used · spawned timestamp`

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

Live duration ticker: drive from event clock (`spawned_at` event timestamp), not `Date.now()` relative — fixes the design's prototype simplification.

### B. Agent Graph trace timeline (bottom panel)

**Where:** `dashboard/src/components/bottom-panel/TraceTab.tsx` + `BottomPanel.tsx` tab bar.
**Design ref:** `dashboard.html:2034-2121` + CSS `632-779`

Grid columns: `[caret] [Agent] [Model] [Duration] [Cost] [Timeline]`

Required visuals:

1. **Tab badge:** `Agent Graph **N**` — N = count of agents in current turn scope (use `--acc-bg` / `--acc`).
2. **Scope pill:** `Scoped to **T26**` right-aligned in tab bar (use existing `viewingTurnNumber`).
3. **Time-axis ticks** in header row: 0m / 2m / 4m / 6m / 8m / 10m / 12m. Auto-scale to max agent duration.
4. **Timeline bar** positioned by computed `left:%` + `width:%`, colored by agent-category span token (main = `--span-pm`, engineer = `--span-swe`, docs = `--span-doc`, etc.).
5. **Token overlay** on the bar: `129.5k` style, right-aligned within the cell (design line 749-760).
6. **Running bar:** `.bar.run` with `pulse 1.6s` animation + inline `running` label in the bar (design line 748).
7. **Focused row:** stronger background `var(--bg-h)`, bolder agent name `var(--t1) font-weight:700`, accent border `2px solid var(--acc)` on caret column (design line 696-704).
8. **Live dot** beside agent name when in-flight: `var(--grn)` dot, `pulse 1.5s`.
9. **Keyboard hint row** at the bottom: `Enter view · x stop · ctrl+x ctrl+k stop all · ↑↓ navigate · Focused: TASK-C1 · sonnet-4-6 · spawned 23:42:47` (design line 761-779).

### C. Shared visual tokens (already present after Prereq #2)

All required tokens exist in `globals.css` after the alias cleanup:

- `--span-pm / --span-swe / --span-doc / --span-qa / --span-bug / --span-rev` + `-t` text pairs
- `--resp-dispatch / --resp-dispatch-bg` (chevron + meta accent)
- `--acc-bg-strong` (`arow-run-pulse` shadow)
- `--grn-bg / --red-bg / --amb-bg / --teal-bg`

If any are missing in `[data-theme="dark"]` or `[data-theme="oled"]`, add per-theme. Verify contrast pairs ≥4.5:1 in dark mode.

---

## Acceptance criteria

### Visual

- [ ] Side-by-side diff of `docs/design/anthropic-handoff/dashboard.html` (rendered in browser, running-state preserved) vs live app, scoped to the two surfaces: every listed element present, ±2px alignment, identical token usage.
- [ ] All paddings/gaps in new components use `--sp-*` tokens (Prereq #1). Zero raw `padding: "Xpx Ypx"` literals in the new code.
- [ ] All colors via CSS vars or `dt-*` Tailwind classes. Zero raw hex.

### Live state

- [ ] Live duration ticker updates every 1s for any agent with `status === "running"`. Driven by `spawned_at` event timestamp.
- [ ] Running pill (`.running-pill`) and live bullet (`.live-bullet`) reuse the existing `pulse` keyframe in `globals.css` (verify the `1.5s ease-in-out infinite` timing matches design `1.6s`).
- [ ] Agent Graph running timeline bar animates; non-running bars are static.
- [ ] When an agent transitions running → done, animations stop within 1 frame.

### Interaction

- [ ] Clicking an Agent Graph row sets focused state; arrow keys (when trace panel has focus) move focus up/down.
- [ ] `Enter` on focused row opens the agent in the conversation pane.
- [ ] `x` keystroke stops the focused running agent (wire to existing stop dispatch; if not yet implemented, hide the hint).
- [ ] `Ctrl+X Ctrl+K` stops all running agents.
- [ ] Tab badge count = active agent count in current turn scope. Updates live.
- [ ] Keyboard hint row hides when trace panel is collapsed.

### Accessibility

- [ ] All interactive icons have `aria-label` (badges, status pills, status dots).
- [ ] Color is not the only indicator: status pills always pair `var(--grn)` etc. with an icon or text label.
- [ ] `prefers-reduced-motion` respected — pulse/run animations stop or become single-step (use existing global override at `globals.css:298`).
- [ ] Focus ring visible on row focus using `--ring`.
- [ ] Tab order: filter buttons → tab labels → scope pill → table rows → keyboard hint row.

### Test

- [ ] New `TraceTab` unit tests cover: focused-row state, count badge, scope pill text, running bar animation class applied, keyboard hint row visibility tied to collapse state.
- [ ] New `BackgroundAgentGroup` component tests cover: running pill display, live-duration update on event time, expanded body sections, done/error state rendering.
- [ ] Existing snapshot tests stay green after Prereq #2 (token rename).

---

## Where it lives in the codebase

| Design section | Current file(s) | Action |
|---|---|---|
| Background agents `<details>` group | `src/components/conversation/AgentCard.tsx` and `ToolEntries.tsx` (audit) | new `BackgroundAgentGroup.tsx` + `BackgroundAgentRow.tsx` |
| Agent Graph timeline | `src/components/bottom-panel/TraceTab.tsx` | rewrite render, keep data wiring |
| Trace dock tab bar | `src/components/bottom-panel/BottomPanel.tsx` | add count badge to active tab, scope pill |
| Pulse / spin keyframes | `dashboard/src/styles/globals.css` | reuse existing |
| Spacing tokens | `dashboard/src/styles/globals.css` | added in Prereq #1 |

---

## Non-goals

- Data sourcing changes — if a value isn't already computed (e.g., per-agent token total), defer to a follow-up.
- The Tweaks panel + edit-mode iframe protocol from the design HTML.
- The `colors_and_type.css` typography classes already exist as `.t-*` in `globals.css` — do not re-import the design CSS file.
- Mobile-responsive variants. Dashboard is desktop-first.

---

## Dependencies / coordination

- Coordinate with the other agent currently working on this repo. Land **after** their branch merges.
- Land **after** the design-system hygiene PRs (Prereqs #1-#3).
- Touches `BottomPanel.tsx`, `TraceTab.tsx`, conversation components — likely conflicts with active branches; rebase before merge.

---

## Related

- [`docs/design/ui-ux-validation-report.md`](../design/ui-ux-validation-report.md) — token-hygiene findings that gate this ticket
- [`docs/bugs/subagent-execution-missed.md`](../bugs/subagent-execution-missed.md) — fix this first; otherwise this polish ticket has no live "1 RUNNING" state to render
- [`docs/bugs/tasks-not-scoped-to-turn.md`](../bugs/tasks-not-scoped-to-turn.md) — the "Scoped to T<N>" pill in (B.2) should apply to the Tasks tab consistently
- [`docs/bugs/task-derivation-gaps.md`](../bugs/task-derivation-gaps.md) — Background Agent task list must not contaminate main agent's TodoWrite
