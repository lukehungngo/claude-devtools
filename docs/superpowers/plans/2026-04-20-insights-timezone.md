# Plan: insights-timezone

## Requirement
Implement timezone-aware bucketing in the Insights page. Currently all date/hour bucketing uses UTC, causing Vietnamese users (UTC+7) to see peak hours and daily buckets shifted 7 hours. Fix: client sends UTC offset in minutes as `tz` query param; server uses it for local-time bucketing.

## Reference
docs/brainstorms/2026-04-20-insights-timezone.md

## Strategy
Client sends `tz=-420` (Vietnam = UTC+7 → offset = -420 minutes in JS convention → we send the offset as-is and the server interprets it). Server converts each timestamp to local time before extracting hour/date.

JS `Date.prototype.getTimezoneOffset()` returns minutes WEST of UTC (positive = behind UTC). UTC+7 → -420. So `localMs = utcMs - offsetMs` where `offsetMs = offset * 60_000`.

---

## Tasks

### TASK-01: Server — accept tz param and use local time for bucketing
**Goal:** All 5 Insights route handlers parse a `tz` integer query param (default 0 = UTC) and pass it to aggregators. Aggregators use local offset to compute daily bucket and hour of day.
**Files:**
- `server/src/http/routes/insights-routes.ts` — parse `tz` from query, pass to analyzer calls
- `server/src/analyzer/insights-aggregator.ts` — replace `.toISOString().slice(0,10)` with local date, replace `getUTCHours()` with local hour
- `server/src/analyzer/activity-aggregator.ts` — replace `getUTCDay()`/`getUTCHours()` with local equivalents
- `server/src/analyzer/insights-top-consumers.ts` — replace `.toISOString().slice(0,10)` with local date

**Acceptance:** `GET /api/insights/activity?tz=-420` returns hour buckets in Vietnam local time (9am work = hour 9, not hour 2).

### TASK-02: Client — send tz param from all Insights hooks
**Goal:** All 5 Insights hooks automatically append `&tz=${new Date().getTimezoneOffset()}` to their API calls.
**Files:**
- `dashboard/src/hooks/useInsightsActivity.ts`
- `dashboard/src/hooks/useInsightsAggregate.ts`
- `dashboard/src/hooks/useInsightsTopConsumers.ts`
- `dashboard/src/hooks/useInsightsModelMix.ts`
- `dashboard/src/hooks/useInsightsCommandsAgentsSkills.ts`

**Acceptance:** Every Insights API call includes `tz` param. No UI changes needed — the data comes back correctly bucketed.

## Verification
```bash
cd server && pnpm test && cd ../dashboard && pnpm test
cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit
```
