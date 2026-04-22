# Brainstorm: Why no agents and commands are found in Insights, only skills

**Date:** 2026-04-19
**Input type:** Problem
**Input:** why no agents and commands is found, only skills in insight?

## Assumptions

| Assumption | Status | Evidence |
|-----------|--------|----------|
| JSONL stores slash commands as `/command` text in user messages | QUESTIONED | User messages in JSONL are the EXPANDED skill content, not the raw `/command` text |
| Agent dispatch tool name in JSONL is `"Task"` | QUESTIONED | `grep '"name":"Task"'` returns 0 files; `"Agent"` appears in 27/27 sessions with agent dispatches |
| Skills are detected correctly | CONFIRMED | `"name":"Skill"` matches the actual JSONL tool name → Skills DO appear in dashboard |

## Fundamentals

### Bug 1 — Agent detection: wrong tool name (trivial fix)

The parser at `server/src/analyzer/insights-commands-agents-skills.ts:90` checks `toolName === "Task"`.

In every JSONL file examined (27 sessions), agent dispatches are stored as `"name": "Agent"`, never `"Task"`. The `Task` name was from an older Claude Code API version; current CLI uses `"Agent"`.

Skills work because `"name": "Skill"` is correct.
Agents fail because the comparison is wrong.

### Bug 2 — Command detection: structural mismatch with MAS workflow

The parser looks for user text blocks starting with `/` (line 66).

In this Claude Code + MAS plugin workflow, when a user types `/mas:brainstorm`, the CLI **replaces** the raw command with the expanded skill content before writing to JSONL. What gets stored is:

```
"# Brainstorm (MAS)\n\nFirst principles decomposition for: ..."
```

The `/mas:brainstorm` text **does not exist anywhere in the JSONL**. The command section was designed for a workflow where users type raw `/commands` that appear verbatim — that doesn't happen here. The section always shows "No slash commands found" for MAS users.

## Output

Two independent issues with different severities:

### Fix 1 (Agents) — 1-line change, immediate value

In `server/src/analyzer/insights-commands-agents-skills.ts`:
```ts
// Before (line 90)
if (toolName === "Task") {
// After
if (toolName === "Agent") {
```

### Fix 2 (Commands) — Design decision

Options ranked by effort vs value:

| Option | Approach | Notes |
|--------|----------|-------|
| A | **Heading heuristic** — user messages starting with `# X (MAS)\n` are command invocations, extract X as name | Covers MAS workflow naturally, no hardcoded list, graceful degradation |
| B | **Accept limitation** — document that Commands only shows for non-MAS raw-command workflows | Honest, no code change, but section is always empty for this user |
| C | **Repurpose** — count user-initiated skill flows instead of raw `/commands` | Requires redefining what "commands" means |

**Recommended**: Fix 1 immediately. For Fix 2, use Option A (heading heuristic) — detect user messages matching `^# .+ \(MAS\)\n` or `^# .+\n\nFirst principles` and extract the heading as the command name.

## Next Steps

Implement Fix 1 now. Fix 2 can follow as a separate small task.
