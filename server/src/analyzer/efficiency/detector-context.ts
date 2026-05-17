import { discoverSessions } from "../../parser/session-discovery.js";
import type { DetectorContext } from "./types.js";

const RANGE_MS: Record<string, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
};

export function buildDetectorContext(range: "24h" | "7d" | "30d" | "90d"): DetectorContext {
  const nowMs = Date.now();
  const rangeMs = RANGE_MS[range];
  const cutoff = nowMs - rangeMs;
  const priorCutoff = cutoff - rangeMs;

  const all = discoverSessions();
  const sessions = all.filter((s) => new Date(s.startTime).getTime() >= cutoff);
  const priorSessions = all.filter(
    (s) => {
      const t = new Date(s.startTime).getTime();
      return t >= priorCutoff && t < cutoff;
    }
  );

  return { sessions, priorSessions, range, nowMs };
}
