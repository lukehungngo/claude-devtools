import { discoverSessions } from "../../parser/session-discovery.js";
import type { DetectorContext } from "./types.js";

const RANGE_MS: Record<string, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

export function buildDetectorContext(
  range: "24h" | "7d" | "30d" | "90d",
  repo = "all"
): DetectorContext {
  const nowMs = Date.now();
  const rangeMs = RANGE_MS[range];
  const cutoff = nowMs - rangeMs;
  const priorCutoff = cutoff - rangeMs;

  const all = discoverSessions();
  const inRepo = (s: { cwd?: string }) => repo === "all" || s.cwd === repo;
  const sessions = all.filter((s) => inRepo(s) && new Date(s.startTime).getTime() >= cutoff);
  const priorSessions = all.filter(
    (s) => {
      const t = new Date(s.startTime).getTime();
      return inRepo(s) && t >= priorCutoff && t < cutoff;
    }
  );

  return { sessions, priorSessions, range, repo, nowMs };
}
