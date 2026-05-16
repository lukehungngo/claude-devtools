# claude-devtools server

Express + SDK backend for claude-devtools. Watches `~/.claude/projects/` and
serves session data to the dashboard.

## Local development

### Tests

```bash
pnpm test            # full suite
pnpm test:watch      # watch mode
```

### Opting into DebugDB tests

The `DebugDB` (SQLite-backed lifecycle store, dev-only) depends on the
`better-sqlite3` native module. Modern pnpm does not run native postinstall
scripts by default, so on a fresh clone the module is not built and the
following test files skip themselves:

- `src/debug/debug-db.test.ts`
- `src/__tests__/routes-debug.test.ts`
- `src/__tests__/routes-lifecycle-storage.test.ts`

To run them locally, approve the build once:

```bash
pnpm approve-builds   # interactive — select better-sqlite3
pnpm install          # rebuilds the native binding
pnpm test             # DebugDB suites now execute
```

`DebugDB` itself is gated on `NODE_ENV === "development"` in production code
(`DebugDB.open` returns `null` otherwise), so this only affects local testing.
