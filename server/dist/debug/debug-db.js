import Database from "better-sqlite3";
// ---- Schema DDL ----
const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS sessions (
  sessionId   TEXT PRIMARY KEY,
  projectHash TEXT,
  cwd         TEXT,
  model       TEXT,
  startTime   TEXT,
  lastUpdated TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId   TEXT NOT NULL REFERENCES sessions(sessionId) ON DELETE CASCADE,
  turnNumber  INTEGER NOT NULL,
  promptText  TEXT,
  startTime   TEXT,
  endTime     TEXT,
  status      TEXT,
  UNIQUE(sessionId, turnNumber)
);

CREATE TABLE IF NOT EXISTS agent_lifecycles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId     TEXT NOT NULL REFERENCES sessions(sessionId) ON DELETE CASCADE,
  turnNumber    INTEGER,
  agentId       TEXT NOT NULL,
  agentType     TEXT,
  parentAgentId TEXT,
  spawnedAt     TEXT,
  completedAt   TEXT,
  status        TEXT,
  description   TEXT,
  UNIQUE(sessionId, turnNumber, agentId)
);

CREATE TABLE IF NOT EXISTS lifecycle_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId       TEXT NOT NULL,
  turnNumber      INTEGER,
  agentId         TEXT,
  eventType       TEXT NOT NULL,
  eventJson       TEXT,
  timestamp       TEXT,
  toolName        TEXT,
  toolResultError INTEGER DEFAULT 0,
  eventUuid       TEXT NOT NULL,
  UNIQUE(sessionId, eventUuid)
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(sessionId);
CREATE INDEX IF NOT EXISTS idx_agent_lifecycles_session ON agent_lifecycles(sessionId);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_session ON lifecycle_events(sessionId);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_timestamp ON lifecycle_events(sessionId, timestamp);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_agent ON lifecycle_events(sessionId, agentId);
`;
// ---- DebugDB class ----
export class DebugDB {
    db;
    stmts;
    /**
     * Factory method. Returns null if NODE_ENV !== 'development'.
     */
    static open(dbPath) {
        if (process.env.NODE_ENV !== "development") {
            return null;
        }
        return new DebugDB(new Database(dbPath));
    }
    constructor(db) {
        this.db = db;
        this.db.pragma("journal_mode = WAL");
        this.db.pragma("foreign_keys = ON");
        this.db.exec(SCHEMA_DDL);
        this.stmts = {
            upsertSession: this.db.prepare(`
        INSERT INTO sessions (sessionId, projectHash, cwd, model, startTime, lastUpdated)
        VALUES (@sessionId, @projectHash, @cwd, @model, @startTime, @lastUpdated)
        ON CONFLICT(sessionId) DO UPDATE SET
          projectHash = COALESCE(@projectHash, sessions.projectHash),
          cwd = COALESCE(@cwd, sessions.cwd),
          model = COALESCE(@model, sessions.model),
          startTime = COALESCE(@startTime, sessions.startTime),
          lastUpdated = COALESCE(@lastUpdated, sessions.lastUpdated)
      `),
            upsertTurn: this.db.prepare(`
        INSERT OR REPLACE INTO turns (sessionId, turnNumber, promptText, startTime, endTime, status)
        VALUES (@sessionId, @turnNumber, @promptText, @startTime, @endTime, @status)
      `),
            upsertAgentLifecycle: this.db.prepare(`
        INSERT OR REPLACE INTO agent_lifecycles (sessionId, turnNumber, agentId, agentType, parentAgentId, spawnedAt, completedAt, status, description)
        VALUES (@sessionId, @turnNumber, @agentId, @agentType, @parentAgentId, @spawnedAt, @completedAt, @status, @description)
      `),
            insertEvent: this.db.prepare(`
        INSERT OR IGNORE INTO lifecycle_events (sessionId, turnNumber, agentId, eventType, eventJson, timestamp, toolName, toolResultError, eventUuid)
        VALUES (@sessionId, @turnNumber, @agentId, @eventType, @eventJson, @timestamp, @toolName, @toolResultError, @eventUuid)
      `),
            getSession: this.db.prepare(`SELECT * FROM sessions WHERE sessionId = ?`),
            getSessions: this.db.prepare(`SELECT * FROM sessions ORDER BY lastUpdated DESC`),
            getTurnsBySession: this.db.prepare(`SELECT * FROM turns WHERE sessionId = ? ORDER BY turnNumber`),
            getLifecyclesBySession: this.db.prepare(`SELECT * FROM agent_lifecycles WHERE sessionId = ?`),
            getLifecyclesBySessionAndTurn: this.db.prepare(`SELECT * FROM agent_lifecycles WHERE sessionId = ? AND turnNumber = ?`),
            getEventsBySession: this.db.prepare(`SELECT * FROM lifecycle_events WHERE sessionId = ? ORDER BY id`),
            getEventsBySessionAndTurn: this.db.prepare(`SELECT * FROM lifecycle_events WHERE sessionId = ? AND turnNumber = ? ORDER BY id`),
            getEventsBySessionAndAgent: this.db.prepare(`SELECT * FROM lifecycle_events WHERE sessionId = ? AND agentId = ? ORDER BY id`),
            getEventsBySessionTurnAndAgent: this.db.prepare(`SELECT * FROM lifecycle_events WHERE sessionId = ? AND turnNumber = ? AND agentId = ? ORDER BY id`),
            deleteSession: this.db.prepare(`DELETE FROM sessions WHERE sessionId = ?`),
            deleteSessionEvents: this.db.prepare(`DELETE FROM lifecycle_events WHERE sessionId = ?`),
            getEventsUpTo: this.db.prepare(`
        SELECT * FROM lifecycle_events
        WHERE sessionId = ? AND turnNumber = ?
        ORDER BY id
        LIMIT ?
      `),
            getAgentsForEvents: this.db.prepare(`
        SELECT DISTINCT al.* FROM agent_lifecycles al
        WHERE al.sessionId = ? AND al.turnNumber = ? AND al.agentId IN (
          SELECT DISTINCT le.agentId FROM lifecycle_events le
          WHERE le.sessionId = ? AND le.turnNumber = ?
          ORDER BY le.id
          LIMIT ?
        )
      `),
        };
    }
    // ---- Write methods ----
    upsertSession(info) {
        this.stmts.upsertSession.run({
            sessionId: info.sessionId,
            projectHash: info.projectHash ?? null,
            cwd: info.cwd ?? null,
            model: info.model ?? null,
            startTime: info.startTime ?? null,
            lastUpdated: info.lastUpdated ?? null,
        });
    }
    upsertTurn(turn) {
        this.stmts.upsertTurn.run({
            sessionId: turn.sessionId,
            turnNumber: turn.turnNumber,
            promptText: turn.promptText ?? null,
            startTime: turn.startTime ?? null,
            endTime: turn.endTime ?? null,
            status: turn.status ?? null,
        });
    }
    upsertAgentLifecycle(lifecycle) {
        this.stmts.upsertAgentLifecycle.run({
            sessionId: lifecycle.sessionId,
            turnNumber: lifecycle.turnNumber ?? null,
            agentId: lifecycle.agentId,
            agentType: lifecycle.agentType ?? null,
            parentAgentId: lifecycle.parentAgentId ?? null,
            spawnedAt: lifecycle.spawnedAt ?? null,
            completedAt: lifecycle.completedAt ?? null,
            status: lifecycle.status ?? null,
            description: lifecycle.description ?? null,
        });
    }
    insertEvent(event) {
        const result = this.stmts.insertEvent.run({
            sessionId: event.sessionId,
            turnNumber: event.turnNumber ?? null,
            agentId: event.agentId ?? null,
            eventType: event.eventType,
            eventJson: event.eventJson ?? null,
            timestamp: event.timestamp ?? null,
            toolName: event.toolName ?? null,
            toolResultError: event.toolResultError ? 1 : 0,
            eventUuid: event.eventUuid,
        });
        return result.changes > 0;
    }
    insertEventBatch(events) {
        const tx = this.db.transaction((items) => {
            let inserted = 0;
            for (const item of items) {
                if (this.insertEvent(item)) {
                    inserted++;
                }
            }
            return inserted;
        });
        return tx(events);
    }
    // ---- Read methods ----
    getSession(sessionId) {
        return this.stmts.getSession.get(sessionId);
    }
    getSessions() {
        return this.stmts.getSessions.all();
    }
    getTurns(sessionId) {
        return this.stmts.getTurnsBySession.all(sessionId);
    }
    getAgentLifecycles(sessionId, turnNumber) {
        if (turnNumber !== undefined) {
            return this.stmts.getLifecyclesBySessionAndTurn.all(sessionId, turnNumber);
        }
        return this.stmts.getLifecyclesBySession.all(sessionId);
    }
    getLifecycleEvents(sessionId, turnNumber, agentId) {
        if (turnNumber !== undefined && agentId !== undefined) {
            return this.stmts.getEventsBySessionTurnAndAgent.all(sessionId, turnNumber, agentId);
        }
        if (agentId !== undefined) {
            return this.stmts.getEventsBySessionAndAgent.all(sessionId, agentId);
        }
        if (turnNumber !== undefined) {
            return this.stmts.getEventsBySessionAndTurn.all(sessionId, turnNumber);
        }
        return this.stmts.getEventsBySession.all(sessionId);
    }
    getGraphAtEvent(sessionId, turnNumber, upToEventIndex) {
        const events = this.stmts.getEventsUpTo.all(sessionId, turnNumber, upToEventIndex);
        const agents = this.stmts.getAgentsForEvents.all(sessionId, turnNumber, sessionId, turnNumber, upToEventIndex);
        return { agents, events };
    }
    // ---- Maintenance ----
    deleteSession(sessionId) {
        // Delete lifecycle_events first (no FK cascade since we dropped lifecycleId FK)
        this.stmts.deleteSessionEvents.run(sessionId);
        // Delete session — cascades to turns and agent_lifecycles via FK
        this.stmts.deleteSession.run(sessionId);
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=debug-db.js.map