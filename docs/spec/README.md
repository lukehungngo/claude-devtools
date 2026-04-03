# Claude Code Domain Knowledge & Spec

This directory is the **canonical reference** for building claude-devtools. Read these docs before implementing any feature.

## Reading Order

1. **[claude-code-architecture.md](claude-code-architecture.md)** — The 8 core systems of Claude Code and how they interconnect
2. **[sdk-reference.md](sdk-reference.md)** — SDK API surface: query(), Query control methods, event types, what we use vs what exists
3. **[event-model.md](event-model.md)** — JSONL event format, SDK streaming events, content block types
4. **[session-lifecycle.md](session-lifecycle.md)** — How sessions start, stream, compact, checkpoint, fork, and end
5. **[permission-system.md](permission-system.md)** — 5 permission modes, rules syntax, canUseTool callback, our implementation
6. **[configuration.md](configuration.md)** — Settings, hooks, MCP, CLAUDE.md, permission rules — all config file formats
7. **[gap-matrix.md](gap-matrix.md)** — What the CLI has vs what we've built, with SDK evidence for each gap
8. **[command-discovery.md](command-discovery.md)** — How slash commands are discovered, the 3-tier fallback, and why the dashboard shows fewer commands than CLI

## Source Material

- `claude-howto` repo (github.com/luongnv89/claude-howto) — structured learning guide for Claude Code features
- `@anthropic-ai/claude-agent-sdk` v0.2.81+ type definitions (read from node_modules)
- Our codebase source code audit (server + dashboard)
- Claude Code CLI official docs (code.claude.com/docs/en/overview)
