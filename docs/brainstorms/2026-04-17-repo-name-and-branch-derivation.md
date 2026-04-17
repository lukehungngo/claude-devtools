# Brainstorm: sidebar shows wrong repo names and stale branches

**Date:** 2026-04-17
**Input type:** Problem
**Input (verbatim):** "this is a big fucking huge problem, u know why, because the slug or hash or whatever u call the repo name is not correct as i want, the conny-com-app now named app, the branch of Honeywell-Forge-Cognition is always at feat/demo-catch-up. [image] do u know how bad is it. The most simple thing on earth is take the folder name, if u worry about duplication then take something unique via JSONL or anthropic sdk suggestion"

## Two bugs, one root cause pattern

### Bug 1 — repo name truncates at hyphens

`server/src/parser/session-discovery.ts:107-110`:
```ts
function decodeProjectHash(projectHash: string): string {
  if (!projectHash.startsWith("-")) return projectHash;
  return "/" + projectHash.slice(1).replace(/-/g, "/");
}
```

Claude Code encodes a path by replacing `/` with `-` in the directory name under `~/.claude/projects/`. Reversing that is only possible when the original path contains no `-`. For `conny-com-app`:
- Real path: `/Users/soh/working/cpcx0/conny-com-app`
- Encoded dir: `-Users-soh-working-cpcx0-conny-com-app`
- Decoded: `/Users/soh/working/cpcx0/conny/com/app` ❌ (hyphens became slashes)
- `basename`: `"app"` ❌

Same for `cppay-api` (shows as `"api"`).

The decode only runs when pass 2 of `discoverRepoGroups` fails to find a canonical cwd for a session that has no `session.cwd` populated. For these repos, all sessions apparently have empty cwd in metadata, so the lossy decode kicks in for every one.

### Bug 2 — stuck gitBranch

`session-discovery.ts:156`:
```ts
const gitBranch = repoSessions.find((s) => s.gitBranch)?.gitBranch;
```

`find()` returns the first session in the array that has any `gitBranch` recorded. Sessions are sorted newest-first, so when the newest session has a populated `gitBranch`, this works. But when the newest session's metadata-extracted `gitBranch` is empty/null (which happens depending on what's in the file's head/tail bytes), `find()` falls through to whichever older session happened to record one. Once that older branch gets recorded, it's "sticky" — newer sessions that don't have extracted gitBranch can't override it.

Result: `Honeywell-Forge-Cognition` is stuck on `feat/demo-catch-up` even after the current branch moved on (`master`, etc.).

## Assumptions challenged

| Assumption | Status | Evidence |
|---|---|---|
| `basename(cwd)` is the user's repo name | TRUE — when `cwd` is real | Correct as an idea; wrong in practice because `cwd` is fabricated from a lossy decode |
| Every session has a real `cwd` in metadata | FALSE | Some sessions' metadata extraction misses the field |
| JSONL files lack `cwd`/`gitBranch` data | **FALSE** | Every event in a Claude Code JSONL carries `cwd` and `gitBranch`. Data is there; the extraction missed it. |
| Decoding the projectHash is a reasonable fallback | FALSE | Lossy for hyphenated folder names, which are common (kebab-case repos) |
| `find()` picks a good branch | FALSE | Picks the oldest one that happened to record a branch, not the current one |

## Fundamentals

1. Claude Code writes `cwd` and `gitBranch` on **every event** in the session JSONL. Data is always present at the content level; only the metadata extraction misses it.
2. The user's repo name is the basename of the absolute cwd — that's all.
3. The projectHash (folder name in `~/.claude/projects/`) is a LOSSY encoding (`/` → `-`) and can't be reliably decoded when the original contains `-`.
4. The current branch is the branch recorded by the **most recent event**, not the first found.
5. Duplicate basenames (two repos both ending in `app`) need disambiguation by parent directory, not by lossy decoding.

## Solution direction (matches user's proposal)

### 1. Populate `session.cwd` from JSONL content, always
In `extractSessionMeta` (or equivalent), after reading the file, find the first event that has `cwd` set and use that value. Every event has it; the metadata extraction should not rely on a specific byte range. If performance matters, scan until the first non-null cwd then stop.

### 2. Delete `decodeProjectHash` and the pass-2 decode fallback
Once every session has a reliable `cwd` from step 1, the "truly unknown path" branch in `discoverRepoGroups` becomes unreachable. Delete `decodeProjectHash` entirely. The projectHash stays a unique key but is never shown to the user.

### 3. Use `basename(cwd)` as the display name
After step 1-2, `conny-com-app` and `cppay-api` display correctly because `cwd` comes from the actual JSONL event, not from decoding.

### 4. Fix `gitBranch` to track the most recent event
Change:
```ts
const gitBranch = repoSessions.find((s) => s.gitBranch)?.gitBranch;
```
to:
```ts
const newestSession = repoSessions[0]; // already sorted newest-first
const gitBranch = newestSession?.gitBranch || repoSessions.find(s => s.gitBranch)?.gitBranch;
```
And populate `session.gitBranch` from the NEWEST event (last line of JSONL) in `extractSessionMeta`, not the first.

### 5. Disambiguation for duplicate basenames
If two repos both have `basename === "app"`, display `parent/app` (e.g., `cpcx0/app` vs `aitomatic/app`). Internal key stays the full cwd; only the display text is disambiguated. No change needed unless the user hits an actual collision.

## Scope

Small. Affects `server/src/parser/session-discovery.ts` and whatever produces `session.cwd`/`session.gitBranch` (likely the JSONL cache or reader). Three-ish tests:
1. Session for `conny-com-app` → sidebar shows `conny-com-app`, not `app`.
2. Session for `cppay-api` → shows `cppay-api`, not `api`.
3. Repo whose newest session is on `master` and older sessions were on `feat/x` → sidebar shows `master`.

Plus a regression fixture: a session where `session.cwd` is deliberately missing from the header but present in event bodies → should still resolve correctly.

## Not in scope

- Renaming repos or exposing user-editable display names. Out of scope. Use git folder basename.
- SDK-side calls. Every answer is already in the JSONL.
- The slug/hash race on page reload (separate brainstorm: `docs/brainstorms/2026-04-17-slug-hash-race-on-reload.md`). Different bug, different file, fix independently.

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-repo-name-and-branch-derivation.md`.

Your choice:

- `/mas:bug-fix --auto fix repo name and gitBranch derivation per docs/brainstorms/2026-04-17-repo-name-and-branch-derivation.md` — ships both fixes in one PR. Touches the server's session metadata extraction + the repo-grouping pass. ~30 lines production + tests.
- Bundle with the slug/hash reload fix into one `/mas:dev-loop` if you want them together. I'd recommend separate PRs — they're independent and easier to review isolated.
