import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SRC_DIR = path.resolve(process.cwd(), "src");

// Inline styles are allowed only where values are inherently dynamic.
const ALLOWLIST = new Set([
  "components/AgentFlowDAG.tsx",
  "components/AgentLogs.tsx",
  "components/AgentNodeCard.tsx",
  "components/TopBar.tsx",
  "components/Layout.tsx",
  "components/conversation/AgentPills.tsx",
  "components/conversation/ToolEntries.tsx",
  "components/conversation/TurnCard.tsx",
  "components/viewer/ToolCallBlock.tsx",
]);

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return [full];
    }),
  );
  return files.flat();
}

async function main() {
  const allFiles = await walk(SRC_DIR);
  const tsxFiles = allFiles.filter((file) => file.endsWith(".tsx"));
  const violations = [];

  for (const file of tsxFiles) {
    const relative = path.relative(SRC_DIR, file).replaceAll("\\", "/");
    const content = await readFile(file, "utf8");
    if (!content.includes("style={{")) continue;
    if (!ALLOWLIST.has(relative)) {
      violations.push(relative);
    }
  }

  if (violations.length > 0) {
    console.error("Inline style guard failed. Move static styles to Tailwind classes.");
    for (const file of violations) {
      console.error(` - src/${file}`);
    }
    process.exit(1);
  }

  console.log("Inline style guard passed.");
}

main().catch((error) => {
  console.error("Inline style guard crashed:", error);
  process.exit(1);
});
