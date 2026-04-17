# Brainstorm: subagents invisible when session crosses project directories

**Date:** 2026-04-17
**Input type:** Observation
**Input (verbatim):** "why these 2 agent don't show up in the graph, session here b5d4dcdd-31b5-439f-9f20-11e13b24c264"

## Ground truth

Session `b5d4dcdd-31b5-439f-9f20-11e13b24c264` has subagents **split across two project directories**:

| Project dir | Main JSONL | Subagents |
|---|---|---|
| `-Users-soh-working-aitomatic-Honeywell-Forge-Cognition/` | 6696 lines (16 Task dispatches) | 1 file |
| `-Users-soh-working-aitomatic-Honeywell-Forge-Cognition--claude-worktrees-perf-tier2-tool-timing/` | 1 line (empty, just a pr-link event) | 15 files |

1 + 15 = 16 subagents total, matching 16 Task dispatches in Project A's main JSONL. The user sees a partial graph because the server only reads subagents from ONE projectHash directory, never both.

## Why it happens

Claude Code writes subagent files under `{projectHash}/{sessionId}/subagents/agent-*.jsonl`. The `projectHash` is derived from the `cwd` at the time the subagent runs, not a session-stable identifier. When a user's `cwd` changes mid-session (e.g., working in both the main repo and a `.claude/worktrees/*` worktree), subsequent subagents land in a different project directory. Same sessionId, different projectHash.

## Why the dashboard only shows some agents

`server/src/parser/session-discovery.ts:193-209`:
```ts
const subagentDir = join(
  getClaudeProjectsDir(),
  sessionInfo.projectHash,    // ← ONE projectHash, not all
  sessionInfo.id,
  "subagents"
);
```

Reads subagents from exactly one directory. Whichever project the user clicked in the sidebar determines which subagent set is visible. The others are silently invisible — no error, no warning.

Compounded by PR #28/#30's dispatch-based membership filter: if the user clicks the project with the (nearly-empty) main JSONL, `computeDispatchedAgentIds` finds zero Task dispatches and filters out all subagents → graph shows only `main`.

## Assumptions challenged

| Assumption | Status | Evidence |
|---|---|---|
| A session's subagents all live in one directory | FALSE | This session: 1+15 split across 2 dirs |
| `sessionInfo.projectHash` uniquely identifies subagent location | FALSE | Changes with cwd during session |
| Session ID is unique to one project | FALSE | Same sessionId exists as `.jsonl` in two project dirs |
| Missing agents are a dispatch-filter issue | FALSE (for this case) | Server never reads the other dir's subagents regardless of filter |

## Fundamentals

1. Claude Code writes `{projectHash}/{sessionId}/subagents/` where projectHash = cwd-hash at subagent runtime, NOT a session-stable identifier.
2. A session's cwd is not immutable across events.
3. Dashboard assumes subagents live in ONE directory matching `sessionInfo.projectHash`. This assumption breaks whenever a session crosses project boundaries.
4. The server already walks every projectHash during `discoverSessions` — the index exists, just isn't reused.

## Solution direction

### Server: scan all project dirs for the session's subagents

In `loadFullSession`:
1. Instead of reading only `{sessionInfo.projectHash}/{sessionInfo.id}/subagents/`, iterate every project directory under `getClaudeProjectsDir()` and check for `{dir}/{sessionInfo.id}/subagents/`.
2. Merge all hits into `subagentEvents` and `subagentMeta`. Subagent agentIds are unique hex strings — no collision risk.
3. Same for main JSONL: if multiple `{dir}/{sessionId}.jsonl` exist for the same sessionId, pick the one with the most events (or merge).

### Simpler alternative: build a session-to-projects index at startup

`discoverSessions` already walks every projectHash. Augment it to build a `Map<sessionId, Set<projectHash>>`. Then `loadFullSession` queries that index: "for this sessionId, here are all the projectHash directories that contain its data" → merge them all.

This is the cleaner architectural fix. Avoids walking every project dir on every session load.

### Main JSONL handling

Project B's main JSONL has 1 line (empty, only a `pr-link` event). Project A has 6696 lines (the real content). The dashboard should prefer the "real" one. Either:
- Merge both (dedupe by event UUID)
- Pick the one with the most events
- Treat `pr-link`-only files as "stub" and skip them

Merging is safest — dedupe by `uuid` is already a common pattern in the codebase.

## Scope

- Server only. `server/src/parser/session-discovery.ts`.
- Test fixture: session with subagents split across two project dirs → all should load.
- Test: session with two `{projectHash}/{sessionId}.jsonl` main files → the "real" one wins (or both merge with UUID dedupe).

## Performance

Minimal. The project directory scan already happens once for `discoverSessions`. Building the `sessionId → Set<projectHash>` index is O(project_count × sessions_per_project) — same order as the existing scan, done once per discovery cycle.

## What this is NOT

- Not a dispatch-filter bug (PR #28/#30 behavior is correct when the input data is complete)
- Not a repo-name bug (PR #32 handles that)
- Not a cwd-extraction bug (PR #32 handles that)

This is a **new data-layout bug** surfaced by how Claude Code splits session data across project directories when cwd changes mid-session.

## Next Steps

Brainstorm saved to `docs/brainstorms/2026-04-17-cross-project-session-subagents.md`.

Your choice:

- `/mas:bug-fix --auto fix cross-project session subagents per docs/brainstorms/2026-04-17-cross-project-session-subagents.md` — ships the merge-across-projectHashes fix. ~30-50 lines server + tests.
- `/mas:dev-loop unify session data layout per docs/brainstorms/2026-04-17-cross-project-session-subagents.md` — bigger refactor: build `sessionId → Set<projectHash>` index in `discoverSessions` and use it everywhere. More robust for future similar bugs.

Recommend bug-fix first (fast path, closes user-visible symptom). Dev-loop afterward if you want the index as the permanent architecture.
