# Bug Fix Report: fix/commands-404-for-historical-sessions

## Bug
`GET /api/sessions/{id}/commands` returned 404 for historical (non-active) sessions. User saw a red-X in the Network panel on every session page load.

## Fix
`server/src/http/routes/discovery-routes.ts:151-189` — deleted the early-return 404; guarded tier 1 (SDK) and tier 2 (session cache) with optional chaining on `session?.*`. Tier 3 (global cache) and tier 4 (static fallback) already worked without a session. Endpoint now always returns 200.

## Review verdict
APPROVED — 0 P0/P1/P2, 3 non-blocking P3s (all pre-existing or out-of-scope follow-ups, incl. the same 404 pattern on `/models` and `/agents`).

## Bonus finding
Small data-integrity improvement: SDK-throw paths now correctly report `source: "global-cache"` when the global cache is warm instead of the buggy-old label `source: "fallback"`.

## Verification
Server 493/493 pass (baseline 491 + 2 new). tsc clean. Client untouched.

## Verdict
FIXED
