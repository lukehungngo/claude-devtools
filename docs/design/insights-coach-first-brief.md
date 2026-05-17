# Insights Coach-First Redesign Brief

Date: 2026-05-17

## Purpose

Redesign the Insights page from a chart dashboard into a Claude Code usage coach.

The current page shows useful usage data, but it asks the user to interpret the meaning themselves. The redesigned page should answer the higher-value question first: what behavior should change next?

## Validated Problem

Claude Code records every session: tool calls, model choices, retries, failures, costs, context growth, and session outcomes. That data can explain why one session cost $8 and another similar session cost $0.50.

Today, users mostly see charts and numbers. Charts show what happened, but they do not tell the user what to do differently tomorrow.

The product opportunity is to turn telemetry into coaching:

- Detect behavior patterns that waste cost, time, or quality.
- Explain the pattern in plain language.
- Estimate the impact.
- Prescribe one concrete behavior change.
- Show the underlying evidence only when the user wants to inspect it.

## Core Positioning

Insights is not a dashboard. Insights is a coach.

Charts are not removed, but they are demoted. They become evidence for coaching claims, not the first thing the user sees.

## Target User Outcome

When a user opens Insights, they should understand within 10 seconds:

- What they are doing that is costing money, time, or quality.
- How much it appears to cost.
- What habit or workflow to change this week.
- Which sessions prove the pattern.

If the user never scrolls, the page should still be useful.

## Page Hierarchy

### 1. Coaching Feed

This is the new top of the page.

Show 3-4 ranked coaching cards. Each card should be written as a diagnosis, not as a metric label.

Each card should include:

- Pattern name.
- Plain-language diagnosis.
- Estimated impact: cost, time, or quality.
- One recommended behavior change.
- Confidence or evidence count.
- Primary action: `View evidence`.
- Secondary action: `Tell me more`.

Example:

> Follow-up work is being split across new sessions.
> Related work on `claude-devtools` restarted across 9 sessions this week, forcing Claude to reload project context. Estimated extra cost: $12.40.
> Change this week: continue the existing session when follow-up work is on the same repo and task thread.

### 2. Selected Coaching Analysis

When a card is selected, show a deeper explanation directly below the feed.

This section should connect the dots across:

- What happened.
- Why it matters.
- What evidence triggered the diagnosis.
- What to do next.
- Expected impact if the user changes the habit.

This should feel like a short expert review, not a report full of charts.

### 3. Evidence Section

Evidence appears below the coaching content.

This is where the existing dashboard material belongs:

- Affected sessions.
- Cost deltas.
- Tool failures.
- Retry loops.
- Model usage.
- Cache/context behavior.
- Token trend.
- Model mix.
- Top sessions.
- Top repos.
- Top tool calls.
- Activity heatmap.
- Commands, agents, and skills usage.

The evidence section can remain dense and instrumentation-heavy. Its job is to prove the coaching claims.

## Relationship To Current Mockup

Baseline mockup:

`Claude DevTools Design System/ui_kits/insights.html`

The current mockup is dashboard-first:

- Headline stats.
- Token trend.
- Activity charts.
- Model mix.
- Top consumers.
- Commands, agents, skills.
- Efficiency hints at the bottom.

The redesign should invert this hierarchy:

- Efficiency/coaching moves to the first viewport.
- Charts move below as supporting evidence.
- The top stats should either become compact context above the coaching feed or move into the evidence area.

## Coaching Card Content Model

Each coaching card should be able to stand alone.

Recommended fields:

- `title`: short behavior pattern.
- `diagnosis`: one or two plain-language sentences.
- `impact`: estimated dollars, time, or quality cost.
- `recommendation`: one concrete change.
- `evidence_summary`: session count, tool calls, failures, or model/context signal.
- `severity`: high, medium, low.
- `confidence`: high, medium, low.
- `category`: cost, speed, quality, workflow, model, context.

Avoid generic advice like:

> Improve prompting.

Prefer specific advice like:

> Read the target file and nearest tests before editing. The last 6 blind-edit sessions produced 18 failed tool calls and 4 test-fix loops.

## Quality Signals

Quality should not be a vague AI judgment. It needs evidence.

Use AI to interpret and explain patterns, but ground every claim in deterministic session signals such as:

- Failed tool calls.
- Repeated identical or near-identical commands.
- Edit-test-fix retry loops.
- Abandoned sessions.
- Reverted edits.
- Test failures after edits.
- User correction patterns.
- Permission denials.
- Repeated file reads without progress.
- Long context usage followed by poor completion.

The AI layer should write the coaching explanation. The system should provide the facts.

## AI Role

AI should act as the narrator and analyst, not the source of raw truth.

Recommended split:

- Deterministic detectors collect signals and candidate patterns.
- AI summarizes the pattern in plain language.
- AI prioritizes the top 3 changes for the week.
- UI exposes the exact evidence behind each claim.

This keeps the product useful and avoids vague or unverifiable coaching.

## Tone

The voice should be direct, specific, and engineer-facing.

Good:

> Opus is concentrated in review work. `/review` used Opus for 21% of turns but 48% of spend this week. Route routine review passes to Sonnet first, then escalate only unresolved defects.

Avoid:

> You may want to optimize your model usage for better efficiency.

The page should feel like a senior engineer reviewing your workflow, not a generic analytics assistant.

## First Viewport Requirement

The first viewport should contain:

- Page title and scope controls.
- A compact period summary.
- 3-4 coaching cards or the top coaching card plus a ranked list.
- Clear actions to inspect evidence.

The first viewport should not be dominated by charts.

## Design Principles

- Coach first, charts second.
- Diagnosis before metrics.
- Prescriptions must be specific.
- Every claim must have evidence.
- Impact should be visible without expanding the card.
- Evidence should be inspectable, not forced.
- Keep the existing Claude DevTools density and instrumentation aesthetic.
- Do not make the page feel like marketing, onboarding, or a generic AI chat screen.

## Open Design Questions

- Should the top layout show all 3-4 coaching cards equally, or one primary diagnosis with smaller secondary cards?
- Should `Tell me more` open an inline analysis panel, a drawer, or a modal?
- Should evidence be global at the bottom or filtered to the selected coaching card by default?
- Should charts show all usage data by default or only data relevant to the selected coaching claim?
- How should confidence be visualized without making the UI feel noisy?

## Designer Deliverable

Produce a revised Insights mockup that shows:

- Coach-first first viewport.
- 3-4 ranked coaching cards.
- Expanded selected coaching analysis.
- Evidence area below the coaching layer.
- How existing charts are reused as evidence.
- Empty/loading/error states for the coaching feed.
- Interaction states for selecting a card and viewing evidence.

The main success criterion: a user should know what to change this week before looking at any chart.
