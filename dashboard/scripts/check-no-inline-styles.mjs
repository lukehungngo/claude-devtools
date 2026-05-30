import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SRC_DIR = path.resolve(process.cwd(), "src");

// Inline styles are allowed only where values are inherently dynamic, or where
// they are pre-existing UI debt. Keep legacy entries explicit so new files are
// still caught by this guard.
const DYNAMIC_INLINE_STYLE_ALLOWLIST = [
  "components/AgentFlowDAG.tsx",
  "components/AgentLogs.tsx",
  "components/AgentNodeCard.tsx",
  "components/TopBar.tsx",
  "components/Layout.tsx",
  "components/conversation/AgentPills.tsx",
  "components/conversation/ToolEntries.tsx",
  "components/conversation/TurnCard.tsx",
  "components/viewer/ToolCallBlock.tsx",
  "routes/GraphPage.tsx", // dynamic right-rail width from the resize handle
];

const LEGACY_INLINE_STYLE_ALLOWLIST = [
  "components/ProfileDrawer.tsx",
  "components/RepoList.tsx",
  "components/Titlebar.tsx",
  "components/TurnHistoryPanel.tsx",
  "components/bottom-panel/BottomPanel.tsx",
  "components/bottom-panel/CostTab.tsx",
  "components/bottom-panel/DetailTab.tsx",
  "components/bottom-panel/HooksTab.tsx",
  "components/bottom-panel/MCPStatusTab.tsx",
  "components/bottom-panel/TasksTab.tsx",
  "components/bottom-panel/TraceTab.tsx",
  "components/bottom-panel/UsageTab.tsx",
  "components/controls/ContextCompact.tsx",
  "components/controls/ControlsZone.tsx",
  "components/controls/EffortSlider.tsx",
  "components/controls/FastModeToggle.tsx",
  "components/controls/ModelSwitcher.tsx",
  "components/conversation/AgentCard.tsx",
  "components/conversation/AutoDenialBlock.tsx",
  "components/conversation/BackgroundAgentGroup.tsx",
  "components/conversation/ConversationView.tsx",
  "components/conversation/ExpandHint.tsx",
  "components/conversation/NarrationGroup.tsx",
  "components/conversation/PhaseGroup.tsx",
  "components/conversation/ProgressBar.tsx",
  "components/conversation/PromptInput.tsx",
  "components/conversation/RawLogView.tsx",
  "components/conversation/ReopenBar.tsx",
  "components/conversation/StaticCompactMarker.tsx",
  "components/conversation/StreamingTurnArea.tsx",
  "components/conversation/TaskGrid.tsx",
  "components/conversation/TurnDivider.tsx",
  "components/insights/CASRow.tsx",
  "components/insights/HeatmapGrid.tsx",
  "components/insights/HourlyBars.tsx",
  "components/insights/Sparkline.tsx",
  "components/insights/TrendChart.tsx",
  "components/panels/HookEditor.tsx",
  "components/panels/PermissionHistory.tsx",
  "components/panels/SettingsPanel.tsx",
  "components/panels/TaskMonitor.tsx",
  "components/panels/TaskPanel.tsx",
  "components/viewer/ThinkingBlock.tsx",
  "components/viewer/ToolResultBlock.tsx",
  "routes/InsightsPage.tsx",
  "routes/SessionPage.tsx",
];

const ALLOWLIST = new Set([
  ...DYNAMIC_INLINE_STYLE_ALLOWLIST,
  ...LEGACY_INLINE_STYLE_ALLOWLIST,
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
