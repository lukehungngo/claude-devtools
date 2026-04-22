# Brainstorm: Timezone Awareness in Insights Page

**Date:** 2026-04-20
**Input type:** Question
**Input:** did u make all the timeline or time in insight page timezone awareness

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Insights date buckets use UTC | CONFIRMED | `insights-top-consumers.ts:127` — `.toISOString().slice(0, 10)` (ISO = UTC) |
| Hour-of-day bars use UTC hours | CONFIRMED | `getUTCHours()` confirmed in server analyzer |
| Client display uses local timezone | CONFIRMED | `.toLocaleTimeString()` in RewindMenu, RawLogView |
| Dashboard was made timezone-aware | QUESTIONED | No evidence — all Insights bucketing is UTC |

## Fundamentals

- JSONL timestamps are ISO 8601 UTC strings — that's the raw data.
- Server buckets by `isoString.slice(0, 10)` → UTC calendar day.
- Server buckets by `getUTCHours()` → UTC clock hour.
- A user in UTC+7 working 9am–6pm local sees sessions bucketed as 2am–11am UTC in charts.
- Day boundary bug: midnight session for UTC-5 shows as "previous day" in Insights.

## Answer

**No — Insights is NOT timezone-aware.** All date and hour bucketing is UTC.

**Impact by offset:**
- UTC±2: mostly invisible
- UTC+7 to +12 (Vietnam, Japan, AU): meaningful — peak hours shift half a day, day boundaries regularly wrong

## Fix Options

1. **Server-side (ideal):** Client sends `Intl.DateTimeFormat().resolvedOptions().timeZone` or `getTimezoneOffset()` as query param. Server uses local time for bucketing.
2. **Client-side shift (simpler):** Keep UTC on server, shift X-axis labels by `getTimezoneOffset()` on client. Hour bars work; date buckets still broken at boundaries.
3. **Status quo:** Document UTC bucketing, accept limitation.

**Recommendation:** Option 1. One query param + swap `getUTCHours()` → `getHours()` after offset conversion.

## Next Steps

- If fixing: `/mas:dev-loop implement timezone-aware bucketing in Insights — see docs/brainstorms/2026-04-20-insights-timezone.md`
