import type { SessionInfo } from "../../types.js";
import type { PatternResult, EvidenceSession } from "./types.js";

function dayKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export function detectSessionFragmentation(sessions: SessionInfo[]): PatternResult {
  const groups = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const key = `${s.projectHash}:${dayKey(s.startTime)}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const evidenceSessions: EvidenceSession[] = [];
  let totalFragmented = 0;
  let couldBe = 0;

  for (const [, group] of groups) {
    const shortSessions = group.filter((s) => s.eventCount < 15);
    if (shortSessions.length >= 3) {
      totalFragmented += shortSessions.length;
      couldBe++;
      for (const s of shortSessions) {
        evidenceSessions.push({ id: s.id, detail: `${s.eventCount} events`, cost: 0 });
      }
    }
  }

  const detected = totalFragmented >= 3;
  return {
    category: "session_fragmentation",
    detected,
    impact: totalFragmented * 0.3,
    icon: "layers",
    punchline: detected
      ? `You started ${totalFragmented} sessions that could have been ${couldBe}. Continuing a session reuses cached context — faster and cheaper.`
      : "",
    evidence: {
      sessions: evidenceSessions,
      recommendation: "Instead of starting a new session for follow-up work on the same project, continue the existing one. Claude keeps context cached within a session, so follow-ups are faster and cheaper.",
      stats: { totalFragmented, consolidatedTo: couldBe },
    },
  };
}
