import { discoverSessions } from "../parser/session-discovery.js";

export function listSessions(): string {
  const sessions = discoverSessions();

  if (sessions.length === 0) {
    return "No Claude Code sessions found in ~/.claude/projects/";
  }

  const lines = sessions.slice(0, 20).map((s, i) => {
    const date = new Date(s.lastModified).toLocaleString();
    return `${i + 1}. [${s.projectHash}] ${s.id} — ${s.eventCount} events, ${s.subagentCount} subagents (${date})`;
  });

  return `Found ${sessions.length} sessions:\n\n${lines.join("\n")}`;
}
