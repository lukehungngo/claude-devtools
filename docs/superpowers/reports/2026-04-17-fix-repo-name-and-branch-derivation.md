# Bug Fix Report: fix/repo-name-and-branch-derivation

**Plan:** docs/superpowers/plans/2026-04-17-repo-name-and-branch-derivation.md
**Branch:** fix/repo-name-and-branch-derivation

## Bugs
1. Sidebar truncated hyphenated repo names (`conny-com-app` → `"app"`, `cppay-api` → `"api"`).
2. Sidebar stuck on stale branches (`Honeywell-Forge-Cognition` stuck on `feat/demo-catch-up`).

## Root causes
1. `decodeProjectHash` in `session-discovery.ts` replaced every `-` with `/`, lossy for hyphenated folders. Triggered when session.cwd was missing.
2. `find(s => s.gitBranch)` picked first session with ANY branch; with stale head-scan extraction failing to populate gitBranch on newest sessions, older branches became sticky.

## Fix
- **Deleted `decodeProjectHash`** entirely. With reliable cwd extraction the path is unreachable.
- **Rewrote tail scan as bounded backward line-scan** (`scanBackwardLines` in `session-cache.ts`). Walks EOF→BOF in 4 KB chunks with 256 KB cap. Extracts most-recent `gitBranch`, `cwd`, and other fields regardless of event size.
- **Newest-session gitBranch preference** in `groupSessionsIntoRepos` with last-ditch `find()` fallback.
- Extracted pure `groupSessionsIntoRepos(sessions)` for testability.
- Deduped + demoted the no-cwd fallback warn.

## Review cycle
- Cycle 1: BLOCKED (P1-1: 4KB tail too small for 10.4% of real sessions incl. Honeywell).
- Cycle 2: APPROVED — backward scan resolves P1-1. 491/491 pass, tsc clean.

## Verification
Empirical check against Honeywell 8.9 MB JSONL:
- Before: `gitBranch=undefined, cwd=undefined`
- After: both populated correctly from the most recent event.

## Verdict
FIXED
