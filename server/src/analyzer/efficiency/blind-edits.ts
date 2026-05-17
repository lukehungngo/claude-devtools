import type { SessionEvent } from "../../types.js";
import type { PatternResult, SessionWithEvents, EvidenceSession } from "./types.js";

const LOOKBACK = 10;

function extractFilePath(item: { input?: unknown }): string | undefined {
  const input = item.input as Record<string, unknown> | undefined;
  return (input?.file_path as string) ?? (input?.path as string) ?? undefined;
}

export function detectBlindEdits(sessions: SessionWithEvents[]): PatternResult {
  let totalEdits = 0;
  let blindEdits = 0;
  let editsWithRead = 0;
  const evidenceSessions: EvidenceSession[] = [];

  for (const { info, mainEvents } of sessions) {
    const toolCalls: Array<{ name: string; filePath?: string }> = [];
    for (const ev of mainEvents) {
      if (ev.type !== "assistant") continue;
      const content = Array.isArray(ev.message.content) ? ev.message.content : [];
      for (const item of content) {
        if (typeof item === "object" && item !== null && "type" in item && item.type === "tool_use") {
          const tu = item as { type: "tool_use"; name: string; input?: unknown };
          toolCalls.push({ name: tu.name, filePath: extractFilePath(tu) });
        }
      }
    }

    let sessionBlind = 0;
    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i]!;
      if (call.name !== "Edit" && call.name !== "Write") continue;
      if (!call.filePath) continue;
      totalEdits++;

      const start = Math.max(0, i - LOOKBACK);
      const hasRead = toolCalls.slice(start, i).some(
        (c) => c.name === "Read" && c.filePath === call.filePath
      );

      if (hasRead) {
        editsWithRead++;
      } else {
        blindEdits++;
        sessionBlind++;
      }
    }

    if (sessionBlind > 0) {
      evidenceSessions.push({
        id: info.id,
        detail: `${sessionBlind} edits without prior Read`,
        cost: 0,
      });
    }
  }

  const ratio = totalEdits > 0 ? editsWithRead / totalEdits : 1;
  const detected = totalEdits >= 3 && ratio < 0.7;

  return {
    category: "blind_edits",
    detected,
    impact: blindEdits * 0.5,
    icon: "eye-off",
    punchline: detected
      ? `${Math.round((1 - ratio) * 100)}% of your edits had no prior Read. Sessions with file context first had higher first-try success.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Before editing a file, ask Claude to read it first. This gives Claude the actual file contents instead of guessing, leading to fewer failed edits.",
      stats: { totalEdits, blindEdits, editsWithRead, ratio: Math.round(ratio * 100) },
    },
  };
}
