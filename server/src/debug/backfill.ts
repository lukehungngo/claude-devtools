import { discoverSessions, loadFullSession } from "../parser/session-discovery.js";
import { buildLifecycleRecords } from "./lifecycle-builder.js";
import type { DebugDB } from "./debug-db.js";

/**
 * Backfill the debug DB with all existing sessions.
 * Runs synchronously on startup — only populates sessions not already in the DB.
 * Skips individual session failures so one bad JSONL doesn't block the rest.
 */
export function backfillDebugDb(db: DebugDB): void {
  const existing = new Set(db.getSessions().map((s) => s.sessionId));
  const sessions = discoverSessions();
  const toBackfill = sessions.filter((s) => !existing.has(s.id));

  if (toBackfill.length === 0) return;

  console.log(`[debug-db] Backfilling ${toBackfill.length} sessions...`);

  let count = 0;
  for (const session of toBackfill) {
    try {
      const { mainEvents, subagentEvents, subagentMeta } = loadFullSession(session);

      const allEvents = [
        ...mainEvents,
        ...Array.from(subagentEvents.values()).flat(),
      ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      if (allEvents.length === 0) continue;

      const records = buildLifecycleRecords(session.id, allEvents, subagentMeta);

      db.upsertSession({
        sessionId: session.id,
        projectHash: session.projectHash,
        cwd: session.cwd,
        model: session.model,
        startTime: session.startTime,
        lastUpdated: session.lastModified,
      });

      for (const turn of records.turns) {
        db.upsertTurn(turn);
      }

      for (const lifecycle of records.agentLifecycles) {
        db.upsertAgentLifecycle({
          ...lifecycle,
          parentAgentId: lifecycle.parentAgentId ?? undefined,
          completedAt: lifecycle.completedAt ?? undefined,
          description: lifecycle.description ?? undefined,
        });
      }

      db.insertEventBatch(
        records.lifecycleEvents.map((e) => ({
          ...e,
          toolName: e.toolName ?? undefined,
        }))
      );

      count++;
    } catch (err) {
      console.warn(`[debug-db] Skipping session ${session.id}:`, err);
    }
  }

  console.log(`[debug-db] Backfilled ${count} sessions.`);
}
