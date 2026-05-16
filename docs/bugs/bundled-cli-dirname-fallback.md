# Bug: Bundled `dist/cli.cjs` falls back to `process.cwd()` for `__dirname`, breaking static-serve

**Severity:** P0 — published 0.3.12 ships a CLI whose dashboard never loads unless invoked from a very specific directory. Every npx install since 0.3.12 is affected.
**Filed:** 2026-05-17
**Reported version:** v0.3.12
**Detected:** during browser validation of Bugs G/F/H/I — the production CLI returned `Cannot GET /` for every page route.

## Symptom

```bash
$ npx @lukehungngo/claude-devtools             # launches from any project dir
…
Claude DevTools → http://localhost:3142

$ curl http://localhost:3142/                   → HTTP 404 "Cannot GET /"
$ curl http://localhost:3142/index.html         → HTTP 404 "Cannot GET /index.html"
$ curl http://localhost:3142/assets/index.js    → HTTP 404
$ curl http://localhost:3142/api/repos          → HTTP 200 (API routes still work)
```

API routes function correctly; only the dashboard static files are unreachable. The user sees a blank/error tab in the browser even though `dist/public/index.html` exists in the install.

## Root cause (verified, not theorized)

`server/src/http/server.ts:17-24` (pre-fix) — module loader resolution:

```ts
let __dirname: string;
try {
  __dirname = dirname(fileURLToPath(import.meta.url));
} catch {
  // Fallback for CommonJS build
  __dirname = process.cwd();   // ← WRONG
}
```

This pattern works fine under dev (`tsx watch` → native ESM, `import.meta.url` is defined). It silently breaks under the bundled CJS produced by `server/scripts/build-cli.mjs` because:

1. esbuild rewrites `import.meta.url` as `import_meta2.url` where `import_meta2 = {}` (empty object — esbuild's CJS emulation of `import.meta`).
2. `fileURLToPath(undefined)` throws.
3. The `catch` branch runs: `__dirname = process.cwd()`.
4. When user launches `npx claude-devtools` from `/Users/alice/my-project`, `process.cwd()` is `/Users/alice/my-project`.
5. `publicDir = join(__dirname, "public")` becomes `/Users/alice/my-project/public`.
6. `existsSync(publicDir)` returns `false` (no such directory in the user's project).
7. The `if (existsSync(publicDir))` block is skipped — **neither `express.static` nor the SPA fallback `app.get("*", ...)` are mounted**.
8. Every non-`/api/*` request 404s.

Verified by injecting `console.error("[CDT-DIAG] __dirname=", __dirname, "publicDir=", publicDir, "exists=", existsSync(publicDir))` directly into the published `dist/cli.cjs` at line 7220:

```
[CDT-DIAG] __dirname= /Users/soh/working/ai/claude-devtools  publicDir= /Users/soh/working/ai/claude-devtools/public  exists= false
[CDT-DIAG] publicDir NOT FOUND
```

The path that exists at runtime is `/Users/soh/working/ai/claude-devtools/dist/public` — but `__dirname` resolved to the launch directory, missing the `dist/` segment.

## Why the dev path didn't catch this

`tsx watch src/dev-server.ts` runs the source as native ESM. `import.meta.url` is defined. The `try` branch succeeds. `__dirname` resolves correctly to the source file's directory. The dev dashboard works perfectly, hiding the bundling regression.

The bug only manifests in the bundled `dist/cli.cjs` path — the one we ship to npm. None of our automated tests exercise the bundled artifact; the regression slipped past `pnpm test` and into the published release.

## Identical pattern, fixed earlier — root-cause review failure

We hit the **same class of bug** previously, in `server/src/cli.ts`, fixed in commit `71c494a` ("chore: bump version to 0.3.12") by inlining `__PKG_NAME__`/`__PKG_VERSION__` via esbuild `--define`. That fix only addressed the one callsite; the `import.meta.url`-based `__dirname` calculation in `http/server.ts` (a different file) was never audited. A grep for `import.meta` would have surfaced both.

## Fix

`server/src/http/server.ts:17-31`:

```diff
-let __dirname: string;
-try {
-  __dirname = dirname(fileURLToPath(import.meta.url));
-} catch {
-  // Fallback for CommonJS build
-  __dirname = process.cwd();
-}
+// Resolve module directory in both runtimes:
+// - native ESM (tsx dev): __filename is undefined; use fileURLToPath(import.meta.url).
+// - bundled CJS (esbuild dist/cli.cjs): __filename is defined as the bundle's
+//   path; previously this branch fell through to process.cwd() which broke
+//   static-serve when users launched the CLI from any dir other than dist/.
+let __dirname: string;
+// `typeof __filename` is a TS-safe check that returns "undefined" under ESM
+// (where __filename is not a declared identifier) and "string" under the
+// esbuild CJS bundle (where __filename is the bundle's runtime path).
+if (typeof __filename === "string") {
+  __dirname = dirname(__filename);
+} else {
+  try {
+    __dirname = dirname(fileURLToPath(import.meta.url));
+  } catch {
+    __dirname = process.cwd();
+  }
+}
```

The `typeof X === "string"` form is a TypeScript-safe runtime probe. It does not require declaring `__filename` ambiently (which would conflict with the ESM mode where it genuinely doesn't exist).

## Verified empirically (after fix)

```bash
$ pkill -f "node dist/cli" && make npm-build && node dist/cli.cjs &
$ curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3142/
200
$ curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3142/index.html
200
$ curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3142/api/repos
200
```

All three return 200. Browser loads the dashboard, sidebar populates, session routes navigate correctly.

## Other call sites in the same file using `__dirname`

`server/src/http/server.ts:43` — `DebugDB.open(join(__dirname, "..", "..", "debug.sqlite"))` — same bug; was opening / failing to open `debug.sqlite` two directories above the launch dir (i.e. `/Users/alice/debug.sqlite` or similar) instead of the intended repo-root location. Now resolves correctly to the bundle's `../../debug.sqlite` (= repo root for dev, package root for installed CLI).

## Regression test (TODO — defer to a follow-up)

A true regression test for this needs to:
1. Run `make npm-build`
2. Spawn `node dist/cli.cjs` as a subprocess from a temp working directory that is NOT the repo root
3. HTTP-fetch `/` and assert 200 + HTML body

This is an integration test that exercises the published artifact — none exists in the suite today. Recommended: add one in `server/src/__tests__/bundled-cli.test.ts` as a build-gated CI step. For now the manual verification above stands as proof.

## Prevention

After ANY change touching the bundle paths (`server/scripts/build-cli.mjs`, `server/src/cli.ts`, or any file in `server/src/http/`), `make npm-build && node dist/cli.cjs` and a `curl -I http://localhost:3142/` should be part of pre-release smoke testing. This is essentially the regression test described above, run manually.

## Related

- `server/src/cli.ts` — the original sibling fix (commit `71c494a`) addresses `import.meta.url`-via-`createRequire` for `package.json` resolution using `__PKG_NAME__`/`__PKG_VERSION__` esbuild `--define` flags. That fix and this one together cover all `import.meta.url` callsites in the bundle, but a grep audit (`rg "import\.meta" server/src/`) should be part of any future esbuild config change.
- Architecture invariant #1 (CLAUDE.md): "JSONL is the source of truth." Tangentially related — when the dashboard fails to load, users lose all visibility into the JSONL data, defeating the project's core purpose.
