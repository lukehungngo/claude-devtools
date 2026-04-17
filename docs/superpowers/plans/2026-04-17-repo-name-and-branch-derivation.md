# Plan: Fix repo names and gitBranch derivation

**Date:** 2026-04-17
**Branch:** `fix/repo-name-and-branch-derivation`
**Brainstorm:** `docs/brainstorms/2026-04-17-repo-name-and-branch-derivation.md`
**Scope:** Server-only. Fix two bugs in `session-discovery.ts`.

## Bugs

### Bug 1 — Hyphenated folder names lose segments
`conny-com-app` shows as `"app"`, `cppay-api` shows as `"api"`. Same for any repo whose folder name contains hyphens.

Root cause: `session-discovery.ts:107-110`:
```ts
function decodeProjectHash(projectHash: string): string {
  if (!projectHash.startsWith("-")) return projectHash;
  return "/" + projectHash.slice(1).replace(/-/g, "/");
}
```
Replaces every `-` with `/`. Lossy for hyphenated folder names. Triggered when a session has no populated `session.cwd` — pass 2 of `discoverRepoGroups` falls into `decodeProjectHash` → lossy → wrong basename.

### Bug 2 — Stuck gitBranch
`Honeywell-Forge-Cognition` shows `feat/demo-catch-up` permanently, even after the branch moved on.

Root cause: `session-discovery.ts:156`:
```ts
const gitBranch = repoSessions.find((s) => s.gitBranch)?.gitBranch;
```
`find()` picks the first session that has a `gitBranch` recorded. Sessions are sorted newest-first; if the newest session's metadata extraction didn't capture `gitBranch` (empty/null), `find()` skips to older sessions. An older branch becomes sticky.

## Fix

### File: `server/src/parser/session-discovery.ts`

1. **Ensure `session.cwd` is always populated from JSONL content.** Find where `session.cwd` is set (likely in `extractSessionMeta` or wherever `SessionInfo` is populated from the file). Read from event content, not just headers — every event has `cwd`. First-found or most-recent, doesn't matter as long as it's non-null.

   If the metadata extraction currently reads head/tail byte ranges, make it scan events until it finds the first `cwd`. Bounded cost (first N events), not a full file read.

2. **Same for `session.gitBranch`.** Scan events for the most-recent non-null `gitBranch`. If extraction currently reads only the head, make it read from the tail (most recent event) instead.

3. **Delete `decodeProjectHash`** and the fallback that uses it at line 146-148:
   ```ts
   // BEFORE
   } else {
     const decoded = decodeProjectHash(session.projectHash);
     if (!repoMap.has(decoded)) repoMap.set(decoded, []);
     repoMap.get(decoded)!.push(session);
   }
   ```
   Once every session has a reliable cwd (step 1), this branch becomes unreachable. Delete it. If truly unreachable, log a warning and group by `session.projectHash` as a last-ditch unique key (should never fire in practice).

4. **Change gitBranch derivation:**
   ```ts
   // BEFORE
   const gitBranch = repoSessions.find((s) => s.gitBranch)?.gitBranch;

   // AFTER
   const newestSession = repoSessions[0]; // already sorted newest-first
   const gitBranch = newestSession?.gitBranch ?? repoSessions.find((s) => s.gitBranch)?.gitBranch;
   ```
   Newest session's branch wins. Older `find()` stays as last-ditch fallback only if the newest has no branch (shouldn't happen after step 2, but defensive).

### Tests

Add to `server/src/parser/session-discovery.test.ts` (or equivalent):

- **T-REPO-1** `hyphenated folder name roundtrips correctly`:
  Fixture: session for `/Users/soh/working/cpcx0/conny-com-app` (projectHash = `-Users-soh-working-cpcx0-conny-com-app`). Call `discoverRepoGroups`. Assert `repo.repoName === "conny-com-app"`.

- **T-REPO-2** `gitBranch reflects most recent session`:
  Fixture: same repo, two sessions. Newer session has `gitBranch: "master"`, older has `gitBranch: "feat/old-branch"`. Assert `repo.gitBranch === "master"`.

- **T-REPO-3** `session without populated cwd falls back to scanning events` (if step 1 requires a fallback scan):
  Fixture: session whose header metadata has empty cwd but event bodies have `cwd: "/Users/soh/foo/my-repo"`. Assert `session.cwd` resolves to `/Users/soh/foo/my-repo` and `repo.repoName === "my-repo"`.

- **T-REPO-4** `stale branch bug regression`:
  Fixture: session sequence where first session had `feat/demo-catch-up`, later sessions have `master`. Assert `repo.gitBranch === "master"`.

## Scope

- `server/src/parser/session-discovery.ts` — ~15-20 lines changed (delete decode, change derivation)
- Wherever `session.cwd` and `session.gitBranch` are populated (likely same file or sibling) — ~10 lines for JSONL scan
- 1 test file

## Out of Scope

- Duplicate-basename disambiguation UI (e.g., `cpcx0/app` vs `aitomatic/app`) — deferred until an actual collision is observed
- Client-side changes — this is server-only
- The slug/hash reload race — separate PR (`fix/slug-hash-race-on-reload`)

## Verification

```bash
cd server && pnpm test --run
cd server && npx tsc --noEmit
```

- All 478 existing tests pass + new ones.
- tsc: clean.
