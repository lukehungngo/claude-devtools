import { startHttpServer } from "./http/server.js";
import { runCollectorAgent } from "./collector/agent.js";
import { createRequire } from "module";
import { loadOrCreate } from "./collector/token.js";

// __PKG_NAME__ and __PKG_VERSION__ are inlined by esbuild --define at build time
// (see server/package.json npm-build script). Fallback to runtime require for dev/tsx.
declare const __PKG_NAME__: string | undefined;
declare const __PKG_VERSION__: string | undefined;

function loadPkg(): { name: string; version: string } {
  if (typeof __PKG_NAME__ === "string" && typeof __PKG_VERSION__ === "string") {
    return { name: __PKG_NAME__, version: __PKG_VERSION__ };
  }
  const requireFromHere = typeof __filename !== "undefined"
    ? createRequire(__filename)
    : createRequire(import.meta.url);
  return requireFromHere("../../package.json") as { name: string; version: string };
}
const pkg = loadPkg();

// `open` and `update-notifier` are ESM-only. Loading via dynamic import keeps
// the CJS bundle valid (esbuild marks both external) and avoids
// `fileURLToPath(undefined)` crashes that happen when ESM modules using
// `import.meta.url` are statically bundled into CommonJS.
async function loadOpen(): Promise<(url: string) => Promise<unknown>> {
  const mod = (await import("open")) as { default: (url: string) => Promise<unknown> };
  return mod.default;
}

async function notifyUpdate(): Promise<void> {
  try {
    const mod = (await import("update-notifier")) as {
      default: (opts: { pkg: { name: string; version: string } }) => { notify: () => void };
    };
    mod.default({ pkg }).notify();
  } catch {
    // Update notifier failures must never block the CLI.
  }
}

const [, , subcommand, ...args] = process.argv;

if (subcommand === "collect") {
  let serverUrl = "";
  let token = "";
  let source: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--server" && args[i + 1]) serverUrl = args[++i];
    else if (args[i] === "--token" && args[i + 1]) token = args[++i];
    else if (args[i] === "--source" && args[i + 1]) source = args[++i];
  }
  if (!serverUrl || !token) {
    process.stderr.write("Usage: claude-devtools collect --server ws://<host>:3142 --token <token>\n");
    process.exit(1);
  }
  void notifyUpdate();
  runCollectorAgent({ serverUrl, token, source });
} else if (subcommand === "token") {
  const token = loadOrCreate();
  process.stdout.write(`${token}\n`);
} else {
  const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);
  process.stdout.write("Starting Claude DevTools...\n");
  (async () => {
    await notifyUpdate();
    const { url, close } = await startHttpServer(port);
    process.stdout.write(`\nClaude DevTools → ${url}\n\n`);
    const open = await loadOpen();
    open(url).catch(() => { process.stdout.write(`Open ${url} in your browser\n`); });
    process.on("SIGINT", () => { close(); process.exit(0); });
    process.on("SIGTERM", () => { close(); process.exit(0); });
  })().catch((err) => {
    process.stderr.write(`Failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
