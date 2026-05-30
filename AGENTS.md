# AGENTS.md - Claude DevTools

Codex-facing notes for repeat sessions. Keep this file short; it is loaded often.

## Project

Claude DevTools is a local observability and insights tool for Claude Code.

- `server/`: Express + TypeScript, JSONL discovery/parsing, metrics, live SDK/SSE/WS.
- `dashboard/`: React + Vite + TypeScript UI.
- `mcp/`: MCP resources/prompts/adapters for usage analysis.

## Commands

Root:

```bash
pnpm lint
```

Server:

```bash
cd server
pnpm test
pnpm build
pnpm dev
```

Dashboard:

```bash
cd dashboard
pnpm test
pnpm build
pnpm lint:styles
pnpm dev
```

MCP:

```bash
cd mcp
pnpm test
pnpm build
```

Run focused tests while editing, then the relevant package test/build before claiming completion.

## Core Rules

1. JSONL under `~/.claude/projects/` is source of truth. Never mutate it.
2. Data integrity beats UI optimism. Token counts, costs, status, and attribution must match source data.
3. Parsing must be fail-safe. Skip malformed/partial/unknown lines; do not crash.
4. Metrics and insight evidence belong server-side; dashboard consumes precomputed payloads.
5. Live updates must stay incremental. Avoid full re-reads or large recomputes per event.
6. Low latency is product-critical. If it feels slower than terminal inspection, it is a bug.
7. Do not guess Claude Code behavior. Use JSONL ground truth, SDK types, or source/reference docs.
8. AI coaching must be evidence-backed by deterministic signals.
9. The app is a dense developer tool, not a marketing page.
10. Do not revert unrelated worktree changes.

## Important Paths

- `server/src/parser/`: JSONL readers.
- `server/src/discovery/`, `server/src/session/`: session discovery and identity.
- `server/src/analyzer/`: metrics and derived state.
- `server/src/analyzer/efficiency/`: coach-style detectors and evidence.
- `server/src/http/routes/`: API routes.
- `dashboard/src/routes/InsightsPage.tsx`: Insights surface.
- `dashboard/src/components/insights/`: hints, evidence, charts, reports.
- `dashboard/src/hooks/`: fetch hooks.
- `dashboard/src/lib/`: client helpers and mirrored types.
- `mcp/src/prompts/`: analysis prompts.
- `mcp/src/resources/`, `mcp/src/adapter/`: MCP data surfaces.

## UI Rules

Design references:

- `Claude DevTools Design System/README.md`
- `Claude DevTools Design System/SKILL.md`
- `Claude DevTools Design System/colors_and_type.css`
- `Claude DevTools Design System/ui_kits/`

Follow existing Claude DevTools style:

- Warm token-based surfaces, terracotta accent, restrained shadows.
- JetBrains Mono for metrics/numerals; DM Sans for UI prose.
- Lucide icons or structural glyphs; no emoji in production UI.
- Prefer design tokens and `dt-*` classes over hardcoded colors.
- Avoid new inline styles unless the existing component pattern requires it.
- Stable dimensions for dense UI; no overlapping text, no layout shift.

## Insights Direction

Insights is coach-first, not dashboard-first.

Target hierarchy:

1. Coaching feed: 3-4 ranked diagnoses with impact and one concrete behavior change.
2. Selected analysis: plain-language explanation of the chosen diagnosis.
3. Evidence: sessions, costs, retry loops, failed tools, model usage, cache/context, charts.

Charts are evidence, not the main product.

Designer/product brief:

- `docs/design/insights-coach-first-brief.md`

Quality claims need concrete signals: failed tool calls, retry loops, abandoned sessions, reverted edits, test failures, user corrections, permission denials, repeated reads without progress.

## Gotchas

- Avoid editing `dist/`, `dashboard/dist/`, coverage, or packaged assets unless explicitly asked.
- `server/src/types.ts` and `dashboard/src/lib/types.ts` may need coordinated updates.
- Claude Code JSONL schemas drift; preserve or safely ignore unknown fields.
- Session/subagent status is subtle. Read existing status tests before changing it.
- Use existing pricing/cost helpers; do not duplicate formulas.
- `pnpm lint:styles` catches dashboard style issues TypeScript will not.
- Hint/evidence APIs depend on stable detector categories and range-aware IDs.
- Local transcript analysis should work without external AI unless generating an AI report.

## Working Style

- Use `rg` for search.
- Use `apply_patch` for manual edits.
- Keep changes scoped.
- Add focused tests for analyzers, route payloads, hooks, or user-visible behavior.
- Prefer existing helpers and local patterns over new abstractions.
- For frontend changes that need a browser, start the dev server and give the URL.
- Before saying work is complete, run the relevant verification and read the output.

## References

- Claude Code: `https://github.com/anthropics/claude-code`
- Anthropic TypeScript SDK: `https://github.com/anthropics/anthropic-sdk-typescript`
- Structural inspiration: `https://github.com/karpathy/llm-council/blob/master/CLAUDE.md`


<claude-mem-context>
# Memory Context

# [claude-devtools] recent context, 2026-05-18 9:38pm GMT+7

No previous sessions found.
</claude-mem-context>