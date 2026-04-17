# Plan: `/api/sessions/{id}/commands` should return fallback, not 404

**Date:** 2026-04-17
**Branch:** `fix/commands-404-for-historical-sessions`
**Scope:** Tiny cosmetic fix — server returns 200 with global fallback commands instead of 404 for historical sessions.

## Bug

`GET /api/sessions/{id}/commands` returns 404 whenever the session isn't active in `sessionManager`. All historical/JSONL-only sessions hit this. The client at `dashboard/src/hooks/useDiscovery.ts:128-138` catches the 404 and falls back to `/api/commands`, so the app works. But the Network panel shows a red-X failed request on every session page load, which is misleading noise.

## Root Cause

`server/src/http/routes/discovery-routes.ts:157-160`:
```ts
const session = sessionManager.getStatus(req.params.sessionId);
if (!session) {
  return res.status(404).json({ error: "Session not found" });
}
```

This 404 short-circuits the endpoint's own fallback chain (lines 172, 183) which already knows how to return global commands when per-session SDK data isn't available.

## Fix

Reshape the not-found branch to fall through to the same fallback chain that the session-active path already uses.

### File: `server/src/http/routes/discovery-routes.ts`

Replace lines 151-189 (entire `router.get("/sessions/:sessionId/commands", ...)`) so that:
- When `sessionManager` is absent or the session is not active, return the SAME 3-tier fallback the active path uses (session.cachedCommands → global cache → static fallback), with `source` set to whichever tier fires.
- Preserve all existing behavior for active sessions (SDK query path).

Concretely:
```ts
router.get("/sessions/:sessionId/commands", async (req, res) => {
  const sessionManager = state?.sessionManager;
  const session = sessionManager?.getStatus(req.params.sessionId);

  // Tier 1: Live SDK query (active sessions only)
  if (session?.activeQuery?.supportedCommands) {
    try {
      const commands = await session.activeQuery.supportedCommands();
      const typed = commands as Array<{ name: string; description: string; argumentHint?: string }>;
      session.cachedCommands = typed;
      commandCache.update(typed);
      return res.json({ commands, source: "sdk" });
    } catch {
      // fall through to next tier
    }
  }

  // Tier 2: Per-session cache (from previous activeQuery)
  if (session?.cachedCommands) {
    return res.json({ commands: session.cachedCommands, source: "cached" });
  }

  // Tier 3: Global cache (from any previous session's SDK query)
  const globalCached = commandCache.get();
  if (globalCached) {
    return res.json({ commands: globalCached, source: "global-cache" });
  }

  // Tier 4: Static fallback — always returns 200, never 404
  return res.json({ commands: FALLBACK_COMMANDS, source: "fallback" });
});
```

Key change: the `if (!session) return res.status(404)` short-circuit is gone. Historical sessions fall through to global-cache or fallback — both 200.

### Tests

The existing route tests for this endpoint are in `server/src/__tests__/` (find them by grepping for `sessions.*commands`). Add regression test:

- **T-CMD-404-1** `historical session returns 200 with fallback commands, not 404`:
  Mock `sessionManager.getStatus` to return `null` (historical session). Mock `commandCache.get` to return null (no global cache). Hit the endpoint. Assert status 200, `source === "fallback"`, `commands.length > 0`.

- **T-CMD-404-2** `historical session with global cache returns global-cache tier`:
  Mock `sessionManager.getStatus` to return null. Mock `commandCache.get` to return an array of commands. Hit the endpoint. Assert status 200, `source === "global-cache"`.

- **T-CMD-404-3** `active session still uses SDK path` (preserve happy path):
  Mock `sessionManager.getStatus` to return a session with `activeQuery.supportedCommands`. Hit the endpoint. Assert status 200, `source === "sdk"`.

If existing tests already cover the 404 case, UPDATE them to expect 200 + fallback. Do NOT silently delete them.

## Client side — no changes needed

`dashboard/src/hooks/useDiscovery.ts` currently catches the 404 and re-fetches `/api/commands`. After the server fix, the first fetch returns 200 and the re-fetch doesn't trigger. The fallback logic stays as defensive code (handles older server versions gracefully). Zero client changes required.

## Verification

```bash
cd server && pnpm test --run
cd server && npx tsc --noEmit
```

- 491 existing pass + 3 new = 494.
- tsc clean.

Manual check (optional): reload a historical session in the dashboard, open Network panel, confirm NO 4xx on `/api/sessions/{id}/commands`.

## Scope

- Only `server/src/http/routes/discovery-routes.ts` + its test file.
- Zero client changes.

## Out of Scope

- The second `commands` request some setups may fire. If only one 404 is visible per reload after the server fix, this is resolved. StrictMode double-invocation is a React dev-only artifact, not a server concern.
