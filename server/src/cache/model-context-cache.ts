import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parserLog } from "../logger.js";

const CACHE_DIR = path.join(os.homedir(), ".claude", "devtools");
const CACHE_FILE = path.join(CACHE_DIR, "model-context-window.json");

let memCache: Record<string, number> | null = null;

function ensureLoaded(): Record<string, number> {
  if (memCache !== null) return memCache;
  try {
    const parsed: unknown = JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      memCache = parsed as Record<string, number>;
    } else {
      memCache = {};
    }
  } catch {
    memCache = {};
  }
  return memCache;
}

export function getModelContextWindow(model: string): number | undefined {
  return ensureLoaded()[model];
}

export async function updateModelContextWindows(
  modelUsage: Record<string, { contextWindow: number }>,
): Promise<void> {
  const cache = ensureLoaded();
  let changed = false;

  for (const [model, usage] of Object.entries(modelUsage)) {
    if (usage.contextWindow > 0 && cache[model] !== usage.contextWindow) {
      cache[model] = usage.contextWindow;
      changed = true;
    }
  }

  if (!changed) return;

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache), "utf-8");
    parserLog.info({ models: Object.keys(modelUsage) }, "model context window cache updated");
  } catch (err) {
    parserLog.warn({ err }, "failed to persist model context window cache");
  }
}
