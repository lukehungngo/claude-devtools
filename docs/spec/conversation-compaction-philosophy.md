# Claude Code Conversation Compaction Philosophy
## Claude Code's actual compaction philosophy:

1. Tool results (file reads, searches, bash outputs) are displayed as collapsed groups with summary lines. While active, the current file or search pattern being processed is shown beneath the summary.

2. Read/search progress indicators show "Reading…" while in progress and "Read" when complete. Two states: active verb → past tense.

3. Collapsed tool summary now shows "Listed N directories" for ls/tree commands. Summaries are semantic, not just "Bash completed".

4. The output shows a few visible lines then collapses with "+N lines (ctrl+o to expand)". For example: `Bash(sk work-list) ⎿ Work Items (3 total) … +11 lines`.

5. MCP read/search tool calls now collapse into a single "Queried {server}" line (expand with Ctrl+O).

6. Search patterns in collapsed tool results are now displayed in quotes for clarity.

7. The mobile/remote-control interface already collapses tool outputs into single-line summaries that expand on click — bringing similar functionality to the terminal would significantly improve readability. The mobile UI is *ahead* of the terminal here.

8. Different message types (assistant text, tool calls, tool output, errors) could use distinct background colors or border styling to make them visually distinguishable. The current colored dots on the left margin are subtle.

## The core philosophy is: collapsed-by-default, semantic summary line, expand-on-demand, progress states (verb-ing → past tense), group similar ops.

Here's the redesign grounded in **real Claude Code UX patterns**, not guesswork. The key principles directly from their codebase and changelog:

**1. Collapsed-by-default with semantic summary**
Claude Code shows `Read 6 files` not a list of 6 reads. `Grep "pattern"` not the raw output. Only the summary line is visible — expand on demand.

**2. Two-state progress: verb-ing → past tense**
`Reading…` while active, `Read` when done. Simple, scannable.

**3. Consecutive same-type ops group automatically**
6 consecutive Reads become one `Read 6 files` group with a count badge. This is the single biggest compaction win.

**4. "+N lines (click to expand)"**
Identical to Claude Code's `+11 lines (ctrl+o to expand)`. The task grid uses this pattern.

**5. Colored left border = message type**
Blue = read, purple = search, yellow = bash, red = error. Same as CC's colored dots on the left margin, but as a visible border per the open feature request.

**6. Agent dispatch = subagent card**
Claude Code's Task/Explore tools spawn subagents that report back. The agent block mirrors this: name + summary + stats + cost, collapsed by default.

**7. Verdict first, details last**
The conclusion banner is always visible at top. Everything else is progressive disclosure below it.