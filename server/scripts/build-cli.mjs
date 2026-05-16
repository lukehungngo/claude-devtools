#!/usr/bin/env node
// Build the publishable CLI bundle (dist/cli.cjs).
//
// Inlines the root package's name and version via esbuild --define so the
// bundled CJS file does not need to require("../../package.json") at runtime
// (which breaks once published, because the relative path differs between
// dev and the npm package layout).
import { build } from "esbuild";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));

await build({
  entryPoints: [resolve(__dirname, "..", "src", "cli.ts")],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: resolve(repoRoot, "dist", "cli.cjs"),
  define: {
    "process.env.NODE_ENV": '"production"',
    __PKG_NAME__: JSON.stringify(rootPkg.name),
    __PKG_VERSION__: JSON.stringify(rootPkg.version),
  },
  external: [
    "express",
    "ws",
    "chokidar",
    "pino",
    "better-sqlite3",
    "open",
    "update-notifier",
    "@anthropic-ai/claude-agent-sdk",
  ],
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
