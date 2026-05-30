# Research: New Claude Code CLI Features for the Control Surface

**Date:** 2026-05-29
**Scope:** New Claude Code CLI features / slash commands / capabilities (2026) that the
claude-devtools dashboard's live-session control surface (`PromptInput.tsx` composer +
`session-manager.ts`) could expose.
**Method:** WebSearch (WebFetch blocked by a context-mode hook in this environment) +
local source audit. Every NEW opportunity below was cross-checked against the dashboard's
existing implementation so we do not re-propose anything already built.

---

## What the dashboard ALREADY has (audited — do NOT re-propose)

`dashboard/src/lib/slashCommandHandler.ts` + `dashboard/src/components/conversation/PromptInput.tsx`:

- Slash commands: `/compact`, `/clear`, `/rewind`, `/copy`, `/cost`, `/diff`, `/mcp`,
  `/context`, `/permissions`, `/usage`, `/fast`, `/effort` (low/medium/high/xhigh/max),
  `/plan`, `/rename`, `/bug`, `/fork`, `/tasks`, `/analytics`, `/export`, `/shortcuts`,
  `/doctor`, `/stats`, `/permission-history`, `/settings`, `/hooks`, `/memory`, `/init`,
  `/model` (opus/sonnet/haiku), `/resume`, `/review`, `/agents`, `/add-dir`, `/login`,
  `/logout`, `/output-style`, `/help`, `/exit`.
- Composer features: `!bash` execution, `@file` autocomplete, image paste, ghost-text
  suggestions, command history, SDK slash-command discovery merge.
- Server plumbing that exists but is **partially unexposed** in the composer:
  - `session-manager.ts:100` permission modes: `default | acceptEdits | bypassPermissions | plan | auto | dontAsk`
    — but the UI's `/plan` only toggles `plan`↔`default`. The other four modes have **no composer entry point**.
  - `session-manager.ts:777` `backgroundTask()` (wraps SDK `query.backgroundTasks(toolUseId)`,
    "NEW-5") — server route `POST /sessions/:id/background-task` exists, but there is **no
    `/bg` slash command** wired to it.
  - `session-manager.ts:482` `setModel()` exists but does not combine with effort (no
    model+effort picker like the CLI now has).

This existing footprint is large; the NEW opportunities below are deliberately limited to
2026 capabilities that the composer/session-manager genuinely does not yet surface.

---

## NEW Claude Code features (2026) — opportunities for the dashboard

### 1. `/goal` — autonomous outcome-based loop (Claude Code 2.1, May 2026)
A primitive for "many turns of autonomous execution until a verifiable completion condition."
You declare an objective (e.g. "tests pass and CI is green") and Claude iterates turn after
turn until the condition is met or constraints are reached. It is an *assisted loop* that can
stop without success (ambiguous condition, insufficient tools, diminishing returns).
- **Why it matters here:** This is the single highest-value new control surface for an
  observability dashboard. A goal run produces a long, multi-turn trace that is exactly what
  claude-devtools is built to render — and the dashboard could show goal *progress*, the
  completion condition, and when/why the loop stopped.

### 2. `/bg` (alias `/background`) + Agent View — background sessions (research preview, Claude Code v2.1.139+, May 11 2026)
`/bg` (or `←←` / `--bg` flag) moves the current conversation into a background session managed
by a per-user supervisor process. `claude agents` opens **Agent View**: a CLI dashboard listing
every session (running / waiting / done) in one table, with sessions that "need you" pinned to
the top. `/bg <prompt>` queues one more instruction before backgrounding.
- **Why it matters here:** Agent View is literally a terminal version of what this dashboard
  does. The dashboard can be the *superior* Agent View — a richer web multi-session monitor —
  AND expose `/bg` to push the current live session into background.
- **Note:** distinct from the existing per-*tool* `backgroundTask()` (NEW-5), which backgrounds
  a single running tool. `/bg` backgrounds the whole *session*.

### 3. Richer rewind / checkpoint modes (2026)
The rewind menu (Esc Esc or `/rewind`) now offers four distinct actions, plus context
summarization:
- **Restore code and conversation** — revert files + messages to checkpoint.
- **Restore conversation** — rewind messages only, keep current code.
- **Restore code** — revert files only, keep full conversation.
- **Summarize up to here** — compress conversation *before* this point into a summary, keep
  later messages.
- **Summarize from here** — compress from this point forward to free context window space.
- **Why it matters here:** The dashboard currently forwards `/rewind` as a raw message (it falls
  through to the SDK). It does not expose the *mode selection*. Checkpoints persist across
  sessions and auto-clean after 30 days, and every user prompt creates one — perfect for a
  visual checkpoint timeline with per-checkpoint restore-mode buttons.

### 4. `/sandbox` — OS-level sandboxed Bash (2026)
`/sandbox` opens a menu to enable OS-level isolation (bubblewrap on Linux, equivalent on macOS).
Settings (`settings.json`): `sandbox.enabled`, `failIfUnavailable`, `autoAllowBashIfSandboxed`,
plus `filesystem.allowWrite` / `denyRead` / `denyWrite` and `network.allowedDomains` /
`allowLocalBinding`. Sandboxed bash runs without prompting; only out-of-sandbox network access
falls back to the permission flow. A 2026 fix added a visible startup warning when
`sandbox.enabled: true` but dependencies are missing (previously silent).
- **Why it matters here:** The dashboard's permission UI is its differentiator. A sandbox
  status indicator + toggle would tell the user *why* a bash command did not prompt (it ran
  sandboxed) and let them flip sandbox mode without leaving the web UI.

### 5. `/loop <interval> <prompt|command>` — recurring in-session task
Runs a prompt or another slash command on a repeating interval within the session
(e.g. `/loop 2m /security-review`). Useful for polling deploy status, watching tests, or
health checks.
- **Why it matters here:** The dashboard could expose `/loop` and then *visualize* the
  recurring runs as a timeline, surfacing each iteration's result — turning a blind polling
  loop into an observable one.

### 6. `/security-review` — pre-PR vulnerability scan
A built-in command that reviews pending changes for security issues; recommended before every
PR. The model can now discover and invoke built-in commands like `/init`, `/review`, and
`/security-review` via the Skill tool.
- **Why it matters here:** The composer already has `/review` and `/diff`; `/security-review`
  is a natural sibling that fits the dashboard's "quality" dimension in the efficiency layer.

### 7. `/code-review` (renamed from `/simplify`) with effort + `--fix`
`/simplify` was renamed to `/code-review`, now takes an optional effort level
(`/code-review high`), and `/code-review --fix` applies the review findings to the working tree
after reviewing.
- **Why it matters here:** Pairs with the existing `/review` command and the dashboard's diff
  viewer. The `--fix` flag is a concrete, demoable control to add to a "review actions" row.

### 8. Combined model + effort picker (2026 `/model` upgrade)
`/model` now shows models AND effort settings with arrow-key navigation; the chosen config is
saved as the **default for new sessions**, and pressing `s` switches only the **current
session**. Opus 4.6 / Sonnet 4.6 support a 1M-token context window. Effort levels drive
**adaptive thinking** (the model decides whether/how much to think per step);
`max` (alias `auto`) removes token constraints on Opus 4.6 / Sonnet 4.6 / Mythos Preview.
`CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` reverts to a fixed `MAX_THINKING_TOKENS` budget.
- **Why it matters here:** The dashboard's `/model` only switches the model (opus/sonnet/haiku)
  and its `/effort` does not accept `auto`. A unified **model+effort picker panel** with a
  per-session vs. default toggle, plus an adaptive-thinking on/off switch, mirrors the new CLI
  UX and exposes the 1M-context models.

### 9. Full permission-mode cycle in the composer
The CLI cycles permission modes with `Shift+Tab`: `default → acceptEdits → plan →
bypassPermissions` (and the dashboard server already supports `auto` and `dontAsk` too —
`session-manager.ts:100`). The composer only toggles `plan`.
- **Why it matters here:** This is *zero new server work* — the modes already exist in
  `setPermissionMode`. Surfacing `acceptEdits` (auto-accept file edits), `bypassPermissions`,
  `auto`, and `dontAsk` as a mode cycle/segmented control would complete the permission UX,
  which is the dashboard's core differentiator.

### 10. `/reload-skills` — re-scan skill directories without restarting
Re-scans skill directories so newly added skills/commands appear without restarting the
session. Skills and slash commands can now set `disallowed-tools` in frontmatter to remove
tools from the model while active.
- **Why it matters here:** The dashboard discovers slash commands via the SDK (`useDiscovery`).
  A `/reload-skills` command + a refresh button on the command dropdown keeps discovery current
  after the user adds a skill mid-session.

### 11. `/branch` (alias `/fork`) — conversation branching
`/branch [name]` creates an independent copy of the conversation from the current point;
`/fork` is the documented alias (`claude --resume <id> --fork-session` from the CLI). Both
branches share the same working directory (filesystem is NOT isolated — that needs git
worktrees).
- **Why it matters here:** The dashboard already has `/fork` (server route `POST /sessions/:id/fork`),
  so the *capability* exists — but `/branch` (the new primary name) is missing, optional branch
  *naming* is not supported, and there is no UI to *visualize* the branch tree. A branch-graph
  view of forked conversations is a strong observability feature.

### 12. `/feedback` with session attachment (v2.1.141+)
`/feedback` (alias of `/bug`) can now attach recent sessions (last 24h or 7d) so reports
spanning multiple sessions include context. `/feedback` also now explains *why* it is
unavailable instead of vanishing from the menu.
- **Why it matters here:** The dashboard's `/bug` just opens the GitHub issues page. A
  `/feedback` that bundles the current session transcript (the dashboard already has full
  session events for `/export`) would be a much richer bug report.

### 13. Plugin & marketplace discovery panel (`/plugin`)
`/plugin marketplace add <repo>` → `/plugin install <plugin>@<marketplace>`. The Discover/Browse
panes preview commands, agents, skills, hooks, and MCP/LSP servers *before* installation.
Plugins bundle skills, agents, hooks, MCP servers, LSP servers, and monitors.
`claude-plugins-official` is auto-available.
- **Why it matters here:** The dashboard has `/mcp`, `/agents`, `/hooks`, `/memory` panels but
  no plugin/marketplace surface. A read-only "installed plugins + components" panel (and
  optionally a Discover browser) would round out the management surface.

---

## Recommended priority for the dashboard

| Priority | Feature | Rationale |
|----------|---------|-----------|
| P0 | #9 full permission-mode cycle | Zero server work — modes already in `session-manager.ts:100`; core differentiator. |
| P0 | #2 `/bg` + multi-session monitor | Server `backgroundTask()` exists; Agent View is this product's exact niche. |
| P0 | #3 richer rewind/checkpoint modes | `/rewind` already forwards; add the 4 restore modes + summarize as a visual timeline. |
| P1 | #8 model+effort picker | Mirrors new CLI UX; `/effort` needs `auto`, `/model` needs effort+per-session/default. |
| P1 | #1 `/goal` autonomous loop | Highest-value new trace to observe; long multi-turn runs are this dashboard's strength. |
| P1 | #4 `/sandbox` status + toggle | Explains why bash didn't prompt; complements permission UI. |
| P2 | #6 `/security-review`, #7 `/code-review --fix` | Quality-dimension siblings to existing `/review`. |
| P2 | #5 `/loop`, #10 `/reload-skills`, #11 `/branch`, #12 `/feedback`, #13 `/plugin` | Incremental polish over existing panels. |

---

## Sources

- https://code.claude.com/docs/en/changelog
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/checkpointing
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/plugins-reference
- https://claude.com/blog/agent-view-in-claude-code
- https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously
- https://www.anthropic.com/engineering/claude-code-sandboxing
- https://explainx.ai/blog/anthropic-claude-code-agent-view-goal-command
- https://www.mindstudio.ai/blog/claude-code-bg-command-background-agent-sessions
- https://wmedia.es/en/tips/claude-code-fork-session-branch-conversations
- https://claudefa.st/blog/guide/changelog
- Local audit: `dashboard/src/lib/slashCommandHandler.ts`, `dashboard/src/components/conversation/PromptInput.tsx`, `server/src/session/session-manager.ts`, `server/src/http/routes/session-routes.ts`
