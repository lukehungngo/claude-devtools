# Brainstorm: Insights UI quality + missing sections

**Date:** 2026-04-19
**Input type:** Problem (two confirmed bugs)
**Input:** Bug 1 — current Insights UI looks bad vs design kit. Bug 2 — Model mix, top consumers, commands, skills, agents sections not done.

---

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Design kit is the authoritative visual spec | CONFIRMED | `Claude DevTools Design System/ui_kits/insights.html` exists |
| Current UI diverges from design significantly | CONFIRMED | Read both files — layout, sizes, colours all differ |
| Bug 2 sections show placeholder shimmer cards | CONFIRMED | `PLACEHOLDER_SECTIONS` array in `InsightsPage.tsx:23-30` |
| Server has enough JSONL data to power missing sections | CONFIRMED (partial) | model in assistant events, tool_use events, session metadata all present |

---

## Fundamentals

### Bug 1 — What the design says vs what the code does

#### 1. Headline stat grid — WRONG

| | Design | Current |
|--|--------|---------|
| Layout | 5-col grid, all in ONE row | 2-col (tokens) + 3-col (cost/sessions/turns) = **two separate rows** |
| Big tile font | `font-size: 32px` | `text-2xl` = 24px |
| Small tile font | `font-size: 26px` | `text-xl` = 20px |
| Label style | `9px UPPERCASE mono, letter-spacing .6px` | `text-xs`, not uppercase |
| Sparkline position | Absolutely positioned, bottom-right corner, with area fill gradient | Flex row top-right, no gradient fill |

#### 2. Delta chip — WRONG SEMANTICS

Design intent: Increasing tokens/cost = bad = RED (▲). Decreasing = good = GREEN (▼).
Current: positive = green, negative = red — **opposite**.

This is intentional in the design: seeing cost go up is negative (red ▲), cost going down is positive (green ▼).

#### 3. Secondary stat tiles — MISSING DELTAS

`SecondaryTile` has no delta prop. Design shows `▲ +8%`, `▼ −3%`, `→ unchanged` on all four secondary tiles. The `→ unchanged` flat state is also missing from `DeltaChip`.

#### 4. Missing subtitle

Design h1 has a subtitle below: "Aggregate usage across your repos and sessions". Current has none.

#### 5. Token trend card

- Design title: **"Token trend"** + legend with 8px circles + meta text "Hourly · last 7 days"
- Current title: "Token Usage Trend", square swatches, no meta text

#### 6. When you work card

- Design: `grid-template-columns: 1fr 1px 1fr` with a real 1px visual divider column between heatmap and hourly bars
- Current: `grid-cols-2 gap-6` — no visual divider, just gap

### Bug 2 — Missing sections (currently placeholder shimmer)

Each section needs both backend data and frontend rendering.

#### Model mix

**Data needed:** Per-model aggregate — tokens in/out, cost, turn count, share %
**Source:** `event.message.model` on `assistant` events in JSONL
**Backend:** New route `GET /insights/model-mix` or extend aggregate
**Frontend:** Stacked proportion bar + model rows with two stat columns (tokens in, tokens out) + cost column

#### Top consumers

**Data needed:** Top repos by tokens, top sessions by cost, top tools by call count
**Source:**
- Repos: group sessions by `cwd`, sum tokens
- Sessions: rank sessions by cost (already in session cache)
- Tool calls: count `tool_use` content items by `name` field in `assistant` events
**Backend:** New route `GET /insights/top-consumers`
**Frontend:** 3-card grid, rank list per card with numbered badge + name + mini bar + value

#### Commands

**Data needed:** Slash command invocation counts + avg tokens per invocation
**Source:** User events where `content` starts with `/` (or contains a slash command invoke). These appear as human messages with `/cmd` text in `user` events with `userType === "human"`.
**Backend:** New route `GET /insights/commands`
**Frontend:** Two-column split card — left: ranked command list, right: trend sparklines per command with tokens in/out + verdict badge

#### Agents (subagents)

**Data needed:** Subagent type → run count + avg tokens per run
**Source:** Tool use events where `name === "Task"` or `name === "Agent"` — the `input.subagent_type` or description field identifies the agent type
**Backend:** New route `GET /insights/agents`
**Frontend:** Same two-column card pattern as Commands but with colored type badges (SWE/PM/QA/etc.)

#### Skills

**Data needed:** Skill invocation counts + avg tokens per invocation
**Source:** Tool use events where `name === "Skill"` — the `input.skill` field names the skill
**Backend:** Included in same route as commands (or separate)
**Frontend:** Same two-column pattern with `▤` skill badge

---

## Root causes

**Bug 1:** The implementation was done with rough Tailwind approximations without pixel-checking against the design. The 2-row grid split, wrong font sizes, missing delta logic for flat state, and sparkline placement are all "close but wrong" approximations.

**Bug 2:** These sections were always placeholders — they require new server-side aggregation routes that haven't been built yet.

---

## Solution direction

### Bug 1 — Fix order (UI-only changes, no backend)

1. Merge headline tiles into a single 5-col grid
2. Fix font sizes to match design (32px big, 26px secondary)
3. Fix label style: uppercase, `9px`, bold, letter-spacing
4. Reposition sparkline: absolute, bottom-right inside tile, add gradient area fill
5. Add subtitle under h1
6. Add flat `→` state to DeltaChip
7. Add delta to SecondaryTile (needs server delta data already available)
8. Fix token trend card: title → "Token trend", dots not squares, add meta text
9. Fix when-you-work: use `grid-template-columns: 1fr 1px 1fr` + divider element

### Bug 2 — New backend routes + frontend sections

**Phase 1: Model mix + Top consumers** (most valuable, straightforward data)
1. `GET /insights/model-mix` — aggregate by model from assistant events
2. `GET /insights/top-consumers` — top repos, sessions, tool calls
3. Frontend: replace Model Mix and Top Consumers placeholders

**Phase 2: Commands + Agents + Skills**
1. Parse slash commands from human `user` events
2. Parse agent runs from Task/Agent tool_use events
3. Parse skill runs from Skill tool_use events
4. `GET /insights/commands-agents-skills`
5. Frontend: replace remaining placeholders with two-column cards

---

## Next steps

Suggested: `/mas:dev-loop implement insights UI fix (Bug 1) + model-mix/top-consumers (Bug 2 phase 1) — see docs/brainstorms/2026-04-19-insights-ui-and-missing-sections.md`

Then phase 2 for commands/agents/skills in a follow-up loop.
