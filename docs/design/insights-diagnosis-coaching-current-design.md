# Insights Diagnosis Coaching Current Design

Date: 2026-05-18

## Purpose

This document records the current design and rebuild state for the Insights diagnosis coaching surface.

The product direction is coach-first: the page should tell the user what behavior to change, then explain why, then show evidence only when requested.

## Current User Problem

Claude Code users can see spend, tokens, sessions, and charts, but they still cannot easily answer:

- What am I doing wrong?
- What is costing me money, time, or quality?
- What should I change this week?
- Which sessions prove this pattern?

The diagnosis coaching section exists to answer those questions before the user has to interpret charts.

## Current Interaction Model

The diagnosis coaching feed uses three levels of data abstraction.

### Level 1: Concise Diagnosis

Default state. Nothing is expanded.

Each diagnosis row shows:

- Rank.
- Category.
- Impact level.
- Plain-language diagnosis title.
- Impact summary.
- One-line summary.
- Compact evidence chips.
- `View details` affordance.

Goal: fast scanning. The user should understand the top ranked patterns without reading raw evidence.

### Level 2: Expanded Coaching Detail

Clicking a diagnosis header expands that diagnosis.

Only one diagnosis can be expanded at a time. Clicking the same open diagnosis collapses it back to Level 1.

Expanded detail shows:

- Summary.
- `What happened`.
- `Why it matters`.
- `Change this week`.
- `Recommended changes`.
- Compact proof chips.
- `Show evidence` button.

Goal: explain the diagnosis and prescribe a behavior change without overwhelming the user.

### Level 3: Evidence

Clicking `Show evidence` opens evidence inline directly under the expanded diagnosis.

Clicking `Hide evidence` closes it. Switching to another diagnosis also closes evidence.

Evidence shows:

- Signal chips.
- Triggering rule details.
- Impact value.
- Impact period.
- Related session IDs.

Goal: prove the coaching claim only when the user asks for proof.

## Important UX Decisions

### No Default Expansion

The first diagnosis is no longer expanded by default.

Reason: default expansion made the page feel heavy and blurred Level 1 vs Level 2. The user should first see the ranked list.

### Separate Controls For Detail And Evidence

The diagnosis header controls Level 1 to Level 2.

The `Show evidence` button controls Level 2 to Level 3.

Reason: using the same click target for both collapse and evidence caused a bug where users could not collapse details.

### Evidence Stays Inline

Evidence appears immediately under the expanded diagnosis, not at the bottom of the whole diagnostics list.

Reason: users did not understand that a remote bottom panel was connected to the selected diagnosis.

### Quick Wins Stay Separate

Quick Wins remain below the diagnosis coaching feed.

Reason: Quick Wins are rule-based deterministic hints. They are useful, but they should not interrupt the progressive diagnosis flow.

## Current Component Contract

Main files:

- `dashboard/src/components/insights/DiagnosticsSection.tsx`
- `dashboard/src/components/insights/DiagnosticCard.tsx`
- `dashboard/src/components/insights/DiagnosticAnalysis.tsx`
- `dashboard/src/components/insights/__tests__/DiagnosticsSection.test.tsx`

### `DiagnosticsSection`

Owns disclosure state:

- `selectedId: string | null`
- `evidenceOpen: boolean`

Rules:

- Initial `selectedId` is `null`.
- Clicking a closed diagnosis sets `selectedId` and closes evidence.
- Clicking the open diagnosis clears `selectedId` and closes evidence.
- Clicking `Show evidence` toggles `evidenceOpen`.
- Changing selected diagnosis closes evidence.

### `DiagnosticCard`

Renders Level 1 and Level 2.

It is an `article` containing:

- A header `button` for opening/collapsing details.
- A separate `Show evidence` / `Hide evidence` button for Level 3.

This avoids nesting buttons and keeps the two actions distinct.

### `DiagnosticAnalysis`

Renders Level 3 evidence only when requested.

It does not own selection or disclosure state.

## Current Copy

Section helper copy:

> Select a pattern for details, then click again to show evidence.

Detail control:

- Closed: `View details`
- Open: `Details open`

Evidence control:

- Closed: `Show evidence`
- Open: `Hide evidence`

Evidence panel title:

> Evidence for selected pattern

## Visual Direction

The UI follows the Claude DevTools dense tool style:

- Warm token-based surfaces.
- Terracotta accent for selected/action states.
- Category color left rails.
- JetBrains Mono for metrics and evidence chips.
- DM Sans for readable prose.
- No marketing-style hero treatment.
- No chart-first layout.

The coaching feed should feel like a compact senior-engineer review, not a dashboard report.

## Data And Evidence Rules

Every coaching claim must be backed by deterministic signals.

Supported diagnosis detector families:

- Edit rejection rate.
- Tool failure storm.
- Cache hit ratio.
- Cost per LOC outlier.
- Long turn durations.
- High-context duration tax.

Evidence may include:

- Failed tool calls.
- Rejected edits.
- Cache/token ratios.
- Cost estimates.
- Long turn counts.
- High-context session IDs.
- Rule threshold details.

AI may explain and prioritize, but it must not invent evidence.

## Recent Rebuild History

Relevant commits:

- `4a4f4fd` Build coach-first insights diagnostics.
- `ee8c34c` Clarify insights card selection.
- `cba77f3` Make insights diagnostics an accordion.
- `60369af` Make insights evidence cue actionable.
- `43ab6e0` Show insights evidence inline with selected diagnosis.
- `3a59afd` Add three-level insights disclosure.
- `cf09226` Fix insights disclosure state controls.

## Current Verification

Current focused verification:

```bash
pnpm -C dashboard test src/components/insights src/routes/InsightsPage.test.tsx
pnpm -C dashboard build
```

Current expected behavior:

- No diagnosis is expanded initially.
- Clicking a diagnosis expands Level 2 details.
- Clicking the same diagnosis collapses it.
- `Show evidence` opens Level 3 evidence inline below that diagnosis.
- `Hide evidence` closes Level 3 evidence.
- Selecting another diagnosis closes prior evidence.

## Known Non-Goals

- Do not make charts the first experience.
- Do not show full evidence for every diagnosis by default.
- Do not use vague terms like confidence score in user-facing copy.
- Do not use p95, p99, or other specialist stats language in primary coaching copy.
- Do not turn the diagnosis feed into a report page.

## Open Follow-Up Questions

- Should Level 3 evidence eventually include expandable session rows instead of raw session ID chips?
- Should the `Show evidence` control be styled more like a secondary button to make the third level clearer?
- Should evidence summarize session count before listing IDs?
- Should only high-impact diagnoses show evidence by default after the user has previously opened evidence?
