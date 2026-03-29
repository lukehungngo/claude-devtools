# claude-devtools

Web-based Claude Code client with agent observability. Monorepo: `server/` (Express + SDK) and `dashboard/` (React + Vite).

## Build & Test

```bash
cd server && pnpm test && cd ../dashboard && pnpm test  # run tests
cd server && npx tsc --noEmit && cd ../dashboard && npx tsc --noEmit  # type check
```

## Code Style

- TypeScript strict, Vitest, ESLint 9
- Dashboard: Tailwind `dt-*` tokens, `lucide-react`, named exports, no inline styles
- Server: pino logger (never `console.log`), `spawnSync` not `execSync`

## Architecture Invariants

1. **JSONL is source of truth** — read-only from `~/.claude/projects/`. Never mutate.
2. **Byte-offset incremental parsing** — `openSync`/`readSync`, never re-read full file.
3. **Fail-safe parsing** — skip malformed lines, never crash.
4. **Metrics server-side** — `computeMetrics()` on server, dashboard gets pre-computed.
5. **WS broadcasts only new events** — REST for full session, WS for deltas.
6. **SDK events via SSE** — active sessions stream from `query()` iterator directly.
7. **Promise-based permissions** — `canUseTool` returns Promise, 10min timeout.

## Key References

- **Domain knowledge & SDK reference:** `docs/spec/` (read before new features)
- **Gap matrix:** `docs/spec/gap-matrix.md`
- **Lessons learned:** `docs/lessons_learned/`
- **OKR & progress:** `docs/plans/v3-okr-tiers.md`

## Project Type

- **has_ui:** true
