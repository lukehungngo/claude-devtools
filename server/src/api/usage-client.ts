import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { request } from "node:https";
import { platform, homedir } from "node:os";
import { join } from "node:path";
import type { UsageInfo } from "../types.js";

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const USAGE_API_URL = "https://api.anthropic.com/api/oauth/usage";
const CREDENTIALS_FILE = join(homedir(), ".claude", ".credentials.json");

let cachedUsage: { data: UsageInfo; timestamp: number } | null = null;
let lastGoodUsage: UsageInfo | null = null; // preserved across rate limits

// On startup, try to read last good data from claude-hud's cache file
function loadLastGoodFromHudCache(): void {
  if (lastGoodUsage) return; // already have data

  try {
    // Find claude-hud cache file
    const hudPluginDir = join(homedir(), ".claude", "plugins", "claude-hud");
    const cachePath = join(hudPluginDir, ".usage-cache.json");

    if (existsSync(cachePath)) {
      const raw = JSON.parse(readFileSync(cachePath, "utf-8"));
      const good = raw.lastGoodData || raw.data;
      if (good && (good.fiveHour !== null || good.sevenDay !== null)) {
        lastGoodUsage = {
          fiveHour: {
            utilization: typeof good.fiveHour === "number" ? good.fiveHour : good.fiveHour?.utilization ?? null,
            resetsAt: good.fiveHourResetAt || good.fiveHour?.resetsAt || null,
          },
          sevenDay: {
            utilization: typeof good.sevenDay === "number" ? good.sevenDay : good.sevenDay?.utilization ?? null,
            resetsAt: good.sevenDayResetAt || good.sevenDay?.resetsAt || null,
          },
          planName: good.planName || null,
        };
      }
    }
  } catch {
    // ignore
  }
}

// Initialize on module load
loadLastGoodFromHudCache();

interface KeychainCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    subscriptionType?: string;
  };
}

function readKeychainToken(): {
  accessToken: string;
  subscriptionType: string;
} | null {
  // Try macOS keychain first
  if (platform() === "darwin") {
    try {
      const result = spawnSync(
        "security",
        ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
        { encoding: "utf-8", timeout: 3000 }
      );
      if (result.status !== 0) throw new Error("keychain lookup failed");
      const raw = (result.stdout || "").trim();

      const creds: KeychainCredentials = JSON.parse(raw);
      if (creds.claudeAiOauth?.accessToken) {
        return {
          accessToken: creds.claudeAiOauth.accessToken,
          subscriptionType: creds.claudeAiOauth.subscriptionType || "",
        };
      }
    } catch {
      // Fall through to file-based credentials
    }
  }

  // Fallback: read from credentials file (like claude-hud does)
  try {
    if (existsSync(CREDENTIALS_FILE)) {
      const raw = readFileSync(CREDENTIALS_FILE, "utf-8");
      const creds: KeychainCredentials = JSON.parse(raw);
      if (creds.claudeAiOauth?.accessToken) {
        return {
          accessToken: creds.claudeAiOauth.accessToken,
          subscriptionType: creds.claudeAiOauth.subscriptionType || "",
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function getPlanName(subscriptionType: string): string | null {
  const lower = subscriptionType.toLowerCase();
  if (lower.includes("max")) return "Max";
  if (lower.includes("pro")) return "Pro";
  if (lower.includes("team")) return "Team";
  return null;
}

function fetchUsageFromApi(
  accessToken: string
): Promise<{
  five_hour?: { utilization?: number; resets_at?: string };
  seven_day?: { utilization?: number; resets_at?: string };
} | null> {
  return new Promise((resolve) => {
    const url = new URL(USAGE_API_URL);
    const req = request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "anthropic-beta": "oauth-2025-04-20",
          "User-Agent": "claude-devtools/0.1",
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function clampUtilization(val: unknown): number | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return Math.min(100, Math.max(0, Math.round(val)));
}

export async function getAnthropicUsage(): Promise<UsageInfo | null> {
  // Check cache
  if (cachedUsage && Date.now() - cachedUsage.timestamp < CACHE_TTL_MS) {
    return cachedUsage.data;
  }

  const credentials = readKeychainToken();
  if (!credentials) return null;

  const planName = getPlanName(credentials.subscriptionType);
  if (!planName) return null;

  const apiData = await fetchUsageFromApi(credentials.accessToken);

  if (!apiData) {
    // API failed (rate limited, timeout, etc.)
    // Serve last good data if available (like claude-hud does)
    if (lastGoodUsage) {
      const fallback: UsageInfo = { ...lastGoodUsage, planName };
      cachedUsage = { data: fallback, timestamp: Date.now() };
      return fallback;
    }
    // No last good data — return plan name at least
    return { fiveHour: { utilization: null, resetsAt: null }, sevenDay: { utilization: null, resetsAt: null }, planName };
  }

  const result: UsageInfo = {
    fiveHour: {
      utilization: clampUtilization(apiData.five_hour?.utilization),
      resetsAt: apiData.five_hour?.resets_at || null,
    },
    sevenDay: {
      utilization: clampUtilization(apiData.seven_day?.utilization),
      resetsAt: apiData.seven_day?.resets_at || null,
    },
    planName,
  };

  lastGoodUsage = result;
  cachedUsage = { data: result, timestamp: Date.now() };
  return result;
}
