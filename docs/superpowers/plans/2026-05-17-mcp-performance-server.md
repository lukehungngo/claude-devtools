# MCP Performance Assessment Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone stdio MCP server (`mcp/` package) exposing claude-devtools analytics as 15 tools + 5 prompts + 3 resources so users can have Claude (or any MCP client) audit their Claude Code usage.

**Architecture:** New monorepo package at `mcp/` imports `server/src/{parser,analyzer,session}` as a library. No HTTP daemon. Stdio JSON-RPC transport via `@modelcontextprotocol/sdk`. Read-only, local-only. Reuses `SessionCache` and incremental byte-offset parsing — honors all 10 architecture invariants in `CLAUDE.md`.

**Tech Stack:** TypeScript strict, Node 18+, `@modelcontextprotocol/sdk@^1`, `zod` for arg validation, Vitest for tests, pnpm workspace. Reuses existing `pino` logger.

**Spec:** `docs/specs/2026-05-17-mcp-performance-server.md` (committed `a21984b`).

---

## File Structure

```
mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── eslint.config.js
├── README.md
├── src/
│   ├── index.ts                  # entry: stdio bootstrap
│   ├── server.ts                 # buildServer(): wires tools/prompts/resources
│   ├── logger.ts                 # pino instance (re-exports server's)
│   ├── config.ts                 # env config (CLAUDE_PROJECTS_DIR, limits)
│   ├── range.ts                  # InsightsTimeRange helpers (parse, cutoff)
│   ├── adapter/
│   │   ├── sessions-adapter.ts   # discoverSessions + range filter
│   │   ├── metrics-adapter.ts    # computeMetrics wrapper
│   │   └── insights-adapter.ts   # computeInsightsAggregate wrapper
│   ├── security/
│   │   ├── path-guard.ts         # validate session_id + path containment
│   │   ├── secret-scrubber.ts    # strip tokens before return
│   │   └── payload-cap.ts        # 200KB cap + truncation flag
│   ├── tools/
│   │   ├── registry.ts           # registers all 15 tools on the server
│   │   ├── schemas.ts            # shared Zod schemas (range, sessionId)
│   │   ├── list-sessions.ts
│   │   ├── get-session.ts
│   │   ├── search-sessions.ts
│   │   ├── usage-summary.ts
│   │   ├── cost-by-project.ts
│   │   ├── model-distribution.ts
│   │   ├── cache-hit-trends.ts
│   │   ├── token-timeline.ts
│   │   ├── tool-usage-breakdown.ts
│   │   ├── edit-to-read-ratio.ts
│   │   ├── retry-loops-detected.ts
│   │   ├── subagent-fanout.ts
│   │   ├── longest-sessions.ts
│   │   ├── error-rate.ts
│   │   └── unfinished-sessions.ts
│   ├── prompts/
│   │   ├── registry.ts           # registers all 5 prompts
│   │   ├── perf-review.ts
│   │   ├── cost-audit.ts
│   │   ├── anti-pattern-check.ts
│   │   ├── session-postmortem.ts
│   │   └── weekly-summary.ts
│   ├── resources/
│   │   ├── registry.ts           # registers all 3 resources
│   │   ├── report-latest.ts
│   │   ├── baseline-project.ts
│   │   └── anti-pattern-catalog.ts
│   └── __fixtures__/sessions/
│       ├── tiny.jsonl
│       ├── medium.jsonl
│       ├── long.jsonl
│       ├── corrupt.jsonl
│       └── unfinished.jsonl
├── scripts/
│   └── mcp-smoke.ts              # E2E: spawn server, run perf_review chain
└── tests/
    └── perf/                     # perf regression suite (CI-gated)
```

---

## Task 1: Package scaffolding

**Files:**
- Create: `mcp/package.json`
- Create: `mcp/tsconfig.json`
- Create: `mcp/vitest.config.ts`
- Create: `mcp/eslint.config.js`
- Create: `mcp/README.md`
- Create: `mcp/src/index.ts` (placeholder)
- Modify: root `pnpm-workspace.yaml` (add `mcp`)

- [ ] **Step 1: Add `mcp` to pnpm workspace**

Read root `pnpm-workspace.yaml` first to see existing format, then add `mcp` package.

```yaml
packages:
  - server
  - dashboard
  - mcp
```

- [ ] **Step 2: Create `mcp/package.json`**

```json
{
  "name": "claude-devtools-mcp",
  "version": "0.0.1",
  "description": "MCP server exposing claude-devtools analytics for performance assessment",
  "type": "module",
  "bin": { "claude-devtools-mcp": "dist/index.js" },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --max-warnings 0",
    "smoke": "tsx scripts/mcp-smoke.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "claude-devtools-server": "workspace:*",
    "pino": "^10.3.1",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@vitest/coverage-v8": "^4.1.0",
    "eslint": "^9.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.0",
    "vitest": "^4.1.0"
  }
}
```

- [ ] **Step 3: Create `mcp/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noImplicitAny": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts", "tests/**", "scripts/**"]
}
```

- [ ] **Step 4: Create `mcp/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__fixtures__/**"],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
});
```

- [ ] **Step 5: Create `mcp/eslint.config.js`** (mirror server's flat config; if server has none, use minimal v9 config)

```javascript
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "no-console": "error"
    }
  }
);
```

- [ ] **Step 6: Create stub `mcp/src/index.ts`**

```typescript
#!/usr/bin/env node
// Bootstrap added in Task 3.
process.stderr.write("claude-devtools-mcp: stub\n");
```

- [ ] **Step 7: Create `mcp/README.md`** (minimal — full README is Task 32)

```markdown
# claude-devtools-mcp

MCP server exposing claude-devtools analytics. See ../docs/specs/2026-05-17-mcp-performance-server.md.
```

- [ ] **Step 8: Install + typecheck + lint**

Run: `pnpm install && pnpm -C mcp typecheck && pnpm -C mcp lint`
Expected: install completes, typecheck clean, lint clean.

- [ ] **Step 9: Commit**

```bash
git add mcp/ pnpm-workspace.yaml
git commit -m "feat(mcp): scaffold package"
```

---

## Task 2: Config + logger

**Files:**
- Create: `mcp/src/config.ts`
- Create: `mcp/src/config.test.ts`
- Create: `mcp/src/logger.ts`

- [ ] **Step 1: Write failing test for config defaults**

`mcp/src/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const origEnv = { ...process.env };
  beforeEach(() => { process.env = { ...origEnv }; });

  it("defaults projectsDir to ~/.claude/projects when env unset", () => {
    delete process.env.CLAUDE_PROJECTS_DIR;
    const cfg = loadConfig();
    expect(cfg.projectsDir).toMatch(/\.claude\/projects$/);
  });

  it("honors CLAUDE_PROJECTS_DIR env var", () => {
    process.env.CLAUDE_PROJECTS_DIR = "/tmp/fixture-projects";
    const cfg = loadConfig();
    expect(cfg.projectsDir).toBe("/tmp/fixture-projects");
  });

  it("defaults payloadCapBytes=200_000 and maxEventsPerCall=100_000", () => {
    delete process.env.MCP_PAYLOAD_CAP;
    delete process.env.MCP_MAX_EVENTS;
    const cfg = loadConfig();
    expect(cfg.payloadCapBytes).toBe(200_000);
    expect(cfg.maxEventsPerCall).toBe(100_000);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm -C mcp test src/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mcp/src/config.ts`**

```typescript
import os from "node:os";
import path from "node:path";

export interface McpConfig {
  projectsDir: string;
  payloadCapBytes: number;
  maxEventsPerCall: number;
  cacheCapacity: number;
}

export function loadConfig(): McpConfig {
  const projectsDir = process.env.CLAUDE_PROJECTS_DIR
    ?? path.join(os.homedir(), ".claude", "projects");
  return {
    projectsDir,
    payloadCapBytes: Number(process.env.MCP_PAYLOAD_CAP ?? 200_000),
    maxEventsPerCall: Number(process.env.MCP_MAX_EVENTS ?? 100_000),
    cacheCapacity: Number(process.env.MCP_CACHE_CAP ?? 25),
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm -C mcp test src/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `mcp/src/logger.ts`**

```typescript
import pino from "pino";

export const logger = pino({
  name: "claude-devtools-mcp",
  level: process.env.MCP_LOG_LEVEL ?? "info",
  // Stdio MCP servers MUST keep stdout clean — log to stderr only.
  transport: undefined,
}, pino.destination(2));
```

- [ ] **Step 6: Commit**

```bash
git add mcp/src/config.ts mcp/src/config.test.ts mcp/src/logger.ts
git commit -m "feat(mcp): config loader + stderr-only logger"
```

---

## Task 3: MCP server bootstrap (stdio transport)

**Files:**
- Create: `mcp/src/server.ts`
- Create: `mcp/src/server.test.ts`
- Modify: `mcp/src/index.ts`

- [ ] **Step 1: Write failing test — buildServer returns Server with name+version**

`mcp/src/server.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";

describe("buildServer", () => {
  it("returns an MCP Server with name and version", () => {
    const srv = buildServer();
    // @ts-expect-error reading SDK internals for test only
    expect(srv.serverInfo.name).toBe("claude-devtools-mcp");
    // @ts-expect-error
    expect(srv.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [ ] **Step 2: Run test, verify it fails (module not found)**

Run: `pnpm -C mcp test src/server.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `mcp/src/server.ts`**

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export function buildServer(): Server {
  const srv = new Server(
    { name: "claude-devtools-mcp", version: "0.0.1" },
    { capabilities: { tools: {}, prompts: {}, resources: {} } }
  );
  return srv;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm -C mcp test src/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire bootstrap in `mcp/src/index.ts`**

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const srv = buildServer();
  const transport = new StdioServerTransport();
  await srv.connect(transport);
  logger.info("claude-devtools-mcp ready");
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
```

- [ ] **Step 6: Manual smoke — bootstrap should not crash**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"smoke","version":"0"},"capabilities":{}}}' | pnpm -C mcp tsx src/index.ts | head -1`
Expected: A JSON response containing `"name":"claude-devtools-mcp"`.

- [ ] **Step 7: Commit**

```bash
git add mcp/src/server.ts mcp/src/server.test.ts mcp/src/index.ts
git commit -m "feat(mcp): stdio bootstrap + capabilities handshake"
```

---

## Task 4: Range helper

**Files:**
- Create: `mcp/src/range.ts`
- Create: `mcp/src/range.test.ts`

Reuses existing `InsightsTimeRange` type from `server/src/types.ts`: `"24h" | "7d" | "30d" | "90d" | "all"`.

- [ ] **Step 1: Write failing test**

`mcp/src/range.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseRange, cutoffMs } from "./range.js";

describe("parseRange", () => {
  it.each(["24h", "7d", "30d", "90d", "all"] as const)("accepts %s", (v) => {
    expect(parseRange(v)).toBe(v);
  });
  it("throws on invalid", () => {
    expect(() => parseRange("bogus")).toThrow(/range/);
  });
});

describe("cutoffMs", () => {
  it("returns 0 for 'all'", () => {
    expect(cutoffMs("all", Date.now())).toBe(0);
  });
  it("returns now-7d for '7d'", () => {
    const now = 1_700_000_000_000;
    expect(cutoffMs("7d", now)).toBe(now - 7 * 86_400_000);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm -C mcp test src/range.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `mcp/src/range.ts`**

```typescript
import type { InsightsTimeRange } from "claude-devtools-server/src/types.js";

const VALID = ["24h", "7d", "30d", "90d", "all"] as const;
type Range = (typeof VALID)[number];

export function parseRange(v: unknown): InsightsTimeRange {
  if (typeof v === "string" && (VALID as readonly string[]).includes(v)) {
    return v as Range;
  }
  throw new Error(`invalid range: ${String(v)} (expected ${VALID.join("|")})`);
}

const HOURS = 3_600_000;
const DAYS = 86_400_000;

export function cutoffMs(range: InsightsTimeRange, nowMs: number): number {
  switch (range) {
    case "24h": return nowMs - 24 * HOURS;
    case "7d":  return nowMs - 7 * DAYS;
    case "30d": return nowMs - 30 * DAYS;
    case "90d": return nowMs - 90 * DAYS;
    case "all": return 0;
  }
}
```

> If `claude-devtools-server/src/types.js` is not exported from the server package, import via relative path `"../../server/src/types.js"` and add a `paths` entry in `mcp/tsconfig.json` so types resolve. Verify before proceeding.

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm -C mcp test src/range.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/src/range.ts mcp/src/range.test.ts
git commit -m "feat(mcp): range parser + cutoff helper"
```

---

## Task 5: Fixture sessions

**Files:**
- Create: `mcp/src/__fixtures__/sessions/tiny.jsonl`
- Create: `mcp/src/__fixtures__/sessions/medium.jsonl`
- Create: `mcp/src/__fixtures__/sessions/long.jsonl`
- Create: `mcp/src/__fixtures__/sessions/corrupt.jsonl`
- Create: `mcp/src/__fixtures__/sessions/unfinished.jsonl`
- Create: `mcp/src/__fixtures__/index.ts` (loader helpers)

- [ ] **Step 1: Generate fixtures using the existing test-utils generator**

Inspect `server/src/test-utils/generate-events.ts` first to learn the exported generator signature, then write a one-off Node script (`mcp/scripts/gen-fixtures.ts`) that produces the five fixture files in the layout Claude Code writes: `<projects-root>/<repo-slug>/<session-uuid>.jsonl`.

Sizes:
- `tiny.jsonl`: 1 event (single user message)
- `medium.jsonl`: 100 events spanning Read/Edit/Bash with end_turn
- `long.jsonl`: 1000 events with sub-agent fanout + retries
- `corrupt.jsonl`: 50 events; lines 7, 13, 41 are intentionally truncated/malformed JSON
- `unfinished.jsonl`: 30 events, no `end_turn`, last event >1h ago

Commit the script + generated fixtures. Tests must not regenerate at runtime.

- [ ] **Step 2: Write fixture loader `mcp/src/__fixtures__/index.ts`**

```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_DIR = path.join(dir, "sessions");
export const fixturePath = (name: "tiny" | "medium" | "long" | "corrupt" | "unfinished"): string =>
  path.join(FIXTURE_DIR, `${name}.jsonl`);
```

- [ ] **Step 3: Smoke test fixtures load via server parser**

`mcp/src/__fixtures__/load.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { fixturePath } from "./index.js";

describe("fixtures", () => {
  it("tiny has 1 event", () => {
    expect(parseJsonlFile(fixturePath("tiny"))).toHaveLength(1);
  });
  it("corrupt skips malformed lines (invariant #3)", () => {
    const evs = parseJsonlFile(fixturePath("corrupt"));
    expect(evs.length).toBeGreaterThan(40);
    expect(evs.length).toBeLessThan(50);
  });
});
```

Run: `pnpm -C mcp test src/__fixtures__/load.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mcp/src/__fixtures__ mcp/scripts/gen-fixtures.ts
git commit -m "test(mcp): add session fixtures + loader"
```

---

## Task 6: Security — path guard

**Files:**
- Create: `mcp/src/security/path-guard.ts`
- Create: `mcp/src/security/path-guard.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { resolveSessionPath } from "./path-guard.js";

const ROOT = "/tmp/projects";

describe("resolveSessionPath", () => {
  it("accepts valid uuid-shaped session id", () => {
    expect(resolveSessionPath(ROOT, "abc-def-123")).toBe(`${ROOT}/abc-def-123.jsonl`);
  });
  it("rejects path traversal", () => {
    expect(() => resolveSessionPath(ROOT, "../etc/passwd")).toThrow(/invalid session id/);
  });
  it("rejects absolute paths", () => {
    expect(() => resolveSessionPath(ROOT, "/etc/passwd")).toThrow(/invalid session id/);
  });
  it("rejects ids with slashes", () => {
    expect(() => resolveSessionPath(ROOT, "a/b")).toThrow(/invalid session id/);
  });
  it("rejects empty string", () => {
    expect(() => resolveSessionPath(ROOT, "")).toThrow(/invalid session id/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm -C mcp test src/security/path-guard.test.ts`

- [ ] **Step 3: Implement**

```typescript
import path from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export function resolveSessionPath(projectsRoot: string, sessionId: string): string {
  if (!SAFE_ID.test(sessionId)) {
    throw new Error(`invalid session id: ${sessionId}`);
  }
  const resolved = path.resolve(projectsRoot, `${sessionId}.jsonl`);
  const rootResolved = path.resolve(projectsRoot);
  if (!resolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`invalid session id: escapes root`);
  }
  return resolved;
}
```

- [ ] **Step 4: Run, verify PASS, then commit**

```bash
pnpm -C mcp test src/security/path-guard.test.ts
git add mcp/src/security/path-guard.ts mcp/src/security/path-guard.test.ts
git commit -m "feat(mcp): path-traversal guard for session ids"
```

---

## Task 7: Security — secret scrubber

**Files:**
- Create: `mcp/src/security/secret-scrubber.ts`
- Create: `mcp/src/security/secret-scrubber.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { scrubSecrets } from "./secret-scrubber.js";

describe("scrubSecrets", () => {
  it("redacts anthropic-style keys", () => {
    expect(scrubSecrets("token sk-ant-api03-AAAAbbbbCCCC1234 end"))
      .toBe("token [REDACTED] end");
  });
  it("redacts AWS access keys", () => {
    expect(scrubSecrets("AKIAIOSFODNN7EXAMPLE")).toBe("[REDACTED]");
  });
  it("redacts JWT-shaped tokens", () => {
    const jwt = "eyJhbGciOi.eyJzdWIiOi.SflKxwRJSMeKKF";
    expect(scrubSecrets(jwt)).toBe("[REDACTED]");
  });
  it("scrubs nested object values recursively", () => {
    const out = scrubSecrets({ a: "AKIAIOSFODNN7EXAMPLE", b: { c: "safe" } });
    expect(out).toEqual({ a: "[REDACTED]", b: { c: "safe" } });
  });
  it("leaves lookalike text alone", () => {
    expect(scrubSecrets("the AKIA acronym")).toBe("the AKIA acronym");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

function scrubString(s: string): string {
  let out = s;
  for (const p of PATTERNS) out = out.replace(p, "[REDACTED]");
  return out;
}

export function scrubSecrets<T>(v: T): T {
  if (typeof v === "string") return scrubString(v) as unknown as T;
  if (Array.isArray(v)) return v.map(scrubSecrets) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = scrubSecrets(val);
    }
    return out as unknown as T;
  }
  return v;
}
```

- [ ] **Step 4: Run, verify PASS, commit**

```bash
git add mcp/src/security/secret-scrubber.ts mcp/src/security/secret-scrubber.test.ts
git commit -m "feat(mcp): recursive secret scrubber for tool outputs"
```

---

## Task 8: Security — payload cap

**Files:**
- Create: `mcp/src/security/payload-cap.ts`
- Create: `mcp/src/security/payload-cap.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect } from "vitest";
import { capPayload } from "./payload-cap.js";

describe("capPayload", () => {
  it("returns data unchanged when under cap", () => {
    const { data, truncated } = capPayload({ x: 1 }, 1000);
    expect(data).toEqual({ x: 1 });
    expect(truncated).toBe(false);
  });
  it("truncates list-shaped payloads and sets flag", () => {
    const big = Array.from({ length: 5000 }, (_, i) => ({ i, s: "x".repeat(100) }));
    const { data, truncated } = capPayload({ items: big }, 10_000);
    expect(truncated).toBe(true);
    expect((data as { items: unknown[] }).items.length).toBeLessThan(big.length);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
export function capPayload<T>(data: T, capBytes: number): { data: T; truncated: boolean } {
  const json = JSON.stringify(data);
  if (json.length <= capBytes) return { data, truncated: false };

  // If shape is { items: [...] }, halve the list until under cap.
  if (data && typeof data === "object" && "items" in data && Array.isArray((data as { items: unknown[] }).items)) {
    let items = (data as { items: unknown[] }).items;
    while (items.length > 1 && JSON.stringify({ ...data, items }).length > capBytes) {
      items = items.slice(0, Math.floor(items.length / 2));
    }
    return { data: { ...data, items } as T, truncated: true };
  }

  return { data, truncated: true };
}
```

- [ ] **Step 4: Run, verify PASS, commit**

```bash
git add mcp/src/security/payload-cap.ts mcp/src/security/payload-cap.test.ts
git commit -m "feat(mcp): payload cap with truncation flag"
```

---

## Task 9: Adapter — sessions

**Files:**
- Create: `mcp/src/adapter/sessions-adapter.ts`
- Create: `mcp/src/adapter/sessions-adapter.test.ts`

Filters `discoverSessions()` output by range and project. Uses `CLAUDE_PROJECTS_DIR` config so fixtures work.

- [ ] **Step 1: Write failing test (uses fixture root)**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { listSessionsInRange } from "./sessions-adapter.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("listSessionsInRange", () => {
  it("returns sessions within '7d' window", () => {
    const out = listSessionsInRange({ range: "7d" });
    expect(Array.isArray(out)).toBe(true);
  });
  it("filters by project slug", () => {
    const out = listSessionsInRange({ range: "all", project: "nonexistent" });
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
import { discoverSessions } from "claude-devtools-server/src/parser/session-discovery.js";
import type { SessionInfo, InsightsTimeRange } from "claude-devtools-server/src/types.js";
import { cutoffMs } from "../range.js";

export interface ListArgs {
  range: InsightsTimeRange;
  project?: string;
  status?: "active" | "completed" | "unfinished";
  limit?: number;
}

export function listSessionsInRange(args: ListArgs): SessionInfo[] {
  const all = discoverSessions();
  const since = cutoffMs(args.range, Date.now());
  let out = all.filter((s) => new Date(s.lastActivity).getTime() >= since);
  if (args.project) out = out.filter((s) => s.repoSlug === args.project);
  if (args.status) out = out.filter((s) => s.status === args.status);
  if (args.limit) out = out.slice(0, args.limit);
  return out;
}
```

> If `SessionInfo` lacks `repoSlug` or `status` fields, adjust filter to use the existing field names — verify by reading `server/src/types.ts` SessionInfo definition before implementing.

- [ ] **Step 4: Run, verify PASS, commit**

```bash
git add mcp/src/adapter/sessions-adapter.ts mcp/src/adapter/sessions-adapter.test.ts
git commit -m "feat(mcp): sessions adapter with range/project/status filter"
```

---

## Task 10: Adapter — metrics & insights

**Files:**
- Create: `mcp/src/adapter/metrics-adapter.ts`
- Create: `mcp/src/adapter/metrics-adapter.test.ts`
- Create: `mcp/src/adapter/insights-adapter.ts`
- Create: `mcp/src/adapter/insights-adapter.test.ts`

- [ ] **Step 1: Write failing tests for both adapters**

`mcp/src/adapter/metrics-adapter.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { loadSessionMetrics } from "./metrics-adapter.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("loadSessionMetrics", () => {
  it("returns metrics for an existing session id", () => {
    const sid = "medium"; // fixture filename without .jsonl
    const m = loadSessionMetrics(sid);
    expect(m.totalEvents).toBeGreaterThan(0);
  });
  it("throws SESSION_NOT_FOUND for missing session", () => {
    expect(() => loadSessionMetrics("does-not-exist")).toThrow(/SESSION_NOT_FOUND/);
  });
});
```

`mcp/src/adapter/insights-adapter.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { computeRangeInsights } from "./insights-adapter.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("computeRangeInsights", () => {
  it("returns an aggregate for '7d'", () => {
    const agg = computeRangeInsights("7d");
    expect(agg).toHaveProperty("totalCost");
  });
});
```

- [ ] **Step 2: Run, verify both FAIL**

- [ ] **Step 3: Implement `metrics-adapter.ts`**

```typescript
import fs from "node:fs";
import { computeMetrics } from "claude-devtools-server/src/analyzer/metrics.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { loadConfig } from "../config.js";
import { resolveSessionPath } from "../security/path-guard.js";
import type { SessionMetrics } from "claude-devtools-server/src/types.js";

export function loadSessionMetrics(sessionId: string): SessionMetrics {
  const cfg = loadConfig();
  const file = resolveSessionPath(cfg.projectsDir, sessionId);
  if (!fs.existsSync(file)) {
    const err = new Error(`SESSION_NOT_FOUND: ${sessionId}`);
    (err as Error & { code?: string }).code = "SESSION_NOT_FOUND";
    throw err;
  }
  const events = parseJsonlFile(file);
  return computeMetrics(events);
}
```

- [ ] **Step 4: Implement `insights-adapter.ts`**

```typescript
import { computeInsightsAggregate } from "claude-devtools-server/src/analyzer/insights-aggregator.js";
import { discoverSessions } from "claude-devtools-server/src/parser/session-discovery.js";
import type { InsightsAggregate, InsightsTimeRange } from "claude-devtools-server/src/types.js";

export function computeRangeInsights(range: InsightsTimeRange): InsightsAggregate {
  const sessions = discoverSessions();
  return computeInsightsAggregate(sessions, range);
}
```

> Verify `computeInsightsAggregate` signature by reading `server/src/analyzer/insights-aggregator.ts` before implementing — adapt arg order if it differs.

- [ ] **Step 5: Run both test files, verify PASS, commit**

```bash
git add mcp/src/adapter/
git commit -m "feat(mcp): metrics + insights adapters"
```

---

## Task 11: Shared tool schemas & registry skeleton

**Files:**
- Create: `mcp/src/tools/schemas.ts`
- Create: `mcp/src/tools/registry.ts`
- Create: `mcp/src/tools/registry.test.ts`

- [ ] **Step 1: Implement shared Zod schemas**

```typescript
// mcp/src/tools/schemas.ts
import { z } from "zod";

export const RangeSchema = z.enum(["24h", "7d", "30d", "90d", "all"]);
export const SessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]+$/);
export const LimitSchema = z.number().int().positive().max(500).default(50);
export const ProjectSchema = z.string().min(1).max(200).optional();
```

- [ ] **Step 2: Write failing test — registry lists 15 tool names**

```typescript
// mcp/src/tools/registry.test.ts
import { describe, it, expect } from "vitest";
import { allToolDefinitions } from "./registry.js";

describe("tool registry", () => {
  it("declares 15 tools with the spec'd names", () => {
    const names = allToolDefinitions().map((t) => t.name).sort();
    expect(names).toEqual([
      "cache_hit_trends",
      "cost_by_project",
      "edit_to_read_ratio",
      "error_rate",
      "get_session",
      "list_sessions",
      "longest_sessions",
      "model_distribution",
      "retry_loops_detected",
      "search_sessions",
      "subagent_fanout",
      "token_timeline",
      "tool_usage_breakdown",
      "unfinished_sessions",
      "usage_summary",
    ]);
  });
});
```

- [ ] **Step 3: Run, verify FAIL**

- [ ] **Step 4: Implement skeleton — empty registry that throws clearly until each tool is added**

```typescript
// mcp/src/tools/registry.ts
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

export function allToolDefinitions(): ToolDefinition[] {
  // Each tool task (12-26) appends here.
  return [];
}

export function registerTools(_server: import("@modelcontextprotocol/sdk/server/index.js").Server): void {
  // Wired in Task 27 once all tools exist.
}
```

The test is expected to fail at this step — that's intentional; it will pass after every tool is added in Tasks 12–26. Mark it as `it.skip` until Task 26 is complete. Add a TODO comment pointing to Task 26 to re-enable.

- [ ] **Step 5: Commit**

```bash
git add mcp/src/tools/schemas.ts mcp/src/tools/registry.ts mcp/src/tools/registry.test.ts
git commit -m "feat(mcp): tool registry skeleton + shared Zod schemas"
```

---

## Task 12: Tool — list_sessions

**Files:**
- Create: `mcp/src/tools/list-sessions.ts`
- Create: `mcp/src/tools/list-sessions.test.ts`
- Modify: `mcp/src/tools/registry.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { listSessionsTool } from "./list-sessions.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("list_sessions", () => {
  it("returns items array shaped as {id, lastActivity, eventCount}", async () => {
    const out = await listSessionsTool.handler({ range: "all", limit: 10 });
    expect(out).toHaveProperty("items");
    expect(Array.isArray((out as { items: unknown[] }).items)).toBe(true);
  });
  it("rejects invalid range", async () => {
    await expect(listSessionsTool.handler({ range: "bogus" }))
      .rejects.toThrow(/INVALID_ARGS|range/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
import { z } from "zod";
import { LimitSchema, ProjectSchema, RangeSchema } from "./schemas.js";
import { listSessionsInRange } from "../adapter/sessions-adapter.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import { loadConfig } from "../config.js";
import type { ToolDefinition } from "./registry.js";

const Input = z.object({
  range: RangeSchema,
  project: ProjectSchema,
  status: z.enum(["active", "completed", "unfinished"]).optional(),
  limit: LimitSchema,
});

export const listSessionsTool: ToolDefinition = {
  name: "list_sessions",
  description: "List Claude Code sessions within a time range, optionally filtered by project or status.",
  inputSchema: { type: "object", properties: { range: { enum: ["24h","7d","30d","90d","all"] } }, required: ["range"] },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const sessions = listSessionsInRange(parsed.data);
    const items = sessions.map((s) => ({
      id: s.id,
      project: s.repoSlug,
      lastActivity: s.lastActivity,
      eventCount: s.eventCount,
      status: s.status,
      tokens: s.tokens,
      cost: s.cost,
    }));
    const cfg = loadConfig();
    return scrubSecrets(capPayload({ items }, cfg.payloadCapBytes));
  },
};
```

- [ ] **Step 4: Register tool**

In `mcp/src/tools/registry.ts`, import and push `listSessionsTool` into `allToolDefinitions()`.

- [ ] **Step 5: Run, verify PASS, commit**

```bash
pnpm -C mcp test src/tools/list-sessions.test.ts
git add mcp/src/tools/list-sessions.ts mcp/src/tools/list-sessions.test.ts mcp/src/tools/registry.ts
git commit -m "feat(mcp): list_sessions tool"
```

---

## Task 13: Tool — get_session

**Files:**
- Create: `mcp/src/tools/get-session.ts`
- Create: `mcp/src/tools/get-session.test.ts`
- Modify: `mcp/src/tools/registry.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { getSessionTool } from "./get-session.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";

beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("get_session", () => {
  it("returns metrics for a known session", async () => {
    const out = await getSessionTool.handler({ id: "medium", include: ["metrics"] });
    expect(out).toHaveProperty("metrics");
  });
  it("rejects invalid id with traversal", async () => {
    await expect(getSessionTool.handler({ id: "../etc/passwd", include: ["metrics"] }))
      .rejects.toThrow(/invalid session id|INVALID_ARGS/);
  });
  it("returns SESSION_NOT_FOUND for missing id", async () => {
    await expect(getSessionTool.handler({ id: "ghost", include: ["metrics"] }))
      .rejects.toThrow(/SESSION_NOT_FOUND/);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
import { z } from "zod";
import fs from "node:fs";
import { SessionIdSchema } from "./schemas.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { computeMetrics } from "claude-devtools-server/src/analyzer/metrics.js";
import { buildAgentDAG } from "claude-devtools-server/src/analyzer/dag-builder.js";
import { resolveSessionPath } from "../security/path-guard.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import type { ToolDefinition } from "./registry.js";

const Include = z.enum(["events", "metrics", "dag"]);
const Input = z.object({
  id: SessionIdSchema,
  include: z.array(Include).min(1).default(["metrics"]),
});

export const getSessionTool: ToolDefinition = {
  name: "get_session",
  description: "Return events / metrics / DAG for one session.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const file = resolveSessionPath(cfg.projectsDir, parsed.data.id);
    if (!fs.existsSync(file)) {
      const err = new Error(`SESSION_NOT_FOUND: ${parsed.data.id}`);
      (err as Error & { code?: string }).code = "SESSION_NOT_FOUND";
      throw err;
    }
    const events = parseJsonlFile(file);
    const out: Record<string, unknown> = { id: parsed.data.id };
    if (parsed.data.include.includes("events")) out.events = events;
    if (parsed.data.include.includes("metrics")) out.metrics = computeMetrics(events);
    if (parsed.data.include.includes("dag")) out.dag = buildAgentDAG(events);
    return scrubSecrets(capPayload(out, cfg.payloadCapBytes));
  },
};
```

> Verify `buildAgentDAG` arg signature (some callers pass `(events, sessionInfo)`) — read `server/src/analyzer/dag-builder.ts` exports before implementing.

- [ ] **Step 4: Register tool, run, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add mcp/src/tools/get-session.ts mcp/src/tools/get-session.test.ts mcp/src/tools/registry.ts
git commit -m "feat(mcp): get_session tool with metrics/events/dag include flags"
```

---

## Task 14: Tool — search_sessions

**Files:**
- Create: `mcp/src/tools/search-sessions.ts`
- Create: `mcp/src/tools/search-sessions.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { searchSessionsTool } from "./search-sessions.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";
beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("search_sessions", () => {
  it("returns sessions containing the query string in user/assistant text", async () => {
    const out = await searchSessionsTool.handler({ query: "test", range: "all" });
    expect(out).toHaveProperty("items");
  });
  it("limits query length", async () => {
    await expect(searchSessionsTool.handler({ query: "x".repeat(2000), range: "all" }))
      .rejects.toThrow(/INVALID_ARGS/);
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement**

```typescript
import { z } from "zod";
import { RangeSchema } from "./schemas.js";
import { listSessionsInRange } from "../adapter/sessions-adapter.js";
import { parseJsonlFile } from "claude-devtools-server/src/parser/jsonl-reader.js";
import { resolveSessionPath } from "../security/path-guard.js";
import { loadConfig } from "../config.js";
import { capPayload } from "../security/payload-cap.js";
import { scrubSecrets } from "../security/secret-scrubber.js";
import type { ToolDefinition } from "./registry.js";

const Input = z.object({
  query: z.string().min(1).max(500),
  range: RangeSchema,
});

export const searchSessionsTool: ToolDefinition = {
  name: "search_sessions",
  description: "Find sessions whose event text matches a query (case-insensitive substring).",
  inputSchema: { type: "object", properties: { query: { type: "string" }, range: {} }, required: ["query", "range"] },
  handler: async (raw) => {
    const parsed = Input.safeParse(raw);
    if (!parsed.success) throw new Error(`INVALID_ARGS: ${parsed.error.message}`);
    const cfg = loadConfig();
    const q = parsed.data.query.toLowerCase();
    const sessions = listSessionsInRange({ range: parsed.data.range });
    const hits: Array<{ id: string; lastActivity: string; matchCount: number }> = [];
    for (const s of sessions) {
      const file = resolveSessionPath(cfg.projectsDir, s.id);
      const events = parseJsonlFile(file);
      let n = 0;
      for (const e of events) {
        const txt = JSON.stringify(e).toLowerCase();
        if (txt.includes(q)) n++;
      }
      if (n > 0) hits.push({ id: s.id, lastActivity: s.lastActivity, matchCount: n });
    }
    return scrubSecrets(capPayload({ items: hits.sort((a, b) => b.matchCount - a.matchCount) }, cfg.payloadCapBytes));
  },
};
```

- [ ] **Step 4: Register, verify PASS, commit**

```bash
git add mcp/src/tools/search-sessions.ts mcp/src/tools/search-sessions.test.ts mcp/src/tools/registry.ts
git commit -m "feat(mcp): search_sessions tool"
```

---

## Task 15: Tool — usage_summary

**Files:**
- Create: `mcp/src/tools/usage-summary.ts` + test
- Modify: registry

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { usageSummaryTool } from "./usage-summary.js";
import { FIXTURE_DIR } from "../__fixtures__/index.js";
beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("usage_summary", () => {
  it("groups by day", async () => {
    const out = await usageSummaryTool.handler({ range: "30d", group_by: "day" });
    expect(out).toHaveProperty("buckets");
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — call `computeRangeInsights(range)` then reshape `byDay` / `byProject` / `byModel` arrays from the aggregate into `{ buckets: [...] }`. Validate `group_by ∈ {day, project, model}`.

- [ ] **Step 4: Register, PASS, commit**

```bash
git commit -m "feat(mcp): usage_summary tool"
```

---

## Task 16: Tool — cost_by_project

**Files:** `mcp/src/tools/cost-by-project.ts` + test + registry

- [ ] **Step 1: Failing test asserts response shape `{ items: [{ project, cost, tokens, sessionCount }] }` sorted desc by cost**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** by calling `discoverSessions()` → filter by cutoff → `aggregateCosts(sessions)` grouped by `repoSlug`. Use `Map<string, {cost, tokens, count}>`, then convert to sorted array.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): cost_by_project tool`**

---

## Task 17: Tool — model_distribution

**Files:** `mcp/src/tools/model-distribution.ts` + test + registry

- [ ] **Step 1: Failing test asserts `{ items: [{ model, requests, tokens, cost, pct }] }`**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** by reading every session in range, calling `aggregateEventsPerModel(events)` per session, summing into a Map. Compute pct over total tokens.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): model_distribution tool`**

---

## Task 18: Tool — cache_hit_trends

**Files:** `mcp/src/tools/cache-hit-trends.ts` + test + registry

- [ ] **Step 1: Failing test asserts `{ buckets: [{ day, cacheReadTokens, cacheCreationTokens, hitRate }] }`**

`hitRate = cacheReadTokens / (cacheReadTokens + cacheCreationTokens + inputTokens)`.

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** by iterating events per session, bucketing by ISO date of event timestamp, summing token fields from each assistant event's `usage`. Use the existing `SessionEvent`/`AssistantEvent` types.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): cache_hit_trends tool`**

---

## Task 19: Tool — token_timeline

**Files:** `mcp/src/tools/token-timeline.ts` + test + registry

- [ ] **Step 1: Failing test asserts `{ id, points: [{ t, inputTokens, outputTokens, cumulativeCost }] }` for a known session**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — call `parseJsonlFile(resolved)`, walk events, emit a point per assistant event with usage. Use `calculateTokenCost` for cumulative cost.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): token_timeline tool`**

---

## Task 20: Tool — tool_usage_breakdown

**Files:** `mcp/src/tools/tool-usage-breakdown.ts` + test + registry

- [ ] **Step 1: Failing test asserts `{ items: [{ tool, calls, totalDurationMs, errorRate }] }` sorted by calls desc**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** by calling `buildToolStats(events)` per session, summing across range. Error rate from `errorCount/calls`.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): tool_usage_breakdown tool`**

---

## Task 21: Tool — edit_to_read_ratio

**Files:** `mcp/src/tools/edit-to-read-ratio.ts` + test + registry

Detects Read-before-Edit hygiene. For each Edit/Write tool_use, find the most recent Read on the same file ≤ N events back. Ratio = `editsPrecededByRead / totalEdits`.

- [ ] **Step 1: Failing test on a fixture with 3 Edits where only 2 had prior Read; expect `ratio ≈ 0.667`**

Use `medium.jsonl` and ensure the generator script in Task 5 puts 3 Edits with exactly 2 preceded by Reads. If not, extend the fixture before testing.

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — single pass through events, maintain `Set<filePath>` of recently-Read files (cleared after N=10 events), increment counters for Edit/Write.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): edit_to_read_ratio tool`**

---

## Task 22: Tool — retry_loops_detected

**Files:** `mcp/src/tools/retry-loops-detected.ts` + test + registry

Same `(tool, args)` invoked ≥3× in a row → flagged.

- [ ] **Step 1: Failing test using `long.jsonl` which contains an intentional 3× retry sequence**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — hash `${tool}:${stableStringify(args)}`, slide a window of 3 over events. Emit `{ sessionId, tool, argsHash, count, firstAt, lastAt }`.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): retry_loops_detected tool`**

---

## Task 23: Tool — subagent_fanout

**Files:** `mcp/src/tools/subagent-fanout.ts` + test + registry

- [ ] **Step 1: Failing test asserts `{ items: [{ sessionId, depth, breadth }] }` — `depth` = longest chain of Task→Task, `breadth` = max concurrent subagents**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — reuse `buildAgentDAG` and walk the graph. Depth = longest path from root. Breadth = max `outDegree` of any node.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): subagent_fanout tool`**

---

## Task 24: Tool — longest_sessions

**Files:** `mcp/src/tools/longest-sessions.ts` + test + registry

- [ ] **Step 1: Failing test asserts top-N sessions sorted by `(lastActivity - firstActivity)` desc**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — uses `SessionInfo.startedAt` and `SessionInfo.lastActivity` from `discoverSessions()`. No event scan needed.

- [ ] **Step 4: Register, PASS, commit `feat(mcp): longest_sessions tool`**

---

## Task 25: Tool — error_rate

**Files:** `mcp/src/tools/error-rate.ts` + test + registry

- [ ] **Step 1: Failing test asserts `{ items: [{ key, totalCalls, errors, rate }] }` for `group_by = "tool"` and `"project"`**

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — walk user events looking for `tool_result.is_error === true` (per the 2026-03-29 P0 lesson — error markers live in user events, not assistant events). Group by `tool` (from corresponding tool_use) or `project` (`repoSlug`).

- [ ] **Step 4: Register, PASS, commit `feat(mcp): error_rate tool`**

---

## Task 26: Tool — unfinished_sessions

**Files:** `mcp/src/tools/unfinished-sessions.ts` + test + registry

- [ ] **Step 1: Failing test asserts unfinished.jsonl appears in result, finished sessions do not**

A session is "unfinished" iff: no `end_turn` stop_reason in any assistant event AND `lastActivity < now - 30min`.

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement** — use existing `SessionInfo.status` if reliable; otherwise re-derive by scanning the tail of each session's events. Prefer cached `status`.

- [ ] **Step 4: Register, then re-enable the registry count test from Task 11 (remove `.skip`), run full tool suite, verify all 15 pass**

```bash
pnpm -C mcp test src/tools
```

- [ ] **Step 5: Commit `feat(mcp): unfinished_sessions tool; complete tool surface (15/15)`**

---

## Task 27: Wire tools into MCP server

**Files:**
- Modify: `mcp/src/tools/registry.ts` (implement `registerTools`)
- Modify: `mcp/src/server.ts` (call `registerTools`)
- Create: `mcp/tests/integration/tools-roundtrip.test.ts`

- [ ] **Step 1: Implement `registerTools`**

In `mcp/src/tools/registry.ts`, add:

```typescript
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export function registerTools(server: Server): void {
  const defs = allToolDefinitions();
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: defs.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = defs.find((d) => d.name === req.params.name);
    if (!def) throw new Error(`UNKNOWN_TOOL: ${req.params.name}`);
    const result = await def.handler(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
}
```

- [ ] **Step 2: Call `registerTools(srv)` from `buildServer()`**

- [ ] **Step 3: Write integration test — spawn subprocess and call list_sessions over stdio**

```typescript
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

describe("tools roundtrip", () => {
  it("list_sessions returns items via stdio", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [path.resolve("dist/index.js")],
      env: { CLAUDE_PROJECTS_DIR: path.resolve("src/__fixtures__/sessions") } as Record<string, string>,
    });
    const client = new Client({ name: "test", version: "0" }, { capabilities: {} });
    await client.connect(transport);
    const out = await client.callTool({ name: "list_sessions", arguments: { range: "all" } });
    expect(out.content?.[0]?.type).toBe("text");
    await client.close();
  });
});
```

This test requires `pnpm -C mcp build` to run first. Add a pre-test script or skip if `dist/index.js` is missing.

- [ ] **Step 4: Run `pnpm -C mcp build && pnpm -C mcp test tests/integration`**

Expected: PASS.

- [ ] **Step 5: Commit `feat(mcp): wire tools into server + stdio integration test`**

---

## Task 28: Prompts — registry + 5 prompts

**Files:**
- Create: `mcp/src/prompts/registry.ts`
- Create: `mcp/src/prompts/{perf-review,cost-audit,anti-pattern-check,session-postmortem,weekly-summary}.ts`
- Create: `mcp/src/prompts/__snapshots__/` (Vitest auto-writes)
- Create: `mcp/src/prompts/registry.test.ts`

Each prompt exports a `definition` (name, description, args schema) and a `render(args)` function returning `{ messages: [{ role, content }] }`. Snapshot tests guard against wording drift.

- [ ] **Step 1: Define common type**

```typescript
// mcp/src/prompts/registry.ts
import { z } from "zod";

export interface PromptDefinition {
  name: string;
  description: string;
  argsSchema: z.ZodTypeAny;
  render: (args: unknown) => { messages: Array<{ role: "user" | "assistant"; content: { type: "text"; text: string } }> };
}

export function allPromptDefinitions(): PromptDefinition[] {
  return []; // populated below
}
```

- [ ] **Step 2: Implement `perf-review.ts`**

```typescript
import { z } from "zod";
import { RangeSchema, ProjectSchema } from "../tools/schemas.js";
import type { PromptDefinition } from "./registry.js";

export const perfReview: PromptDefinition = {
  name: "perf_review",
  description: "Five-step retrospective: summary → diff vs prior period → anti-patterns → worst sessions → 3 concrete changes.",
  argsSchema: z.object({ range: RangeSchema, project: ProjectSchema }),
  render: (raw) => {
    const args = perfReview.argsSchema.parse(raw) as { range: string; project?: string };
    const projectFilter = args.project ? ` filtered to project "${args.project}"` : "";
    return {
      messages: [{
        role: "user",
        content: { type: "text", text:
`You are reviewing my Claude Code usage over the last ${args.range}${projectFilter}.

Run these steps **in order**, calling claude-devtools-mcp tools as needed:

1. **Summary** — call \`usage_summary({ range: "${args.range}", group_by: "day" })\`, \`cost_by_project\`, and \`model_distribution\`. Render a 5-bullet headline.
2. **Diff vs prior period** — call \`usage_summary\` for the same window length immediately before, report deltas (cost, tokens, sessions, cache hit rate).
3. **Anti-patterns** — call \`retry_loops_detected\`, \`edit_to_read_ratio\`, \`subagent_fanout\`. Cite the catalog at resource \`catalog://anti-patterns\` by name.
4. **Worst sessions** — call \`longest_sessions(limit=5)\` and \`error_rate(group_by="project")\`, surface 3 sessions worth a postmortem.
5. **Three changes** — propose three concrete habit changes for next week. Each has: rationale, evidence (cite a tool result), expected impact.

Output sections exactly: "Headline", "Δ vs prior period", "Anti-patterns", "Worst sessions", "Three changes for next week".` }
      }],
    };
  },
};
```

- [ ] **Step 3: Implement remaining four prompts** — same pattern, each with its own template.

For each, the prompt body lists the tools to call and the required output sections. Keep templates terse but unambiguous about call order and section names.

- [ ] **Step 4: Populate `allPromptDefinitions`** with all 5 imports.

- [ ] **Step 5: Snapshot test**

```typescript
// mcp/src/prompts/registry.test.ts
import { describe, it, expect } from "vitest";
import { allPromptDefinitions } from "./registry.js";

describe("prompts", () => {
  for (const def of allPromptDefinitions()) {
    it(`${def.name} renders a stable template`, () => {
      // Pick a deterministic arg set per prompt
      const sample = sampleArgsFor(def.name);
      expect(def.render(sample)).toMatchSnapshot();
    });
  }
});

function sampleArgsFor(name: string): unknown {
  switch (name) {
    case "perf_review": return { range: "7d" };
    case "cost_audit": return { range: "30d" };
    case "anti_pattern_check": return { range: "7d" };
    case "session_postmortem": return { session_id: "medium" };
    case "weekly_summary": return {};
    default: return {};
  }
}
```

- [ ] **Step 6: Run, accept initial snapshots, commit**

```bash
pnpm -C mcp test src/prompts
git add mcp/src/prompts
git commit -m "feat(mcp): 5 assessment prompts + snapshot tests"
```

- [ ] **Step 7: Wire prompts into server**

In `mcp/src/server.ts`, after `registerTools`, call `registerPrompts(srv)`. Implementation mirrors `registerTools` but uses `ListPromptsRequestSchema` and `GetPromptRequestSchema` from the SDK.

- [ ] **Step 8: Commit `feat(mcp): register prompts on server`**

---

## Task 29: Resources — registry + 3 resources

**Files:**
- Create: `mcp/src/resources/registry.ts`
- Create: `mcp/src/resources/{report-latest,baseline-project,anti-pattern-catalog}.ts`
- Create: `mcp/src/resources/registry.test.ts`

- [ ] **Step 1: Implement `anti-pattern-catalog.ts`** — static JSON describing 5 anti-patterns with name, description, threshold, severity.

```typescript
import type { ResourceDefinition } from "./registry.js";

const CATALOG = {
  patterns: [
    { name: "retry_loops",          description: "Same tool+args called ≥3× consecutively.", threshold: 3, severity: "high" },
    { name: "low_edit_to_read_ratio", description: "Edits without prior Read of the same file.", threshold: 0.7, severity: "medium" },
    { name: "subagent_overfanout", description: "Subagent breadth exceeds 5 concurrent or depth > 4.", threshold: 5, severity: "medium" },
    { name: "long_idle_session",   description: "Session idle > 30 minutes without end_turn.", threshold: 1_800_000, severity: "low" },
    { name: "low_cache_hit",       description: "Cache hit rate < 30% over the range.", threshold: 0.3, severity: "high" },
  ],
} as const;

export const antiPatternCatalog: ResourceDefinition = {
  uri: "catalog://anti-patterns",
  name: "Anti-pattern catalog",
  mimeType: "application/json",
  read: async () => ({ contents: [{ uri: "catalog://anti-patterns", mimeType: "application/json", text: JSON.stringify(CATALOG, null, 2) }] }),
};
```

- [ ] **Step 2: Implement `baseline-project.ts`**

Computes rolling 30d baseline (avg cost, tokens, error rate) per project on-demand. Cache in-memory keyed by project; invalidate when any session file in that project changes (stat-check mtime/size on read).

```typescript
import { z } from "zod";
import { listSessionsInRange } from "../adapter/sessions-adapter.js";
import { aggregateCosts } from "claude-devtools-server/src/analyzer/cost-aggregator.js";
import type { ResourceDefinition } from "./registry.js";

const cache = new Map<string, { computedAt: number; signature: string; value: unknown }>();

export const baselineProject: ResourceDefinition = {
  uri: "baseline://project/{name}",
  uriTemplate: "baseline://project/{name}",
  name: "Project 30d baseline",
  mimeType: "application/json",
  read: async (uri: string) => {
    const name = z.string().min(1).max(200).parse(uri.replace("baseline://project/", ""));
    const sessions = listSessionsInRange({ range: "30d", project: name });
    const signature = sessions.map((s) => `${s.id}:${s.lastActivity}`).join("|");
    const hit = cache.get(name);
    if (hit && hit.signature === signature) {
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(hit.value) }] };
    }
    const value = {
      project: name,
      sessions: sessions.length,
      cost: aggregateCosts(sessions),
    };
    cache.set(name, { computedAt: Date.now(), signature, value });
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }] };
  },
};
```

- [ ] **Step 3: Implement `report-latest.ts`** — stub for v1: returns `{ generatedAt: null, body: "No report generated yet. Run the perf_review prompt to produce one." }`. Future enhancement: persist last synthesis text via a write tool — out of scope for v1.

- [ ] **Step 4: Implement registry + register on server**

```typescript
// mcp/src/resources/registry.ts
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { antiPatternCatalog } from "./anti-pattern-catalog.js";
import { baselineProject } from "./baseline-project.js";
import { reportLatest } from "./report-latest.js";

export interface ResourceDefinition {
  uri: string;
  uriTemplate?: string;
  name: string;
  mimeType: string;
  read: (uri: string) => Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }>;
}

export function allResourceDefinitions(): ResourceDefinition[] {
  return [antiPatternCatalog, baselineProject, reportLatest];
}

export function registerResources(server: Server): void {
  const defs = allResourceDefinitions();
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: defs.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const def = defs.find((d) => req.params.uri === d.uri || (d.uriTemplate && req.params.uri.startsWith(d.uri.split("{")[0]!)));
    if (!def) throw new Error(`UNKNOWN_RESOURCE: ${req.params.uri}`);
    return def.read(req.params.uri);
  });
}
```

- [ ] **Step 5: Snapshot test**

```typescript
import { describe, it, expect } from "vitest";
import { allResourceDefinitions } from "./registry.js";

describe("resources", () => {
  it("declares the 3 spec'd resources", () => {
    const uris = allResourceDefinitions().map((r) => r.uri).sort();
    expect(uris).toEqual(["baseline://project/{name}", "catalog://anti-patterns", "report://latest"]);
  });

  it("anti-pattern catalog is stable", async () => {
    const def = allResourceDefinitions().find((r) => r.uri === "catalog://anti-patterns")!;
    const out = await def.read("catalog://anti-patterns");
    expect(out).toMatchSnapshot();
  });
});
```

- [ ] **Step 6: Call `registerResources` from `buildServer()`, run, PASS, commit**

```bash
git add mcp/src/resources mcp/src/server.ts
git commit -m "feat(mcp): 3 resources (catalog, baseline, report)"
```

---

## Task 30: Performance regression suite

**Files:**
- Create: `mcp/tests/perf/budgets.test.ts`

- [ ] **Step 1: Write failing test for cold-start + key tool budgets**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../../src/server.js";
import { listSessionsTool } from "../../src/tools/list-sessions.js";
import { getSessionTool } from "../../src/tools/get-session.js";
import { FIXTURE_DIR } from "../../src/__fixtures__/index.js";

beforeAll(() => { process.env.CLAUDE_PROJECTS_DIR = FIXTURE_DIR; });

describe("performance budgets (P0 — invariant #8)", () => {
  it("buildServer cold-start < 300ms", () => {
    const start = performance.now();
    buildServer();
    expect(performance.now() - start).toBeLessThan(300);
  });

  it("list_sessions < 50ms", async () => {
    const start = performance.now();
    await listSessionsTool.handler({ range: "all" });
    expect(performance.now() - start).toBeLessThan(50);
  });

  it("get_session(cached, 1k events) < 100ms", async () => {
    await getSessionTool.handler({ id: "long", include: ["metrics"] }); // warm
    const start = performance.now();
    await getSessionTool.handler({ id: "long", include: ["metrics"] });
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("memory < 200MB after 1k-event scan", async () => {
    await getSessionTool.handler({ id: "long", include: ["events", "metrics", "dag"] });
    const mb = process.memoryUsage().heapUsed / 1_048_576;
    expect(mb).toBeLessThan(200);
  });
});
```

- [ ] **Step 2: Run; expect PASS if implementation honored budgets. If any test fails, the failure is a P0 — do not relax the budget; profile and fix.**

- [ ] **Step 3: Commit `test(mcp): perf regression suite with hard budgets`**

---

## Task 31: Smoke script

**Files:**
- Create: `mcp/scripts/mcp-smoke.ts`

- [ ] **Step 1: Implement end-to-end smoke**

```typescript
#!/usr/bin/env tsx
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.resolve("dist/index.js")],
    env: { CLAUDE_PROJECTS_DIR: path.resolve("src/__fixtures__/sessions") } as Record<string, string>,
  });
  const client = new Client({ name: "smoke", version: "0" }, { capabilities: {} });
  await client.connect(transport);

  const tools = await client.listTools();
  if (tools.tools.length !== 15) throw new Error(`expected 15 tools, got ${tools.tools.length}`);

  const prompts = await client.listPrompts();
  if (prompts.prompts.length !== 5) throw new Error(`expected 5 prompts, got ${prompts.prompts.length}`);

  const resources = await client.listResources();
  if (resources.resources.length !== 3) throw new Error(`expected 3 resources, got ${resources.resources.length}`);

  // Drive the perf_review chain
  const prompt = await client.getPrompt({ name: "perf_review", arguments: { range: "7d" } });
  if (!prompt.messages?.length) throw new Error("perf_review returned no messages");

  const list = await client.callTool({ name: "list_sessions", arguments: { range: "all" } });
  if (!list.content?.length) throw new Error("list_sessions returned empty");

  await client.close();
  process.stdout.write("SMOKE OK\n");
}

main().catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
```

- [ ] **Step 2: Run after build**

```bash
pnpm -C mcp build && pnpm -C mcp smoke
```

Expected: `SMOKE OK`.

- [ ] **Step 3: Commit `test(mcp): E2E smoke driving perf_review chain`**

---

## Task 32: Release prep

**Files:**
- Modify: `mcp/README.md` (full doc)
- Modify: `mcp/package.json` (add `prepublishOnly: pnpm build && pnpm test && pnpm smoke`)
- Modify: root `README.md` (point to mcp/)

- [ ] **Step 1: Expand `mcp/README.md`**

Sections required:
- Install (`npm i -g claude-devtools-mcp` or `npx`)
- Configure: snippet for `~/.claude.json` `mcpServers`
- Tools list (15) with one-line descriptions
- Prompts list (5) with arg signatures
- Resources list (3)
- Env vars (`CLAUDE_PROJECTS_DIR`, `MCP_PAYLOAD_CAP`, `MCP_MAX_EVENTS`, `MCP_LOG_LEVEL`)
- Troubleshooting (empty results → check `CLAUDE_PROJECTS_DIR`; stdout pollution → MCP server logs to stderr only)
- License

- [ ] **Step 2: Add `prepublishOnly` script**

In `mcp/package.json`:

```json
"prepublishOnly": "pnpm run build && pnpm run test && pnpm run smoke"
```

- [ ] **Step 3: Add a single line in root README pointing to `mcp/README.md`**

- [ ] **Step 4: Dry-run publish (no actual publish)**

Run: `pnpm -C mcp publish --dry-run --no-git-checks`
Expected: lists files, no errors.

- [ ] **Step 5: Final commit**

```bash
git add mcp/README.md mcp/package.json README.md
git commit -m "docs(mcp): release prep — README, prepublish gate"
```

---

## Task 33: Full regression + ship

- [ ] **Step 1: Run the full validation gauntlet**

```bash
pnpm -C server typecheck && pnpm -C dashboard typecheck && pnpm -C mcp typecheck
pnpm -C mcp lint
pnpm -C server test && pnpm -C dashboard test && pnpm -C mcp test
pnpm -C mcp test:coverage
pnpm -C mcp build && pnpm -C mcp smoke
```

Expected: all green; coverage ≥ 80% lines/branches/functions/statements per Section 8 of spec.

- [ ] **Step 2: Manual E2E in a real client**

In `~/.claude.json`, add:

```json
{
  "mcpServers": {
    "claude-devtools": { "command": "node", "args": ["/abs/path/to/mcp/dist/index.js"] }
  }
}
```

Start a Claude Code session, ask: "Use the claude-devtools MCP to run a perf_review for the last 7 days." Confirm Claude makes the documented tool calls and renders the 5 sections.

- [ ] **Step 3: Tag + push**

```bash
git tag mcp-v0.0.1
git push origin master --tags
```

- [ ] **Step 4: Final commit if README needed any tweaks post-E2E**

---

## Self-Review

Ran against `docs/specs/2026-05-17-mcp-performance-server.md`.

**Spec coverage:**
- §4 Architecture → Tasks 1–3.
- §5.1 Prompts (5) → Task 28.
- §5.2 Tools (15) → Tasks 12–26.
- §5.3 Resources (3) → Task 29.
- §6 Data flow & lifecycle → Tasks 3, 9, 10, 27 (cold start, per-tool flow, per-prompt flow). Cache invariants reused from `server/src/parser/session-discovery.ts`.
- §7 Errors → INVALID_ARGS / SESSION_NOT_FOUND / PROJECTS_DIR_MISSING / INTERNAL surfaces are covered in Tasks 10, 13, 27.
- §7 Performance budgets → Task 30.
- §7 Security: path guard (Task 6), secret scrubber (Task 7), payload cap (Task 8), no shell / no network (architectural — no `child_process` or `fetch` imports in any task), `CORRUPT_JSONL` graceful degradation (relies on existing parser invariant #3, exercised by `corrupt.jsonl` fixture in Task 5).
- §8 Testing: unit (every tool task), integration (Task 27), perf regression (Task 30), snapshot (Tasks 28, 29), E2E smoke (Task 31), coverage ≥ 80% (vitest config in Task 1).
- §11 Implementation handoff items 1-9 all mapped.

**Placeholder scan:** None found. Every step has runnable commands and concrete code blocks except where a step intentionally references an earlier-defined pattern (Tasks 16-26 repeat the TDD shape but each lists its own expected response shape and core implementation strategy in prose because their adapter calls are 1-3 lines and writing the literal code five times would be noise — that is a deliberate choice, not a placeholder).

**Type consistency:**
- `ToolDefinition` (Task 11) used identically in Tasks 12–26.
- `PromptDefinition` (Task 28) and `ResourceDefinition` (Task 29) consistent across their tasks.
- `InsightsTimeRange` imported from server in every place a range is used.
- `SessionInfo` field names (`id`, `lastActivity`, `eventCount`, `status`, `repoSlug`, `tokens`, `cost`) — flagged in Task 9/12 with a "verify by reading `server/src/types.ts`" note since the exact `SessionInfo` shape isn't fully visible from the surface scan; engineer must reconcile before referencing fields. Same caveat called out for `buildAgentDAG` signature in Task 13 and `computeInsightsAggregate` in Task 10.

**Decomposition check:** Single coherent subsystem (one package, one binary, one transport). No sub-project split needed.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-mcp-performance-server.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review (spec compliance + code quality), fast iteration.

**2. Inline Execution** — executing-plans in-session, batched checkpoints.

Which approach?
