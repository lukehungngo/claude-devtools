import { homedir } from "node:os";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { MetricsCache } from "../../cache/metrics-cache.js";
/** Shared metrics cache -- avoids re-parsing + re-computing metrics for unchanged files. */
export const metricsCache = new MetricsCache({ maxEntries: 50, ttlMs: 60_000 });
/** Check if a path exists (async) */
export async function pathExists(p) {
    try {
        await access(p);
        return true;
    }
    catch {
        return false;
    }
}
/** Read settings.json safely, returning empty object on missing/invalid */
export async function readSettingsJson() {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    try {
        const content = await readFile(settingsPath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return {};
    }
}
/** Write settings.json, creating ~/.claude/ if needed */
export async function writeSettingsJson(data) {
    const claudeDir = join(homedir(), ".claude");
    await mkdir(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, "settings.json");
    await writeFile(settingsPath, JSON.stringify(data, null, 2), "utf-8");
}
//# sourceMappingURL=route-context.js.map