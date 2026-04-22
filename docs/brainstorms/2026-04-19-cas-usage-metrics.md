# Brainstorm: CAS sections should show usage metrics, not just ranking

**Date:** 2026-04-19
**Input type:** Observation
**Input:** The UI kit mockup shows Agents/Commands/Skills with sparklines, token in/out counts with % delta, and trend status (IMPROVING/STABLE/REGRESSING). Current implementation only shows a ranked list of names with call counts.

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Current CAS sections show only name + call count | CONFIRMED | `insights-commands-agents-skills.ts` returns `Map<string, number>` — count only |
| Mockup shows per-agent token in/out | CONFIRMED | Screenshot: "11.2K in -21% / 36.0K out -25%" per row |
| Mockup shows daily sparkline per item | CONFIRMED | Two-line sparkline (current vs prior period) visible in each row |
| Mockup shows trend status pill | CONFIRMED | IMPROVING / STABLE / REGRESSING badge per row |
| Per-agent tokens are available in parent JSONL | QUESTIONED | Parent JSONL has per-message usage, NOT per-individual-tool-call; cannot cleanly attribute tokens to a single Agent dispatch |
| Daily counts per agent are feasible | CONFIRMED | Analyzer iterates all JSONL lines with timestamps — easy to bucket by day |

## Fundamentals

**What the mockup is communicating:**
Each agent/command/skill is a resource you consumed. The question isn't "did you use it" — it's "how much did it cost and is that getting better or worse?" That's a fundamentally different mental model: ranking → resource accountability.

**What data we actually have (from JSONL):**

1. **Call count per item** — already tracked ✓
2. **Timestamp of each call** — present in JSONL events; enables daily bucketing ✓
3. **Per-agent token breakdown** — NOT directly available. Parent session tokens are per-message, not per-tool-call. Sub-agent sessions are separate JSONL files linked by tool_use_id — following those chains is architecturally complex.
4. **Trend** — derivable from daily call counts (days 1-3 vs days 5-7 of a 7d window)

**What the sparkline actually needs:**
The mockup shows TWO lines per sparkline (green + purple). These likely represent current period vs prior period for call counts per day. That only requires daily bucketing of call counts — no token data needed for the sparkline itself.

**What "tokens in/out" requires:**
For agents: ideally we'd follow each Agent tool_use_id → sub-agent JSONL → sum that session's tokens. That's a cross-file join across potentially 100s of sessions. Expensive and architecturally heavy.

**Alternative for tokens:** Use call count as the "usage" metric instead. Show "42 calls" prominently, sparkline of daily calls. Skip per-agent token breakdown for now. The trend status still works: if dispatch count goes up 70% → REGRESSING (you're leaning on this agent more).

## Output

**Solution direction — two-phase:**

### Phase 1 (implement now): Add daily counts + trend status + sparkline

Extend `InsightsCASData` from:
```ts
{ agents: Array<{name, count}>, commands: ..., skills: ... }
```
to:
```ts
{ 
  agents: Array<{name, count, daily: number[], trend: "improving"|"stable"|"regressing"}>,
  commands: ...,
  skills: ...
}
```

Where `daily` = call counts per day over the time range (7 values for 7d, 30 for 30d).

**Trend formula:**
- Compare first half avg vs second half avg of `daily`
- second > first × 1.2 → `"regressing"` (usage growing)
- second < first × 0.8 → `"improving"` (usage shrinking)
- else → `"stable"`

**UI per row:**
```
[BADGE] agent-name    [sparkline 7 bars]    42 calls    [▼ IMPROVING]
```

No token data per agent — show call counts instead. Honest and achievable.

**Files to change (Phase 1):**

| File | Change |
|------|--------|
| `server/src/analyzer/insights-commands-agents-skills.ts` | Add `daily: number[]` and `trend` to each item; bucket by day using event timestamps |
| `server/src/http/routes/insights-routes.ts` | Type update only |
| `server/src/http/routes/insights-routes.test.ts` | Update test fixtures |
| `dashboard/src/hooks/useInsightsCommandsAgentsSkills.ts` | Update return type |
| `dashboard/src/components/insights/CASSection.tsx` (new or existing) | Render rows with badge + sparkline bars + count + trend pill |

### Phase 2 (later): Per-agent token attribution

Option A: Follow tool_use_id → sub-agent session JSONL → sum tokens. Requires index of session files by ID, expensive on large repos.
Option B: Accept limitation — token data at the CAS level stays aggregate only. Token breakdown is already in the "Top Consumers" section.

Phase 2 is a separate, larger task. Phase 1 delivers the visual upgrade from ranking to resource tracking.

## Next Steps

```
/mas:dev-loop implement CAS usage metrics (daily sparkline + trend status) — see docs/brainstorms/2026-04-19-cas-usage-metrics.md --auto
```
