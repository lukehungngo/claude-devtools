# claude-devtools-mcp

MCP server exposing claude-devtools analytics for performance assessment. Enables Claude (or any MCP client) to audit Claude Code usage patterns, costs, and workflow habits.

## Install

```bash
npm i -g claude-devtools-mcp
# or use directly
npx claude-devtools-mcp
```

## Configure

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "claude-devtools": {
      "command": "npx",
      "args": ["-y", "claude-devtools-mcp"]
    }
  }
}
```

Or with a local install:

```json
{
  "mcpServers": {
    "claude-devtools": {
      "command": "node",
      "args": ["/path/to/mcp/dist/index.js"]
    }
  }
}
```

## Tools (15)

| Tool | Description |
|------|-------------|
| `list_sessions` | List sessions within a time range |
| `get_session` | Return events/metrics for one session |
| `search_sessions` | Find sessions matching a text query |
| `usage_summary` | Aggregate usage by day/project/model |
| `cost_by_project` | Cost breakdown by project |
| `model_distribution` | Token/cost distribution across models |
| `cache_hit_trends` | Cache hit rate trends by day |
| `token_timeline` | Token usage over time for a session |
| `tool_usage_breakdown` | Tool calls and error rates |
| `edit_to_read_ratio` | Read-before-Edit hygiene score |
| `retry_loops_detected` | Same tool+args called 3+ times |
| `subagent_fanout` | Task tool depth and breadth |
| `longest_sessions` | Top N sessions by duration |
| `error_rate` | Error rate by tool or project |
| `unfinished_sessions` | Sessions without end_turn, stale >30min |

## Prompts (5)

| Prompt | Args | Description |
|--------|------|-------------|
| `perf_review` | `range`, `project?` | Five-step retrospective with concrete changes |
| `cost_audit` | `range`, `budget?` | Spend Pareto analysis with substitutions |
| `anti_pattern_check` | `range` | Run all detectors, rank by severity |
| `session_postmortem` | `session_id` | Deep dive into a single session |
| `weekly_summary` | (none) | Quick wins/friction/habit summary |

## Resources (3)

| URI | Description |
|-----|-------------|
| `catalog://anti-patterns` | Static anti-pattern definitions + thresholds |
| `baseline://project/{name}` | Rolling 30d baseline for a project |
| `report://latest` | Last generated review (stub for v1) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` | Path to Claude Code JSONL files |
| `MCP_PAYLOAD_CAP` | `200000` | Max payload size in bytes |
| `MCP_MAX_EVENTS` | `100000` | Max events scanned per call |
| `MCP_LOG_LEVEL` | `info` | Pino log level (logs to stderr) |
| `MCP_CACHE_CAP` | `25` | LRU session cache capacity |

## Troubleshooting

- **Empty results**: Check `CLAUDE_PROJECTS_DIR` points to the correct directory containing `<hash>/<session>.jsonl` files.
- **stdout pollution**: MCP servers communicate over stdout. All logs go to stderr only. If you see garbled output, ensure no other code writes to stdout.
- **Permission errors**: The server only reads JSONL files. Ensure read permissions on `~/.claude/projects/`.

## Development

```bash
pnpm install
pnpm -C mcp test        # unit tests
pnpm -C mcp typecheck   # type checking
pnpm -C mcp lint        # eslint
pnpm -C mcp smoke       # E2E smoke test
```

## License

MIT
