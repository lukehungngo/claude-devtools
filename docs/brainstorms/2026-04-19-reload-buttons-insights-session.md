# Brainstorm: Reload buttons for Insights and Session pages

**Date:** 2026-04-19
**Input type:** Idea
**Input:** give me button to reload on insight and session. For session, only reload selected session including conversation, graph, log, everything inside it

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Session page has no manual reload button today | CONFIRMED | No RefreshCw icon or reload handler in SessionPage UI |
| Insights page has no manual reload button today | CONFIRMED | No refresh capability in any insights hook |
| `useSessionMetrics` already has a `refresh()` function | CONFIRMED | useSessionData.ts:54 — `refresh` via `refreshCount` increment |
| All 5 insight hooks need independent refresh triggers | CONFIRMED | Each hook has its own `useEffect` with no external trigger |
| Session reload must cover conversation + graph + log | CONFIRMED | All three tabs consume events/metrics/subagentMeta from same useSessionMetrics call |

## Fundamentals

**What is a "reload"?**
Re-run the existing fetch logic with fresh data from the server. Not a page navigation, not a filter reset.

**Session reload — what exists:**
- `useSessionMetrics` returns `refresh` via `refreshCount` state (useSessionData.ts:54)
- `refreshMetrics` already wired in SessionPage.tsx, called automatically on WS events
- Adding a manual button = just call `refreshMetrics()` on click
- Refetches `/api/sessions/{projectHash}/{sessionId}` → metrics + events + subagentMeta → feeds ALL tabs
- Zero new infrastructure needed

**Insights reload — what's missing:**
- All 5 hooks use `useEffect` with `[timeRange, repo]` deps only — no external re-trigger
- Fix: add `refreshCount: number` param to each hook; include in useEffect deps
- InsightsPage holds one shared `refreshCount` state, increments on button click
- All 5 hooks re-fetch simultaneously

## Output

Both features are worth building. Both are minimal. Zero new architecture.

### Session — Reload button

**Where:** Tab bar right side in SessionPage.tsx, next to existing turn scope label
**Icon:** `RefreshCw` from lucide-react (already used in project)
**Wiring:** `refreshMetrics` already exists

```tsx
<button onClick={refreshMetrics} disabled={metricsLoading} title="Reload session"
  className="ml-auto mr-2 text-dt-text3 hover:text-dt-text1 disabled:opacity-40">
  <RefreshCw size={13} className={metricsLoading ? "animate-spin" : ""} />
</button>
```

### Insights — Reload button

**Where:** Next to SegPill controls in InsightsPage.tsx header
**Icon:** Same `RefreshCw`

```tsx
// InsightsPage.tsx
const [refreshCount, setRefreshCount] = useState(0);
const anyLoading = loading || activityLoading || modelMixLoading || topConsumersLoading || casLoading;
// pass refreshCount to each hook
<button onClick={() => setRefreshCount(c => c + 1)} disabled={anyLoading} title="Reload insights"
  className="text-dt-text3 hover:text-dt-text1 disabled:opacity-40">
  <RefreshCw size={13} className={anyLoading ? "animate-spin" : ""} />
</button>
```

Each hook gains a `refreshCount` parameter added to its `useEffect` deps.

### Files to change

| File | Change |
|------|--------|
| `dashboard/src/routes/SessionPage.tsx` | Add RefreshCw button in tab bar, wire to refreshMetrics |
| `dashboard/src/routes/InsightsPage.tsx` | Add refreshCount state + button; pass to all 5 hooks |
| `dashboard/src/hooks/useInsightsAggregate.ts` | Add refreshCount param + dep |
| `dashboard/src/hooks/useInsightsActivity.ts` | Add refreshCount param + dep |
| `dashboard/src/hooks/useInsightsModelMix.ts` | Add refreshCount param + dep |
| `dashboard/src/hooks/useInsightsTopConsumers.ts` | Add refreshCount param + dep |
| `dashboard/src/hooks/useInsightsCommandsAgentsSkills.ts` | Add refreshCount param + dep |

7 files, all UI/hook layer. No server changes.

## Next Steps

`/mas:dev-loop implement reload buttons for Insights and Session — see docs/brainstorms/2026-04-19-reload-buttons-insights-session.md --auto`
