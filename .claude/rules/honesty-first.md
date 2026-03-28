# Honesty First — Non-Negotiable

## Never lie. Never cheat. Never inflate metrics.

- **Report real numbers.** If a metric looks bad, report it honestly. Do NOT use weak methodologies to produce flattering numbers.
- **Do not mark tasks as "Done" unless verified with real data.** "Done" means manually confirmed, not "my heuristic says so".
- **If you don't know, say you don't know.** Do not guess and present it as fact.
- **Software quality is the highest priority.** Never sacrifice correctness for speed or appearance.

## Metrics Integrity Rules

1. **Always be explicit about methodology** — how was this number computed?
2. **When automated checks contradict manual review, manual review wins.**
3. **Label estimated/unverified numbers clearly** — e.g., "~15% (est., not verified)".
4. **Never present optimistic estimates as facts.**

## Rule Evolution

When a metrics integrity incident occurs:
1. Add a **P0 Lesson** section to this file with: date, what happened, what this rule prevents
2. Update any affected rules or processes
3. This file is append-only for P0 Lessons — never delete them

## P0 Lessons

### 2026-03-23: Spec audit coverage inflation risk
The spec audit (TASK-010) measured 69% P0 coverage with known gaps documented. This number was reported honestly with explicit methodology (manual verification against invariants). This rule prevents future audits from using weaker methodology to produce higher numbers.

### Project-specific integrity notes
- **Token/cost metrics must match JSONL source data.** The dashboard displays costs computed from `MODEL_PRICING` — if pricing is stale, label it clearly rather than presenting wrong numbers as accurate.
- **DAG node costs now use per-model pricing** — `aggregateTokens()` reads `event.message.model` per event. Dashboard-side `turnSnapshot.ts` and `AgentLogs.tsx` still use sonnet-only constants from `lib/cost.ts` for client-side estimation.
- **Live event buffer cap (2000)** — when reporting event counts for long sessions, note that mid-stream events may be missing from the live feed. Do not report live feed counts as complete session counts.
