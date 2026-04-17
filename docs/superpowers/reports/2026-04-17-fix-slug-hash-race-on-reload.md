# Bug Fix Report: fix/slug-hash-race-on-reload

**Plan:** docs/superpowers/plans/2026-04-17-slug-hash-race-on-reload.md
**Branch:** fix/slug-hash-race-on-reload

## Bug
On page reload, 2 red-X 404s on `/api/sessions/{slug}/{id}` visible in Network panel. Caused by `?? repoSlug` fallback firing while `/api/repos` still loading.

## Fix
New `resolveProjectHashForFetch(slug, slugMap, reposLoading)` helper in `dashboard/src/lib/repoSlug.ts`. Returns null while loading, mapped hash when available, slug as last-ditch fallback. `useSessionMetrics` already guards null. Loading UX preserved.

## Review
APPROVED (0 P0, 0 P1, 0 P2, 1 P3 — optional comment about useRepos refresh semantics).

## Verification
1189/1189 dashboard tests pass, tsc clean for surface. Failing-revert tests confirm T-RELOAD-1/2/3 would fail if helper is reverted.

## Verdict
FIXED
