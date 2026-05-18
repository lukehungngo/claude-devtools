# Insights Coaching Section Redesign Principles

Date: 2026-05-18

## Purpose

This document defines only the redesign principles for the Insights coaching section.

It does not describe implementation details, APIs, detector logic, or current component structure.

## Core Principle

The coaching section should answer:

> What should I change this week, and why?

It should not make the user interpret charts, metrics, or raw session data before receiving a clear diagnosis.

## Product Stance

The coaching section is a coach, not a dashboard.

Charts and detailed evidence are supporting material. They should prove a diagnosis after the user asks, not dominate the first read.

## Three-Level Abstraction

### Level 1: Concise Diagnosis

Default scanning state.

Show the smallest useful summary:

- What pattern was detected.
- Whether it affects cost, speed, quality, context, workflow, or model usage.
- The estimated impact.
- One short human-readable signal.

The user should be able to scan all diagnoses quickly without opening anything.

### Level 2: Coaching Detail

Opened when the user asks for more.

Explain:

- What happened.
- Why it matters.
- What to change this week.
- What outcome to expect.

This level should still be coaching, not raw evidence.

### Level 3: Evidence

Opened only when the user asks to verify the claim.

Show:

- Rule inputs.
- Exact counts.
- Affected sessions.
- Costs, durations, token/context signals, or quality signals.

Evidence must stay attached to the diagnosis it proves.

## Progressive Disclosure Rules

- Do not expand any diagnosis by default.
- Show all diagnoses first as a ranked scan list.
- Expanding one diagnosis should collapse any other expanded diagnosis.
- A diagnosis can be collapsed back to the scan state.
- Evidence should not appear automatically with details.
- Evidence should open with a separate action from details.
- Switching diagnosis should close previously open evidence.

## Spatial Rules

- Evidence belongs directly under its diagnosis.
- Do not place selected evidence at the bottom of the whole section.
- Do not require users to infer that a remote panel belongs to a selected card.
- Keep Quick Wins separate from the diagnosis disclosure flow.

## Copy Rules

Use plain, behavior-focused language.

Prefer:

- `View details`
- `Details open`
- `Show evidence`
- `Hide evidence`
- `Change this week`
- `What happened`
- `Why it matters`

Avoid:

- `confidence score`
- `p95`
- `p99`
- `cache hit rate is low` as the main diagnosis
- vague advice like `optimize usage`

Translate specialist terms into user-readable consequences.

Example:

Instead of:

> p95 duration is high.

Use:

> Slow turns are delaying feedback.

## Evidence Rules

Every coaching claim must be evidence-backed.

Evidence can include:

- Failed tool calls.
- Retry loops.
- Rejected edits.
- Test failures.
- User corrections.
- Permission denials.
- Repeated file reads.
- Cache/context signals.
- Cost or token outliers.
- Long turn durations.

AI may explain and prioritize, but it must not invent proof.

## Visual Rules

The coaching section should feel like a dense developer tool:

- Compact rows.
- Strong scan hierarchy.
- Warm surfaces.
- Category rails or chips.
- Clear selected state.
- Minimal decorative styling.
- No marketing layout.
- No chart-first layout.

The design should help users move from:

> diagnose -> understand -> verify

without leaving the coaching section.

## Success Criteria

The redesign succeeds when a user can:

- Understand the top 3-5 diagnoses without expanding anything.
- Expand one diagnosis and know exactly what to change.
- Collapse details when they are done.
- Open evidence only when they want proof.
- See clearly which evidence belongs to which diagnosis.
- Avoid reading raw analytics unless they choose to inspect evidence.
