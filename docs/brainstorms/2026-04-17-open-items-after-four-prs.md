# Brainstorm: open items after today's four PRs

**Date:** 2026-04-17
**Input type:** Question ("what problem do we have left from the conversation above")

## Shipped today

| PR | SHA | Title |
|----|-----|-------|
| #26 | `ef4bd61` | exclude `<synthetic>` model and use last real model for context window |
| #27 | `deebc6c` | finalize agents in extendTurn so completed turns never show running pills |
| #28 | `2f7d6f9` | unify Agent Graph timeline bounds and turn membership |
| #29 | `4aa1ea0` | turn status ignores sidechain end_turn events |

All four: same class — "one fact derived in multiple places without an ownership filter."

## Open items — prioritized

### P1 — Structural cure for the "multiple derivations" class
The pattern keeps recurring because `turnSnapshot.ts` has 4+ parallel reducers that each decide how to filter `events` by ownership, and each got it wrong at least once. The cure is the helper pair:

```ts
function mainEventsOnly(events: SessionEvent[]): SessionEvent[]
function eventsForAgent(events: SessionEvent[], agentId: string): SessionEvent[]
```

Every reducer must accept only filtered input. `agentMap[agentId].lastEvent` derivations must go through `eventsForAgent`. Status derivations for the turn must go through `mainEventsOnly`. Ad-hoc `event.agentId ?? "main"` patterns get deleted.

The brainstorms for #28 and #29 both recommend this. It's the only item that could prevent the 5th instance of this bug.

**Ship path:** `/mas:dev-loop unify event-ownership filtering per docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md`

### P2 — Empirical visual verification of #28
PR #28's fix was logically traced for session `de81c175-796c-483f-877c-d81ccac9029d` turn 9. Nobody opened the dashboard to confirm the pixels match. The dev-mode warn from TASK-003 fires if wrong, but only when someone loads the page.

**Ship path:** manual — `pnpm dev` in `dashboard/`, load session, compare main bar width, subagent list (expect 2 not 4), and tick range.

### P2 — Agent-level status reducer uses same ad-hoc pattern
`turnSnapshot.ts:284-289` and `:453-460` derive each agent's status from `info.lastEvent` keyed by `event.agentId ?? "main"`. This is the same construction that caused #27 and #29 — just contained today by the `agentMap` filter introduced in #28. One future refactor of `agentMap` population could leak it again.

**Ship path:** folds into P1 `/mas:dev-loop`.

### P2 — No end-to-end integration test
Each of the four PRs covers its own slice. A single integration test that builds a multi-turn, multi-subagent fixture and asserts the final rendered state (agents list, turn status, timeline bounds, bar widths) would have caught at least 3 of the 4 bugs before merge.

**Ship path:** new branch or fold into P1 — write `turnSnapshot.integration.test.ts` with one realistic multi-turn session.

### P3 — Temporal-proximity 5s window is silent drift
`computeDispatchedAgentIds` binds a main tool_use to a subagent via description-match OR a 5s timestamp window. If subagent spin-up ever exceeds 5s (cold start, network pause), the fallback silently misses. No telemetry, no test that would fire.

**Ship path:** trivial bug-fix — dev-mode `console.warn` when fallback fails to bind a main Task dispatch. ~5 lines.

### P3 — Four pre-existing tsc errors
`useUsage.test.ts:23` (UsageInfo cast mismatch) and `globals.test.ts:2-4` (missing `@types/node` for fs/url/path imports). Unrelated to any of today's work, ignored across all four PRs. Easy fix.

**Ship path:** small separate PR.

### P3 — `TurnSnapshot.dispatchedAgentIds` is optional
Added in PR #28 as `dispatchedAgentIds?: Set<string>`. Flows through `buildTurn`, `extendTurn`, `groupEventsIntoTurnsIncremental`, and `finalizeTurn`. A future contributor adding a fifth path to produce TurnSnapshots could forget to populate it, silently defaulting to `{ "main" }` and regressing membership filtering.

**Ship path:** make required in a small refactor PR, OR fold into P1 since the whole field becomes internal to the reducer after consolidation.

## What's NOT a problem

- Live session correctness for today's user-reported bugs — all four shipped and logically traced.
- Test suite health — 1178 pass, zero regressions.
- Server — untouched today; no risk introduced.
- PR cadence — 4 PRs in 14 hours, all green, no reverts.

## Meta-observation

Today's cadence was reactive. Every fix landed after a user report:
- `<synthetic>` → user screenshot
- turn completed + agent running → user anger ("why the fuck")
- Agent Graph timeline → user screenshot
- last turn always completed → user question

Nothing on the open-items list above is a user complaint. It's technical debt the conversation surfaced through decomposition. P1 is the single highest-leverage remaining task. Everything else folds into it or is trivial cleanup.

**Recommendation:** run the P1 dev-loop next. That eliminates the class that generated items #1, #2, #3 of today's four PRs. If we don't do it, the 5th instance is a matter of time.

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-open-items-after-four-prs.md`

Your choice:

1. `/mas:dev-loop unify event-ownership filtering per docs/brainstorms/2026-04-17-turn-status-sidechain-bleed.md` — the P1 structural cure. Makes items #1 and #3 extinct, folds in #7.
2. `/mas:bug-fix fix temporal-proximity drift warning` — 5 lines, P3.
3. `/mas:bug-fix fix pre-existing tsc errors` — 10 min, P3.
4. Nothing — tomorrow problem. Today was four PRs, that's enough.
