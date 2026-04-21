import type { SessionInfo, SessionEvent } from "../types.js";

interface BufferedSession {
  info: SessionInfo;
  events: SessionEvent[];
}

export class CollectorBuffer {
  private sessions = new Map<string, BufferedSession>();

  upsertSession(info: SessionInfo): void {
    const existing = this.sessions.get(info.id);
    this.sessions.set(info.id, {
      info,
      events: existing?.events ?? [],
    });
  }

  addEvents(sessionId: string, events: SessionEvent[]): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.events.push(...events);
      entry.info.eventCount = entry.events.length;
      entry.info.lastModified = new Date().toISOString();
    }
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((e) => e.info);
  }

  getEvents(sessionId: string): SessionEvent[] {
    return this.sessions.get(sessionId)?.events ?? [];
  }

  removeSource(source: string): void {
    for (const [id, entry] of this.sessions) {
      if (entry.info.source === source) {
        this.sessions.delete(id);
      }
    }
  }
}

/** Singleton — shared by hub (writer) and session routes (reader). */
export const collectorBuffer = new CollectorBuffer();
