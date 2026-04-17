# Brainstorm: failed API requests on every page reload

**Date:** 2026-04-17
**Input type:** Observation
**Input (verbatim):** "whenever i reload i found these api not working"

## What the user sees

Chrome Network panel shows 4 red-X failed requests on every reload of a session page:
- 2× `GET /api/sessions/claude-devtools/de81c175-796c-483f-877c-d81ccac9029d`
- 2× `GET /api/sessions/de81c175-796c-483f-877c-d81ccac9029d/commands`

The subsequent retries succeed. The app works. But the network tab looks broken every reload.

## Two different bugs

### Bug #1 — Real: slug/hash race condition

`dashboard/src/routes/SessionPage.tsx:63`:
```ts
const projectHash = resolveSlugToProjectHash(repoSlug, slugMap) ?? repoSlug;
```

**The `?? repoSlug` fallback is active while `/api/repos` is still loading.** On cold reload:
1. `SessionPage` renders immediately with `slugMap = Map()` (empty).
2. `resolveSlugToProjectHash("claude-devtools", emptyMap)` returns null.
3. Fallback to `repoSlug` = `"claude-devtools"` (URL slug).
4. `useSessionMetrics` fires `GET /api/sessions/claude-devtools/{sessionId}` — 404 because "claude-devtools" is a SLUG, not a projectHash.
5. React StrictMode double-invokes the effect → 2 failures.
6. Once `/api/repos` resolves, `slugMap` populates, SessionPage re-renders, useEffect re-fires with the correct `projectHash` (`-Users-soh-working-ai-claude-devtools`), server answers 200.

The app recovers; the 2 failed requests are wasted.

### Non-bug #2 — Commands 404 for historical sessions

`server/src/http/routes/discovery-routes.ts:157-160`:
```ts
const session = sessionManager.getStatus(req.params.sessionId);
if (!session) {
  return res.status(404).json({ error: "Session not found" });
}
```

For historical sessions (JSONL-only, not running via SDK), `sessionManager.getStatus` returns null → 404. This is intentional. The client at `dashboard/src/hooks/useDiscovery.ts:128-138` catches the 404 and falls back to `/api/commands` (global endpoint). Works correctly. The red X in network panel is misleading cosmetic noise.

## Fundamentals

1. `repoSlug` (URL segment) ≠ `projectHash` (server directory key). Slug is a short, URL-friendly transformation of the hash.
2. Slug → hash resolution is client-side via `slugMap`, populated from `/api/repos`.
3. On cold reload, two parallel fetches fire: `/api/repos` (which populates slugMap) and `/api/sessions/{slug}/{id}` (which NEEDS slugMap). There's no ordering.
4. React StrictMode amplifies: 2 mounts × 1 failed fetch = 2 failures visible per reload.
5. Only the client SessionPage's fallback logic is broken. The server correctly 404s unknown projectHashes — that's actually correct behavior.

## Fix direction

### Primary (closes Bug #1)

Change `SessionPage.tsx:63` to hold the request until repos are loaded:
```ts
// Pseudo-code — actual impl should pull a loaded/loading flag from useRepos
const projectHash = slugMap.size === 0 && reposLoading
  ? null
  : (resolveSlugToProjectHash(repoSlug, slugMap) ?? repoSlug);
```
`useSessionMetrics` already handles `projectHash === null` (line 15 of `useSessionData.ts`): returns early, clears state, doesn't fetch. Once `slugMap` populates, the effect re-fires with the real hash and succeeds on the first try. Zero 404s.

The `?? repoSlug` fallback is kept for the case where `slugMap` is loaded but doesn't contain the slug — last-ditch attempt that preserves current behavior for unknown projects.

### Secondary (cosmetic — eliminates Non-bug #2)

Either:
- **Server:** `/api/sessions/{id}/commands` returns 200 with the global fallback commands when the session isn't active, instead of 404. It already has the fallback chain (lines 154, 172, 183) — just move the fallback into the happy path.
- **Client:** `useDiscoveryCommands` skips the session-specific endpoint when the session is known to be historical (e.g., no SSE connection open for it), and goes straight to `/api/commands`.

Neither is a bug. Low-priority polish.

### Regression guard

An e2e Playwright test that:
1. Loads a session URL directly (simulates reload).
2. Waits for network idle.
3. Asserts zero 4xx responses on `/api/sessions/...` paths.

This is the P2 "integration test" item already flagged in `docs/brainstorms/2026-04-17-open-items-after-four-prs.md`. Doubles as a regression guard for this class.

## Scope of the fix

- Primary: ~5 lines in `SessionPage.tsx` + possibly 1 line in `useRepos.ts` to expose a loading flag.
- Tests: 1 unit test for the null-projectHash branch of `SessionPage`, 1 Playwright e2e (optional but recommended).

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-slug-hash-race-on-reload.md`.

Your choice:

- `/mas:bug-fix fix slug/hash race on reload per docs/brainstorms/2026-04-17-slug-hash-race-on-reload.md` — narrow fix, ~5 lines production + a unit test. Closes Bug #1.
- `/mas:bug-fix --auto fix slug/hash race on reload per docs/brainstorms/2026-04-17-slug-hash-race-on-reload.md` — same, autonomous.
- Skip the commands 404 polish (it's cosmetic, not a bug).
