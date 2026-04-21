import { startHttpServer } from "./http/server.js";
import { runCollectorAgent } from "./collector/agent.js";
import open from "open";
import updateNotifier from "update-notifier";
import { createRequire } from "module";
import { loadOrCreate } from "./collector/token.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { name: string; version: string };
updateNotifier({ pkg }).notify();

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
  runCollectorAgent({ serverUrl, token, source });
} else if (subcommand === "token") {
  const token = loadOrCreate();
  process.stdout.write(`${token}\n`);
} else {
  const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);
  process.stdout.write("Starting Claude DevTools...\n");
  const { url, close } = await startHttpServer(port);
  process.stdout.write(`\nClaude DevTools → ${url}\n\n`);
  open(url).catch(() => { process.stdout.write(`Open ${url} in your browser\n`); });
  process.on("SIGINT", () => { close(); process.exit(0); });
  process.on("SIGTERM", () => { close(); process.exit(0); });
}
