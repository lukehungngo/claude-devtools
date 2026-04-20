import { startHttpServer } from "./http/server.js";
import open from "open";

const port = parseInt(process.env.DEVTOOLS_PORT || "3142", 10);

process.stdout.write("Starting Claude DevTools...\n");

const { url, close } = await startHttpServer(port);

process.stdout.write(`\nClaude DevTools → ${url}\n\n`);

open(url).catch(() => {
  process.stdout.write(`Open ${url} in your browser\n`);
});

process.on("SIGINT", () => {
  close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  close();
  process.exit(0);
});
