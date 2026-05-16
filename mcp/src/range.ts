export type TimeRange = "24h" | "7d" | "30d" | "90d" | "all";

const VALID: readonly string[] = ["24h", "7d", "30d", "90d", "all"];

export function parseRange(v: unknown): TimeRange {
  if (typeof v === "string" && VALID.includes(v)) {
    return v as TimeRange;
  }
  throw new Error(`invalid range: ${String(v)} (expected ${VALID.join("|")})`);
}

const HOURS = 3_600_000;
const DAYS = 86_400_000;

export function cutoffMs(range: TimeRange, nowMs: number): number {
  switch (range) {
    case "24h":
      return nowMs - 24 * HOURS;
    case "7d":
      return nowMs - 7 * DAYS;
    case "30d":
      return nowMs - 30 * DAYS;
    case "90d":
      return nowMs - 90 * DAYS;
    case "all":
      return 0;
  }
}
