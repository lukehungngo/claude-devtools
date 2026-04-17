# Plan: Fix cross-project session subagents

**Date:** 2026-04-17
**Branch:** `fix/cross-project-session-subagents`
**Brainstorm:** `docs/brainstorms/2026-04-17-cross-project-session-subagents.md`
**Scope:** Server only. Narrow fix to make `loadFullSession` find subagents across all project directories for a given sessionId.

## Bug

Session `b5d4dcdd-31b5-439f-9f20-11e13b24c264` has subagents split across two project directories:
- `Honeywell-Forge-Cognition/` → 6696-line main JSONL (16 Task dispatches), 1 subagent file
- `Honeywell-Forge-Cognition--claude-worktrees-perf-tier2-tool-timing/` → 1-line stub main JSONL, 15 subagent files

Dashboard only reads subagents from the one project directory matching `sessionInfo.projectHash`, so 15 of 16 subagents are invisible (depending on which project the user clicked).

## Root Cause

`server/src/parser/session-discovery.ts:193-209`:
```ts
const subagentDir = join(
  getClaudeProjectsDir(),
  sessionInfo.projectHash,
  sessionInfo.id,
  "subagents"
);
```
Reads exactly one projectHash directory. When Claude Code splits a session's subagents across multiple projectHashes (because cwd changed mid-session), only one set is visible.

Additionally, `sessionInfo.path` points to one of the `.jsonl` files — not necessarily the one with actual content. The 1-line "stub" JSONL in the worktree project has nearly no data; the 6696-line one in the main project has the real content.

## Fix

### File: `server/src/parser/session-discovery.ts`

**Change 1 — `loadFullSession`:** scan every project directory for any `{projectHash}/{sessionId}/subagents/` that exists. Merge all hits into `subagentEvents` and `subagentMeta`.

```ts
const claudeProjectsDir = getClaudeProjectsDir();

// Find all project directories that have a subagents/ folder for this session
const projectDirs = readdirSync(claudeProjectsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

for (const projectDir of projectDirs) {
  const subagentDir = join(claudeProjectsDir, projectDir, sessionInfo.id, "subagents");
  if (!existsSync(subagentDir)) continue;
  // ... existing loop over files ...
}
```

Subagent agentIds are unique hex strings — no collision concern when merging from multiple dirs.

**Change 2 (optional but recommended) — main JSONL selection:** if multiple `{projectHash}/{sessionId}.jsonl` files exist, prefer the one with more events. Simple heuristic: compare file sizes. The stub JSONL (with only `pr-link` event) is ~200 bytes; real sessions are KBs to MBs. Alternatively, merge both by reading all and deduplicating by `uuid`.

For this fix, keep it simple: pick the LARGER file when multiple exist. If the main-session path in `sessionInfo.path` isn't the largest one for this sessionId, switch to the larger one before parsing.

**Change 3 — tests**:

Add to `server/src/parser/session-discovery.test.ts`:

- **T-CROSS-1** `loadFullSession merges subagents from all project dirs containing the session`:
  Set up a fake `CLAUDE_PROJECTS_DIR` with:
  - `project-a/{sessionId}.jsonl` (5 lines of real content)
  - `project-a/{sessionId}/subagents/agent-aaa.jsonl` + `.meta.json`
  - `project-b/{sessionId}.jsonl` (1 line stub)
  - `project-b/{sessionId}/subagents/agent-bbb.jsonl` + `.meta.json`
  - `project-b/{sessionId}/subagents/agent-ccc.jsonl` + `.meta.json`
  
  Call `loadFullSession(sessionInfo)` where `sessionInfo.projectHash = "project-a"`. Assert:
  - `subagentEvents.size === 3` (aaa + bbb + ccc all loaded)
  - `subagentMeta.size === 3`
  - Agent IDs are all present in the result.

- **T-CROSS-2** `loadFullSession loads correctly when session exists in only one project dir (no regression)`:
  Fake dir with just `project-a/{sessionId}.jsonl` + `project-a/{sessionId}/subagents/agent-aaa.jsonl`. Assert behavior matches pre-change (1 subagent loaded).

- **T-CROSS-3 (if Change 2 implemented)** `loadFullSession picks the larger main JSONL when session exists in multiple projects`:
  Fake dir with stub `project-b/{sessionId}.jsonl` (1 line) and real `project-a/{sessionId}.jsonl` (many lines). Pass `sessionInfo.path` pointing to the stub. Assert the loaded `mainEvents` matches the real file's contents, not the stub.

Use `CLAUDE_PROJECTS_DIR` env var override if supported, or `vi.mock` for `getClaudeProjectsDir`. Match existing test patterns in this file.

## Scope

- Only `server/src/parser/session-discovery.ts` + its test file.
- Zero client changes.
- No change to `discoverSessions`, `SessionCache`, route handlers, or DAG builder.
- No change to subagent parsing or data shape.

## Out of Scope

- Building a `sessionId → Set<projectHash>` index in `discoverSessions` (the structural option from the brainstorm; defer unless the simple merge is too slow).
- Fixing the root Claude Code behavior that splits subagents across projectHashes — that's upstream.
- Disambiguating repos with identical basenames.

## Verification

```bash
cd server && pnpm test --run
cd server && npx tsc --noEmit
```

- 493 existing pass + 2-3 new = 495-496.
- tsc clean.

**Manual check (optional):** click session `b5d4dcdd-31b5-439f-9f20-11e13b24c264` in either the Honeywell main repo OR the worktree — the Agent Graph should show all 16 subagents regardless of which project was clicked.

## Performance

Scan of `~/.claude/projects/` top-level directory on every `loadFullSession` call: O(project_count) readdir + `existsSync` per project. For a user with ~100 projects, this is ~100 `existsSync` syscalls — negligible.

The existing `SessionCache` invalidates on session file mtime/size; since this fix doesn't change what's cached, the cache behavior is unaffected. The scan only runs on cache miss.

If performance becomes a concern for users with thousands of projects, the deferred "session → Set<projectHash>" index in `discoverSessions` is the followup.
