# MCP Performance Assessment Server — Design Spec

**Date:** 2026-05-17
**Status:** Approved, ready for implementation planning
**Scope:** Solo dev, local-only

## 1. Goal

Expose `claude-devtools` analytics over the Model Context Protocol (MCP) so users can ask Claude Code (or any MCP client) to assess and improve their Claude Code usage. The MCP server provides both raw metrics **and** opinionated assessment workflows — it does not just return numbers, it proposes a process the client follows to produce a final result.

## 2. What "performance" means here

Three retrospective dimensions (live in-session reflection is out of scope for v1):

- **Cost & token efficiency** — spend per session/day/project, cache hit rate, tokens-per-task, model mix, expensive tool patterns.
- **Workflow habits & tool usage** — Read-before-Edit hygiene, retry loops, subagent fanout, tool distribution, idle/long sessions.
- **Outcome quality** — completion vs abandonment, error rate, tool failure rate, rework signals.

## 3. User scope

Solo developer, local-only. Reads `~/.claude/projects/` JSONL on the user's own machine. No auth, no network, no multi-user, no telemetry.

## 4. Architecture

```
┌──────────────────┐    stdio    ┌──────────────────────────────────┐
│ Claude Code      │ ◄──────────►│ claude-devtools MCP server       │
│  (or any client) │   JSON-RPC  │  packages/mcp-server/            │
└──────────────────┘             │                                  │
                                 │  ┌──────────┐ ┌────────────────┐ │
                                 │  │ Prompts  │ │ Tools          │ │
                                 │  │ (process)│ │ (metrics)      │ │
                                 │  └────┬─────┘ └───────┬────────┘ │
                                 │       └──────┬────────┘          │
                                 │              ▼                   │
                                 │   ┌──────────────────────┐       │
                                 │   │ reused libs:         │       │
                                 │   │  server/src/parser   │       │
                                 │   │  server/src/analyzer │       │
                                 │   │  server/src/session  │       │
                                 │   └──────────┬───────────┘       │
                                 └──────────────┼───────────────────┘
                                                ▼
                                  ~/.claude/projects/*.jsonl
                                  (read-only, byte-offset incremental)
```

- New monorepo package: `mcp/` (sibling of `server/` and `dashboard/`).
- Imports `server/src/parser/*`, `server/src/analyzer/*`, `server/src/session/*` as a library. No HTTP daemon needed. No duplicate cache.
- Single binary entry: `npx claude-devtools-mcp` → stdio JSON-RPC.
- Drop-in to `~/.claude.json` `mcpServers`:
  ```json
  { "mcpServers": { "claude-devtools": { "command": "npx", "args": ["-y", "claude-devtools-mcp"] } } }
  ```
- Honors existing invariants (CLAUDE.md):
  1. JSONL is source of truth — read-only.
  2. Byte-offset incremental parsing via `openSync`/`readSync`.
  3. Fail-safe parsing — skip malformed lines, never crash.
  4. Metrics server-side — reuse `computeMetrics()` / `analyzeEvents()`.
  8. Performance budgets — see Section 7.

## 5. Surface

### 5.1 Prompts — the assessment processes

The "process" layer. Each prompt returns a templated message sequence telling Claude which tools to call, in what order, and how to synthesize the final result.

| Prompt | Args | Process |
|---|---|---|
| `perf_review` | `range` (`7d`/`30d`/`all`), `project?` | 5 steps: pull summary → diff vs prior period → flag anti-patterns → cite worst sessions → propose 3 concrete changes |
| `cost_audit` | `range`, `budget?` (USD) | Spend breakdown by model/project/tool → Pareto (top 20% causing 80%) → cheaper substitutions |
| `anti_pattern_check` | `range` | Run every detector tool → rank by severity → link offending sessions |
| `session_postmortem` | `session_id` | DAG walk → error/retry timeline → "what went wrong + how to avoid" |
| `weekly_summary` | (none, implicit last 7d) | Lightweight: top 5 wins, top 5 friction points, one habit to change this week |

Each prompt's template defines the **output schema** (markdown sections, bullet caps, citation format) so synthesis is consistent across runs.

### 5.2 Tools — the metrics surface (15)

Stateless, composable, Zod-validated args. Called by prompts or directly by the client.

**Discovery & navigation**
- `list_sessions(range, project?, status?, limit)`
- `get_session(id, include?: ["events"|"metrics"|"dag"])`
- `search_sessions(query, range)`

**Cost & tokens**
- `usage_summary(range, group_by: "day"|"project"|"model")`
- `cost_by_project(range)`
- `model_distribution(range)`
- `cache_hit_trends(range)`
- `token_timeline(session_id)`

**Workflow & habits**
- `tool_usage_breakdown(range, project?)`
- `edit_to_read_ratio(range)` — Read-before-Edit hygiene
- `retry_loops_detected(range)` — same tool + same args ≥3×
- `subagent_fanout(range)` — Task tool depth/breadth
- `longest_sessions(range, limit)`

**Outcomes**
- `error_rate(range, group_by: "tool"|"project")`
- `unfinished_sessions(range)` — no `end_turn`, stale > N min

### 5.3 Resources — curated artifacts (3)

Read-only, cacheable.

- `report://latest` — last generated review (markdown).
- `baseline://project/{name}` — rolling 30d baseline for diffing.
- `catalog://anti-patterns` — definitions + thresholds so Claude can cite them by name. Static JSON enumerating each detector (`retry_loops`, `low_edit_to_read_ratio`, `subagent_overfanout`, `long_idle_session`, `low_cache_hit`) with its threshold and severity tier.

**Baseline computation:** `baseline://project/{name}` is computed on-demand on first read, then cached in memory and invalidated when any session file in that project changes (mtime/size check). No background job.

**Range format (all prompts and tools):** enum of `"7d" | "30d" | "90d" | "all"` for v1. Date ranges and custom windows are explicit non-goals.

## 6. Data flow & lifecycle

### Cold start
1. Read `CLAUDE_PROJECTS_DIR` env (default `~/.claude/projects`).
2. Build lightweight session index via `discoverSessions()` — head/tail byte-range reads only.
3. Warm `SessionCache` lazily; do **not** preload all sessions.
4. Register prompts/tools/resources, return capabilities.

### Per-tool call
```
Client → tool(args)
       → Zod validate (reject malformed early; INVALID_ARGS)
       → SessionCache.get(id|range)   [mtime+size check, partial re-read]
       → analyzer.computeMetrics()    [single pass, reused from server/]
       → shape result for MCP (JSON, ≤200KB; paginate beyond)
       → return
```

- All reads are O(new bytes), not O(file size).
- `unfinished_sessions` / `longest_sessions` use index metadata only — no event scan.

### Per-prompt invocation
1. Prompt template returns a system+user message pair instructing Claude which tools to call in which order.
2. Claude executes the chain over multi-turn. MCP server is stateless between calls; cache is the only memory.
3. Claude produces the final synthesis as its own assistant message, conforming to the prompt's output schema.

### Refresh model
- No background polling inside MCP (would race with cache invalidation).
- Each tool call re-stats files; if mtime/size changed, partial re-read from last byte offset.
- Long-running clients get fresh numbers without restart.

### Concurrency
- Stdio is single-threaded request/response. In-process `Map` cache; no locks.
- Multiple concurrent client sessions = multiple MCP server processes, each with its own cache. Acceptable for solo-local scope.

## 7. Errors, performance, security

### Error model
- Tools return MCP error objects, never throw.
- Codes: `INVALID_ARGS`, `SESSION_NOT_FOUND`, `PROJECTS_DIR_MISSING`, `CORRUPT_JSONL` (still degrades — returns partial), `INTERNAL`.
- Fail-safe parsing preserved: malformed JSONL lines skipped, surfaced as `warnings: [{session, line, reason}]`.
- Prompts never fail; empty data returns a "no data in range" template so Claude can answer gracefully.

### Performance budgets

| Operation | Budget | Mechanism |
|---|---|---|
| Cold start → ready | < 300ms | Lazy session load, head/tail metadata only |
| `list_sessions` | < 50ms | Index-only, no event scan |
| `get_session` (cached) | < 100ms for 1k events | `SessionCache` mtime+size hit |
| `get_session` (partial re-read) | < 50ms / 100KB new bytes | Byte-offset incremental parse |
| Any metric tool | O(events_in_range), single pass | Reuse `analyzeEvents()` |
| Memory | < 200MB for 1k-event session | LRU cap on `SessionCache`, default 25 sessions |

Regression test: snapshot fixture set (1, 10, 100, 1000 events) + perf assertions in CI. Failures are P0 (invariant #8).

### Security
- **Read-only**: no write paths to JSONL, ever (invariant #1).
- **Path traversal**: `session_id` validated against `^[a-zA-Z0-9_-]+$`; resolved path must be inside `CLAUDE_PROJECTS_DIR`.
- **No shell**: never spawn editors/processes from MCP server (the 2026-03-29 `execSync` P0 lesson). All filesystem via `fs` primitives.
- **No network**: MCP server never makes outbound calls. No telemetry.
- **Secret scrubbing**: tool outputs strip values matching common token patterns (`sk-…`, `AKIA…`, JWT shape) before returning, in case session text contains them.
- **Resource limits**: hard cap on returned payload (200KB) and events scanned per call (configurable, default 100k); over-cap returns `truncated: true`.

## 8. Testing

### Unit (Vitest)
- Tool arg validation: every Zod schema, accept + reject cases.
- Each metric tool against fixture JSONL: `__fixtures__/sessions/{tiny,medium,long,corrupt,unfinished}.jsonl`.
- Path-traversal guard: `../`, absolute paths, symlinks outside projects dir all rejected.
- Secret scrubber: positive (matches stripped) and negative (lookalike text preserved).

### Integration
- Spawn MCP server as subprocess, drive over stdio with thin JSON-RPC test client.
- Verify: `initialize` handshake, capabilities advertised, every tool end-to-end, every prompt returns non-empty template.
- Cache behavior: mutate fixture mid-test, confirm next call sees new bytes via byte-offset re-read (assert via spy on `readSync`, not full re-parse).

### Performance regression (CI gate)
- Fixed fixture set, hard ms budgets per tool (Section 7 table). Failures are P0.
- Memory ceiling asserted via `process.memoryUsage().heapUsed` after 1k-event scan.

### Contract / golden
- Snapshot every prompt's returned template — guards against wording drift in the "process".
- Snapshot tool JSON shapes — clients depend on field stability.

### E2E
- `scripts/mcp-smoke.ts` runs a realistic Claude-style call sequence: `perf_review` prompt → chained tool calls → assert final synthesis structure.
- Optional release-gated: register MCP in a real `~/.claude.json`, run `claude -p` against fixture projects dir.

**Coverage target:** 80% (per global rule).

## 9. Non-goals (v1)

- Multi-user / team / org dashboards.
- Auth, RBAC, anonymized community baselines.
- Live in-session reflection ("how am I doing right now?").
- Write paths (annotations, comments, session edits).
- Network / telemetry / outbound calls of any kind.
- IDE plugin or VS Code extension.

## 10. Open questions

None. All clarified during brainstorming (2026-05-17).

## 11. Implementation handoff

Next step: invoke `writing-plans` skill to produce a phased implementation plan against this spec. Plan should cover:

1. Package scaffolding (`mcp/` with `package.json`, `tsconfig.json`, Vitest config, ESLint).
2. MCP server bootstrap + stdio transport + capabilities handshake.
3. Tool layer (15 tools, Zod schemas, shared analyzer adapter).
4. Prompt layer (5 prompts, template snapshots).
5. Resource layer (3 resources, baseline computation).
6. Security middleware (path guard, secret scrubber, payload cap).
7. Perf regression suite + CI integration.
8. Smoke script + manual E2E checklist.
9. Release: npm publish prep, README, `~/.claude.json` setup snippet.
