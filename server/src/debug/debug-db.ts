import Database from "better-sqlite3";

// ---- Row types returned by queries ----

export interface SessionRow {
  sessionId: string;
  projectHash: string | null;
  cwd: string | null;
  model: string | null;
  startTime: string | null;
  lastUpdated: string | null;
}

export interface TurnRow {
  id: number;
  sessionId: string;
  turnNumber: number;
  promptText: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string | null;
}

export interface AgentLifecycleRow {
  id: number;
  sessionId: string;
  turnNumber: number | null;
  agentId: string;
  agentType: string | null;
  parentAgentId: string | null;
  spawnedAt: string | null;
  completedAt: string | null;
  status: string | null;
  description: string | null;
}

export interface LifecycleEventRow {
  id: number;
  sessionId: string;
  turnNumber: number | null;
  agentId: string | null;
  eventType: string;
  eventJson: string | null;
  timestamp: string | null;
  toolName: string | null;
  toolResultError: number;
  eventUuid: string;
}

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

// ---- Prepared statement types ----

interface PreparedStatements {
  upsertSession: Database.Statement;
  upsertTurn: Database.Statement;
  upsertAgentLifecycle: Database.Statement;
  insertEvent: Database.Statement;
  getSession: Database.Statement;
  getSessions: Database.Statement;
  getTurnsBySession: Database.Statement;
  getLifecyclesBySession: Database.Statement;
  getLifecyclesBySessionAndTurn: Database.Statement;
  getEventsBySession: Database.Statement;
  getEventsBySessionAndTurn: Database.Statement;
  getEventsBySessionAndAgent: Database.Statement;
  getEventsBySessionTurnAndAgent: Database.Statement;
  deleteSession: Database.Statement;
  deleteSessionEvents: Database.Statement;
  getEventsUpTo: Database.Statement;
  getAgentsForEvents: Database.Statement;
}

// ---- DebugDB class ----

export class DebugDB {
  private db: Database.Database;
  private stmts: PreparedStatements;

  /**
   * Factory method. Returns null if NODE_ENV !== 'development'.
   */
  static open(dbPath: string): DebugDB | null {
    if (process.env.NODE_ENV !== "development") {
      return null;
    }
    return new DebugDB(new Database(dbPath));
  }

  private constructor(db: Database.Database) {
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

  upsertSession(info: {
    sessionId: string;
    projectHash?: string;
    cwd?: string;
    model?: string;
    startTime?: string;
    lastUpdated?: string;
  }): void {
    this.stmts.upsertSession.run({
      sessionId: info.sessionId,
      projectHash: info.projectHash ?? null,
      cwd: info.cwd ?? null,
      model: info.model ?? null,
      startTime: info.startTime ?? null,
      lastUpdated: info.lastUpdated ?? null,
    });
  }

  upsertTurn(turn: {
    sessionId: string;
    turnNumber: number;
    promptText?: string;
    startTime?: string;
    endTime?: string;
    status?: string;
  }): void {
    this.stmts.upsertTurn.run({
      sessionId: turn.sessionId,
      turnNumber: turn.turnNumber,
      promptText: turn.promptText ?? null,
      startTime: turn.startTime ?? null,
      endTime: turn.endTime ?? null,
      status: turn.status ?? null,
    });
  }

  upsertAgentLifecycle(lifecycle: {
    sessionId: string;
    turnNumber?: number;
    agentId: string;
    agentType?: string;
    parentAgentId?: string;
    spawnedAt?: string;
    completedAt?: string;
    status?: string;
    description?: string;
  }): void {
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

  insertEvent(event: {
    sessionId: string;
    turnNumber?: number;
    agentId?: string;
    eventType: string;
    eventJson?: string;
    timestamp?: string;
    toolName?: string;
    toolResultError?: boolean;
    eventUuid: string;
  }): boolean {
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

  insertEventBatch(events: Array<Parameters<DebugDB["insertEvent"]>[0]>): number {
    const tx = this.db.transaction((items: Array<Parameters<DebugDB["insertEvent"]>[0]>) => {
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

  getSession(sessionId: string): SessionRow | undefined {
    return this.stmts.getSession.get(sessionId) as SessionRow | undefined;
  }

  getSessions(): SessionRow[] {
    return this.stmts.getSessions.all() as SessionRow[];
  }

  getTurns(sessionId: string): TurnRow[] {
    return this.stmts.getTurnsBySession.all(sessionId) as TurnRow[];
  }

  getAgentLifecycles(sessionId: string, turnNumber?: number): AgentLifecycleRow[] {
    if (turnNumber !== undefined) {
      return this.stmts.getLifecyclesBySessionAndTurn.all(sessionId, turnNumber) as AgentLifecycleRow[];
    }
    return this.stmts.getLifecyclesBySession.all(sessionId) as AgentLifecycleRow[];
  }

  getLifecycleEvents(sessionId: string, turnNumber?: number, agentId?: string): LifecycleEventRow[] {
    if (turnNumber !== undefined && agentId !== undefined) {
      return this.stmts.getEventsBySessionTurnAndAgent.all(sessionId, turnNumber, agentId) as LifecycleEventRow[];
    }
    if (agentId !== undefined) {
      return this.stmts.getEventsBySessionAndAgent.all(sessionId, agentId) as LifecycleEventRow[];
    }
    if (turnNumber !== undefined) {
      return this.stmts.getEventsBySessionAndTurn.all(sessionId, turnNumber) as LifecycleEventRow[];
    }
    return this.stmts.getEventsBySession.all(sessionId) as LifecycleEventRow[];
  }

  getGraphAtEvent(
    sessionId: string,
    turnNumber: number,
    upToEventIndex: number,
  ): { agents: AgentLifecycleRow[]; events: LifecycleEventRow[] } {
    const events = this.stmts.getEventsUpTo.all(sessionId, turnNumber, upToEventIndex) as LifecycleEventRow[];
    const agents = this.stmts.getAgentsForEvents.all(
      sessionId, turnNumber, sessionId, turnNumber, upToEventIndex,
    ) as AgentLifecycleRow[];
    return { agents, events };
  }

  // ---- Maintenance ----

  deleteSession(sessionId: string): void {
    // Delete lifecycle_events first (no FK cascade since we dropped lifecycleId FK)
    this.stmts.deleteSessionEvents.run(sessionId);
    // Delete session — cascades to turns and agent_lifecycles via FK
    this.stmts.deleteSession.run(sessionId);
  }

  close(): void {
    this.db.close();
  }
}
