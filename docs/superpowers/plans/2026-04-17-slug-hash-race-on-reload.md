# Plan: Fix slug/hash race on page reload

**Date:** 2026-04-17
**Branch:** `fix/slug-hash-race-on-reload`
**Brainstorm:** `docs/brainstorms/2026-04-17-slug-hash-race-on-reload.md`
**Scope:** Narrow bug fix — eliminate 2 failed API requests per reload.

## Bug

On every session page reload, the dashboard sends `GET /api/sessions/{slug}/{sessionId}` before `/api/repos` finishes loading. The slug ≠ projectHash, so the server 404s. React StrictMode doubles the effect → 2 failed requests visible in the Network panel per reload.

## Root Cause

`dashboard/src/routes/SessionPage.tsx:63`:
```ts
const projectHash = resolveSlugToProjectHash(repoSlug, slugMap) ?? repoSlug;
```

The `?? repoSlug` fallback fires during the narrow window when `slugMap` is empty (repos still loading). Server receives the slug where it expects a projectHash → 404. Once repos load, useEffect dep changes, fetch re-fires with the correct hash → 200.

## Fix

### File: `dashboard/src/routes/SessionPage.tsx`

Change line 63 to distinguish "repos loading" from "repos loaded, slug unknown":
```ts
const projectHash = slugMap.size === 0 && reposLoading
  ? null                                                    // hold the request
  : (resolveSlugToProjectHash(repoSlug, slugMap) ?? repoSlug); // last-ditch fallback
```

`useSessionMetrics` already guards `projectHash === null` (see `useSessionData.ts:15`). When projectHash is null, it returns early, clears state, fires no fetch. When slugMap populates, SessionPage re-renders, projectHash becomes the real hash, fetch fires correctly — first time.

### Accessing `reposLoading`

Pull the loading flag from `useLayoutContext` (where `slugMap` comes from). Check `dashboard/src/routes/AppLayout.tsx` for how repos state is exposed — likely `reposLoading` or similar is already available. If not, thread it through the context.

### Tests

Add to `dashboard/src/routes/__tests__/SessionPage.test.tsx` (if exists) or a new test file:

- **T-RELOAD-1** `no fetch fires while repos are loading`:
  Mount SessionPage with `slugMap = Map()`, `reposLoading = true`, `repoSlug = "some-slug"`, `sessionId = "abc"`. Assert `fetch` was NOT called with `/api/sessions/some-slug/abc`.

- **T-RELOAD-2** `fetch fires with correct projectHash once repos resolve`:
  Mount with `reposLoading = true`, then update to `slugMap = Map([["some-slug", "-Users-soh-some-slug"]])`, `reposLoading = false`. Assert `fetch` was called ONCE with the correct URL.

- **T-RELOAD-3** `fallback to raw slug if repos loaded but slug unknown`:
  Mount with `slugMap = Map()`, `reposLoading = false` (loaded but empty), `repoSlug = "unknown-slug"`. Assert fetch fires with `/api/sessions/unknown-slug/...` (last-ditch behavior preserved).

## Scope

- `dashboard/src/routes/SessionPage.tsx` — 2-3 lines
- `dashboard/src/routes/AppLayout.tsx` (maybe, to expose `reposLoading` if not already exposed)
- 1 test file

## Out of Scope

- Server-side slug-or-hash resolution
- The `commands` endpoint 404 (cosmetic, working as designed — see brainstorm)
- E2E Playwright test (recommended follow-up; not this PR)

## Verification

```bash
cd dashboard && pnpm test --run
cd dashboard && npx tsc --noEmit
```

- All 1185 existing tests pass + new ones.
- tsc: 4 pre-existing unrelated errors unchanged.
