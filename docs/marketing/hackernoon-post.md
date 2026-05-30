# I spent $24K on Claude Code without seeing where it went. So I built Claude DevTools.

## The bill

I checked my Anthropic console one Sunday morning and saw it: $24,251.32 in lifetime Claude Code spend. Not a typo. Twenty-four thousand dollars.

Most of it was legitimate work — code generation, refactors, debugging, the kind of thing I'd happily pay a junior engineer for. But there was no way to tell where it had actually gone. Which prompt? Which subagent? Which retry loop?

Claude Code, the official CLI, prints a token count at the end of each turn. That's it. No per-turn cost. No subagent trace. No cache hit ratio. When you fan out a `Task()` call to six subagents and they collectively burn $40 over an hour, all you see at the end is a number.

So I built the thing I wanted.

## Claude DevTools

[**Claude DevTools**](https://github.com/lukehungngo/claude-devtools) is an open-source observability dashboard for Claude Code. It watches your sessions live and tells you:

- Every tool call, every turn, with full input/output payloads
- Token + dollar cost per turn, split by model
- Cache hit ratio (which prompts are actually warm)
- A subagent DAG when you fan out
- Permission gating from the browser — no more terminal context-switch when Claude asks "can I run `rm -rf`?"
- Remote + Docker: auto-detects Docker, collector streams JSONL from remote machines back to your local dashboard

One command:

```bash
npx @lukehungngo/claude-devtools
```

Opens at `http://localhost:3142`. Picks up your existing `~/.claude/projects/` sessions immediately — no replay needed, no proxy, no SDK wrapper. MIT, no telemetry, runs entirely on localhost.

## What you see

Click into a session and the trace renders turn by turn: user message → assistant response → tool calls with full payloads → tool results → end of turn. Every step costed. Every model labeled. Every retry visible.

The Agent Graph view shows subagent fan-out as a gantt-like timeline. The main session at the top, each `Task()` subagent below, each annotated with duration, cost, and token I/O. When a subagent loops or fails, it's red and obvious. When one prompt eats 80% of your budget, it's a wide bar at the top of the chart.

The Cost tab splits everything by model — Opus vs Sonnet vs Haiku — and shows cache hit ratio. That single number changed how I write prompts. It turned out my long context-stuffed prompts were the cheap ones (cache hits) and my small-but-frequent agent loops were the expensive ones. The opposite of what I'd assumed.

## The Insights tab

Per-turn cost is diagnostic. The Insights tab is something different — it aggregates everything across every session you've ever run and shows the patterns you can't see from inside any single conversation.

What it shows:

- Total tokens in, out, and cached across all your work
- Token trend over the last 7, 30, or 90 days
- A heatmap of *when* you actually work — rows are weekdays, columns are hours, intensity is output tokens
- Average cost per turn and average tokens per turn
- Active days, peak hour, sessions count, turns count
- Cost trend with delta vs the prior period

For me, the heatmap was the surprise. I'd assumed I worked in long weekend bursts. The data said the opposite: 40% of my Claude Code time happens between 18:00 and 22:00 on weekdays, with a hard peak at 14:00 Monday. The pre-coffee Monday-me writes different agent instructions than the evening-me does, and one of them is better than the other.

The cost trend matters more than the absolute number. "$22K total" is shock value. "$22K total, trending −41% week-over-week" is actually actionable — you're getting cheaper to operate.

The cache hit number is the third one worth watching. When it climbs, your prompts are warm. When it drops, you've probably started a new pattern that's not cacheable yet. Either way, knowing it exists changes how you write the next prompt.

## How it works

Claude Code writes a complete JSONL transcript for every session to `~/.claude/projects/`. Each line is a discrete event — user message, assistant turn, tool call, tool result, end of turn. Claude DevTools watches those files and broadcasts deltas to the dashboard over WebSocket.

A few engineering invariants I hit my head on:

**JSONL is the single source of truth.** The server never persists or mutates. It reads what Claude Code already wrote. If the dashboard ever shows a number that disagrees with the transcript, the transcript is right.

**Incremental parsing with byte offsets.** First version did `readFileSync` + `slice(fromOffset)` and re-read the entire file on every change. With a 100k-event session, that's hundreds of MB of disk I/O at ~2Hz during active streaming. I switched to `openSync` + `readSync(fd, buf, 0, length, offset)` to read only the new bytes. The file descriptor closes in a `try/finally`.

**Metrics computed server-side.** Early dashboard versions aggregated tokens in React. The browser jankd at ~30 events/sec. Now `computeMetrics()` runs on the server, the dashboard receives pre-computed `SessionMetrics`, and re-rendering is cheap.

**60fps on 1000-event sessions.** The trace view virtualizes. Components use `React.memo` with explicit comparators. State updates are RAF-batched so 50 events arriving in a 16ms window result in one render, not 50.

**Fail-safe parsing.** Both the full and incremental JSONL parsers catch errors per-line and continue. One corrupted line never crashes a session load.

A few P0 lessons I'd rather you learn from than rediscover:

| Lesson | Cause | Fix |
|---|---|---|
| JSONL parser was reading entire file | `readFileSync` + slice | byte-offset `openSync`/`readSync` |
| Every WS event triggered full REST refetch | `liveEvents` in `useEffect` deps | ref read + 30s background sync |
| DAG iterated events 5 times | Separate analyzers | single-pass `analyzeEvents()` |
| Agent status flashed completed mid-compute | Wrong condition | require `hasEndTurn && !isRecent` |

The full architecture invariants doc is in the [repo](https://github.com/lukehungngo/claude-devtools/blob/master/.claude/rules/architecture.md), with every rule paired to the failure mode that led to it.

## Where it runs

- **Local:** picks up your `~/.claude/projects/` sessions instantly
- **Docker:** auto-detects containers running Claude Code, injects a collector agent — no extra setup
- **Remote:** run the collector with `--server` and `--token` on the remote machine, JSONL streams back to your local dashboard

One pane of glass for every agent, wherever it lives.

## What it isn't

This is not a Claude Code replacement. It reads what Claude Code wrote. Hooks integration is partial. Windows works but is less polished than macOS and Linux. There's no SaaS version and no plan for one — it stays MIT and local.

## Try it

```bash
npx @lukehungngo/claude-devtools
```

- Repo: https://github.com/lukehungngo/claude-devtools
- npm: https://www.npmjs.com/package/@lukehungngo/claude-devtools
- Latest release: [v0.3.13](https://github.com/lukehungngo/claude-devtools/releases/tag/v0.3.13) — running-row animation + 10 bug fixes

If you run Claude Code agents, give it a spin and tell me what's missing. PRs, issues, brutal feedback all welcome.

A follow-up post is coming on Efficiency Hints — the part of the dashboard that aggregates patterns across sessions to surface what's actually wasting your tokens. That's a longer story and I want to get the math right before I write it.
