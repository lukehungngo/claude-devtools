import { execSync } from "node:child_process";
import { request } from "node:https";
import { platform } from "node:os";
import type { UsageInfo } from "../types.js";

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const USAGE_API_URL = "https://api.anthropic.com/api/oauth/usage";

let cachedUsage: { data: UsageInfo; timestamp: number } | null = null;

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
  if (platform() !== "darwin") return null;

  try {
    const raw = execSync(
      `security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`,
      { encoding: "utf-8", timeout: 3000 }
    ).trim();

    const creds: KeychainCredentials = JSON.parse(raw);
    if (!creds.claudeAiOauth?.accessToken) return null;

    return {
      accessToken: creds.claudeAiOauth.accessToken,
      subscriptionType: creds.claudeAiOauth.subscriptionType || "",
    };
  } catch {
    return null;
  }
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
  if (!planName) return null; // API user, no usage limits

  const apiData = await fetchUsageFromApi(credentials.accessToken);
  if (!apiData) {
    return {
      fiveHour: { utilization: null, resetsAt: null },
      sevenDay: { utilization: null, resetsAt: null },
      planName,
    };
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

  cachedUsage = { data: result, timestamp: Date.now() };
  return result;
}
