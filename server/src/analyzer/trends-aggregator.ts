import { statSync, openSync, readSync, closeSync } from "node:fs";
import type {
  SessionInfo,
  InsightsTrends,
  InsightsTrendEntry,
  TrendVerdict,
  InsightsTimeRange,
} from "../types.js";
import { getTimeRangeCutoff } from "./insights-aggregator.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// === Per-session JSONL cache ===

interface TrendsSessionData {
  fileSize: number;
  mtime: number;
  offset: number;
  commands: Array<{ name: string; weekMs: number; tokensIn: number; tokensOut: number }>;
  agents: Array<{ name: string; weekMs: number; tokensIn: number; tokensOut: number }>;
  skills: Array<{ name: string; weekMs: number; tokensIn: number; tokensOut: number }>;
}

// Cache keyed by session.path (unique per file on disk) to avoid cross-session pollution
const trendsSessionCache = new Map<string, TrendsSessionData>();

// === JSONL reading helpers ===

interface RawEvent {
  type?: string;
  userType?: string;
  message?: {
    role?: string;
    content?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}

function readJsonlEvents(filePath: string, fromOffset: number): { events: RawEvent[]; newOffset: number } {
  let fd: number | null = null;
  try {
    const stat = statSync(filePath);
    const fileSize = stat.size;
    if (fromOffset >= fileSize) return { events: [], newOffset: fromOffset };

    fd = openSync(filePath, "r");
    const bytesToRead = fileSize - fromOffset;
    const buf = Buffer.allocUnsafe(bytesToRead);
    const bytesRead = readSync(fd, buf, 0, bytesToRead, fromOffset);
    const chunk = buf.slice(0, bytesRead).toString("utf8");

    const events: RawEvent[] = [];
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as RawEvent);
      } catch {
        // skip malformed lines — fail-safe
      }
    }
    return { events, newOffset: fileSize };
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

// === Event parsing helpers ===

function extractCommandName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  // First word is the command name (e.g. "/review some code" → "/review")
  const word = trimmed.split(/\s+/)[0];
  return word ?? null;
}

function extractAgentName(input: Record<string, unknown>): string {
  if (typeof input.subagent_type === "string" && input.subagent_type) {
    return input.subagent_type;
  }
  if (typeof input.description === "string" && input.description) {
    return input.description.split(" ")[0] ?? "unknown";
  }
  return "unknown";
}

function extractSkillName(input: Record<string, unknown>): string {
  if (typeof input.skill === "string" && input.skill) {
    return input.skill;
  }
  return "unknown";
}

// === Session-level data extraction ===

function computeTrendsSessionData(session: SessionInfo): TrendsSessionData {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(session.path);
  } catch {
    return { fileSize: 0, mtime: 0, offset: 0, commands: [], agents: [], skills: [] };
  }

  const cacheKey = session.path;
  const cached = trendsSessionCache.get(cacheKey);
  if (cached && cached.fileSize === stat.size && cached.mtime === stat.mtimeMs) return cached;

  // Incremental: only reuse cached entries when the file grew (never when it shrank or was rewritten)
  const useIncremental = cached !== undefined && cached.fileSize < stat.size;
  const fromOffset = useIncremental ? cached.offset : 0;
  const commands = useIncremental ? [...cached.commands] : [];
  const agents = useIncremental ? [...cached.agents] : [];
  const skills = useIncremental ? [...cached.skills] : [];

  try {
    const { events, newOffset } = readJsonlEvents(session.path, fromOffset);
    const sessionWeekMs = new Date(session.startTime).getTime();

    for (const event of events) {
      if (event.type === "user" && event.userType === "external") {
        // Extract commands from user text messages
        const content = event.message?.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (
              item !== null &&
              typeof item === "object" &&
              (item as Record<string, unknown>).type === "text"
            ) {
              const text = (item as Record<string, unknown>).text;
              if (typeof text === "string") {
                const cmdName = extractCommandName(text);
                if (cmdName !== null) {
                  commands.push({ name: cmdName, weekMs: sessionWeekMs, tokensIn: 0, tokensOut: 0 });
                }
              }
            }
          }
        }
      } else if (event.type === "assistant") {
        const content = event.message?.content;
        const usage = event.message?.usage;
        const tokensIn = usage?.input_tokens ?? 0;
        const tokensOut = usage?.output_tokens ?? 0;

        if (Array.isArray(content)) {
          for (const item of content) {
            if (
              item !== null &&
              typeof item === "object" &&
              (item as Record<string, unknown>).type === "tool_use"
            ) {
              const toolItem = item as Record<string, unknown>;
              if (typeof toolItem.name !== "string") continue;
              const toolName = toolItem.name;
              const input = (toolItem.input ?? {}) as Record<string, unknown>;

              if (toolName === "Agent") {
                agents.push({ name: extractAgentName(input), weekMs: sessionWeekMs, tokensIn, tokensOut });
              } else if (toolName === "Skill") {
                skills.push({ name: extractSkillName(input), weekMs: sessionWeekMs, tokensIn, tokensOut });
              }
            }
          }
        }
      }
    }

    const data: TrendsSessionData = {
      fileSize: stat.size,
      mtime: stat.mtimeMs,
      offset: newOffset,
      commands,
      agents,
      skills,
    };
    trendsSessionCache.set(cacheKey, data);
    return data;
  } catch {
    return { fileSize: stat.size, mtime: stat.mtimeMs, offset: fromOffset, commands, agents, skills };
  }
}

// === Linear regression ===

function linearRegressionSlope(y: number[]): number {
  const n = y.length;
  if (n < 2) return 0;
  const sumX = (n * (n - 1)) / 2;
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = y.reduce((s, v, i) => s + i * v, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function computeVerdict(weeklyTotals: number[]): TrendVerdict {
  const slope = linearRegressionSlope(weeklyTotals);
  const avg = weeklyTotals.reduce((s, v) => s + v, 0) / weeklyTotals.length;
  if (avg === 0) return "stable";
  const relSlope = slope / avg;
  if (relSlope > 0.05) return "improving";
  if (relSlope < -0.05) return "regressing";
  return "stable";
}

// === Entry aggregation ===

interface RawEntry {
  weekMs: number;
  tokensIn: number;
  tokensOut: number;
}

function aggregateEntries(
  items: Array<{ name: string; weekMs: number; tokensIn: number; tokensOut: number }>,
  bucketStart: number,
  numWeeks: number
): InsightsTrendEntry[] {
  // Group by name
  const byName = new Map<string, RawEntry[]>();
  for (const item of items) {
    const list = byName.get(item.name) ?? [];
    list.push({ weekMs: item.weekMs, tokensIn: item.tokensIn, tokensOut: item.tokensOut });
    byName.set(item.name, list);
  }

  const entries: InsightsTrendEntry[] = [];
  for (const [name, rawList] of byName) {
    const weeklyIn = new Array<number>(numWeeks).fill(0);
    const weeklyOut = new Array<number>(numWeeks).fill(0);
    const weeklyCalls = new Array<number>(numWeeks).fill(0);
    let totalIn = 0;
    let totalOut = 0;

    for (const raw of rawList) {
      const weekIdx = Math.min(numWeeks - 1, Math.max(0, Math.floor((raw.weekMs - bucketStart) / WEEK_MS)));
      weeklyIn[weekIdx] += raw.tokensIn;
      weeklyOut[weekIdx] += raw.tokensOut;
      weeklyCalls[weekIdx]++;
      totalIn += raw.tokensIn;
      totalOut += raw.tokensOut;
    }

    const calls = rawList.length;
    const weekly = weeklyIn.map((inVal, i) => ({ in: inVal, out: weeklyOut[i] }));
    const verdict = computeVerdict(weeklyIn.map((inVal, i) => inVal + weeklyOut[i]));

    entries.push({
      name,
      calls,
      avgIn: calls > 0 ? totalIn / calls : 0,
      avgOut: calls > 0 ? totalOut / calls : 0,
      weekly,
      verdict,
    });
  }

  // Sort by calls desc, return max 20
  return entries.sort((a, b) => b.calls - a.calls).slice(0, 20);
}

// === Main export ===

export function computeInsightsTrends(
  sessions: SessionInfo[],
  timeRange: InsightsTimeRange,
  repo: string
): InsightsTrends {
  const fromMs = getTimeRangeCutoff(timeRange);

  // Filter sessions by startTime and repo
  const filtered = sessions.filter((s) => {
    const t = new Date(s.startTime).getTime();
    if (fromMs > 0 && t < fromMs) return false;
    if (repo !== "all" && s.cwd !== repo) return false;
    return true;
  });

  if (filtered.length === 0) {
    return { commands: [], agents: [], skills: [] };
  }

  // Determine bucket range using earliest session startTime within filtered set
  const sessionTimes = filtered.map((s) => new Date(s.startTime).getTime());
  const earliestMs = sessionTimes.reduce((min, t) => t < min ? t : min, sessionTimes[0]);
  const latestMs = sessionTimes.reduce((max, t) => t > max ? t : max, sessionTimes[0]);
  const totalMs = latestMs - earliestMs;
  const numWeeks = Math.max(1, Math.ceil((totalMs + WEEK_MS) / WEEK_MS));
  const bucketStart = earliestMs;

  // Collect all raw entries
  const allCommands: Array<{ name: string; weekMs: number; tokensIn: number; tokensOut: number }> = [];
  const allAgents: Array<{ name: string; weekMs: number; tokensIn: number; tokensOut: number }> = [];
  const allSkills: Array<{ name: string; weekMs: number; tokensIn: number; tokensOut: number }> = [];

  for (const session of filtered) {
    const data = computeTrendsSessionData(session);
    allCommands.push(...data.commands);
    allAgents.push(...data.agents);
    allSkills.push(...data.skills);
  }

  return {
    commands: aggregateEntries(allCommands, bucketStart, numWeeks),
    agents: aggregateEntries(allAgents, bucketStart, numWeeks),
    skills: aggregateEntries(allSkills, bucketStart, numWeeks),
  };
}
