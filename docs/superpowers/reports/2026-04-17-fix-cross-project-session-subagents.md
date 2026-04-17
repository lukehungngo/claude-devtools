# Bug Fix Report: fix/cross-project-session-subagents

**Plan:** docs/superpowers/plans/2026-04-17-cross-project-session-subagents.md
**Branch:** fix/cross-project-session-subagents

## Bug
Agent Graph for session b5d4dcdd-31b5-439f-9f20-11e13b24c264 missing subagents. Claude Code had split the session's 17 subagents across 2 project directories (main repo + worktree), but the server only read from one.

## Root cause
`server/src/parser/session-discovery.ts:193-209` read subagents from exactly one `{projectHash}/{sessionId}/subagents/` directory.

## Fix
Rewrote `loadFullSession` to scan every child of `~/.claude/projects/`. For each project dir: (a) upgrades main JSONL path to the LARGER sibling when one exists (handles stub vs real content); (b) merges all subagents into the combined maps. Filename-based agentType inference moved to run once over the merged map.

## Review verdict
APPROVED WITH CHANGES. 0 P0/P1. 2 P2 deferred (sidebar subagentCount, metricsCache key) — intentionally out of plan scope. 3 P3 cleanups.

## Verification
Server 496/496 pass, tsc clean. Empirical: session b5d4dcdd-... now loads 17 subagents + 8132 mainEvents from either entry projectHash (pre-fix: 1 or 16).

## Follow-ups (not this PR)
- **P2-1** `SessionInfo.subagentCount` in SessionCache still per-projectHash → sidebar count may still show incomplete number.
- **P2-2** `metricsCache` key in session-routes.ts only counts subagents in one projectHash → cache staleness risk if subagents land in a different projectHash between requests.

Both are separate PRs; same file family but different scope. The user-visible Agent Graph bug is fixed.

## Verdict
FIXED
