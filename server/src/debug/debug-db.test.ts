import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DebugDB } from "./debug-db.js";
import type {
  SessionRow,
  TurnRow,
  AgentLifecycleRow,
  LifecycleEventRow,
} from "./debug-db.js";

/** Helper: temporarily set NODE_ENV=development, open :memory: DB, restore env */
function createTestDB(): DebugDB {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  const db = DebugDB.open(":memory:");
  process.env.NODE_ENV = prev;
  return db!;
}

describe("DebugDB", () => {
  let db: DebugDB;

  beforeEach(() => {
    db = createTestDB();
  });

  afterEach(() => {
    db.close();
  });

  // ---- 1. NODE_ENV gating ----

  it("open() returns null when NODE_ENV !== development", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const result = DebugDB.open(":memory:");
    process.env.NODE_ENV = prev;
    expect(result).toBeNull();
  });

  it("open() creates tables when NODE_ENV is development", () => {
    // If we got here via createTestDB(), the DB was created successfully.
    // Verify tables exist by querying sqlite_master.
    const session = db.getSession("nonexistent");
    expect(session).toBeUndefined();

    const turns = db.getTurns("nonexistent");
    expect(turns).toEqual([]);

    const lifecycles = db.getAgentLifecycles("nonexistent");
    expect(lifecycles).toEqual([]);

    const events = db.getLifecycleEvents("nonexistent");
    expect(events).toEqual([]);
  });

  // ---- 3. Upsert session ----

  it("upserts session metadata", () => {
    db.upsertSession({
      sessionId: "s1",
      projectHash: "abc",
      cwd: "/tmp",
      model: "claude-sonnet-4-6",
      startTime: "2026-03-28T10:00:00Z",
      lastUpdated: "2026-03-28T10:01:00Z",
    });

    const row = db.getSession("s1");
    expect(row).toBeDefined();
    expect(row!.sessionId).toBe("s1");
    expect(row!.projectHash).toBe("abc");
    expect(row!.cwd).toBe("/tmp");
    expect(row!.model).toBe("claude-sonnet-4-6");
    expect(row!.startTime).toBe("2026-03-28T10:00:00Z");
    expect(row!.lastUpdated).toBe("2026-03-28T10:01:00Z");

    // Update the session — model changes
    db.upsertSession({
      sessionId: "s1",
      model: "claude-opus-4-6",
      lastUpdated: "2026-03-28T10:05:00Z",
    });

    const updated = db.getSession("s1");
    expect(updated!.model).toBe("claude-opus-4-6");
    expect(updated!.lastUpdated).toBe("2026-03-28T10:05:00Z");
  });

  // ---- 4. Upsert turn ----

  it("upserts turn", () => {
    db.upsertSession({ sessionId: "s1" });
    db.upsertTurn({
      sessionId: "s1",
      turnNumber: 1,
      promptText: "Hello",
      startTime: "2026-03-28T10:00:00Z",
      status: "active",
    });

    const turns = db.getTurns("s1");
    expect(turns).toHaveLength(1);
    expect(turns[0].turnNumber).toBe(1);
    expect(turns[0].promptText).toBe("Hello");
    expect(turns[0].status).toBe("active");

    // Update turn status
    db.upsertTurn({
      sessionId: "s1",
      turnNumber: 1,
      endTime: "2026-03-28T10:01:00Z",
      status: "completed",
    });

    const updated = db.getTurns("s1");
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe("completed");
    expect(updated[0].endTime).toBe("2026-03-28T10:01:00Z");
  });

  // ---- 5. Upsert agent lifecycle ----

  it("upserts agent lifecycle", () => {
    db.upsertSession({ sessionId: "s1" });
    db.upsertAgentLifecycle({
      sessionId: "s1",
      turnNumber: 1,
      agentId: "agent-1",
      agentType: "main",
      spawnedAt: "2026-03-28T10:00:00Z",
      status: "active",
    });

    const lifecycles = db.getAgentLifecycles("s1");
    expect(lifecycles).toHaveLength(1);
    expect(lifecycles[0].agentId).toBe("agent-1");
    expect(lifecycles[0].agentType).toBe("main");
    expect(lifecycles[0].status).toBe("active");

    // Update — agent completes
    db.upsertAgentLifecycle({
      sessionId: "s1",
      turnNumber: 1,
      agentId: "agent-1",
      completedAt: "2026-03-28T10:05:00Z",
      status: "completed",
    });

    const updated = db.getAgentLifecycles("s1");
    expect(updated).toHaveLength(1);
    expect(updated[0].status).toBe("completed");
    expect(updated[0].completedAt).toBe("2026-03-28T10:05:00Z");
  });

  // ---- 6. Insert lifecycle event ----

  it("inserts lifecycle event", () => {
    db.upsertSession({ sessionId: "s1" });

    const inserted = db.insertEvent({
      sessionId: "s1",
      turnNumber: 1,
      agentId: "agent-1",
      eventType: "assistant",
      eventJson: '{"type":"assistant"}',
      timestamp: "2026-03-28T10:00:00Z",
      toolName: "Read",
      toolResultError: false,
      eventUuid: "uuid-1",
    });

    expect(inserted).toBe(true);

    const events = db.getLifecycleEvents("s1");
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("assistant");
    expect(events[0].toolName).toBe("Read");
    expect(events[0].toolResultError).toBe(0);
    expect(events[0].eventUuid).toBe("uuid-1");
  });

  // ---- 7. Dedup by eventUuid ----

  it("deduplicates events by eventUuid (INSERT OR IGNORE)", () => {
    db.upsertSession({ sessionId: "s1" });

    const first = db.insertEvent({
      sessionId: "s1",
      eventType: "assistant",
      eventUuid: "uuid-1",
      timestamp: "2026-03-28T10:00:00Z",
    });
    const second = db.insertEvent({
      sessionId: "s1",
      eventType: "assistant",
      eventUuid: "uuid-1",
      timestamp: "2026-03-28T10:00:00Z",
    });

    expect(first).toBe(true);
    expect(second).toBe(false);

    const events = db.getLifecycleEvents("s1");
    expect(events).toHaveLength(1);
  });

  // ---- 8. Batch insert ----

  it("batch inserts events in transaction", () => {
    db.upsertSession({ sessionId: "s1" });

    const count = db.insertEventBatch([
      { sessionId: "s1", eventType: "user", eventUuid: "u1", timestamp: "2026-03-28T10:00:00Z" },
      { sessionId: "s1", eventType: "assistant", eventUuid: "u2", timestamp: "2026-03-28T10:00:01Z" },
      { sessionId: "s1", eventType: "assistant", eventUuid: "u1", timestamp: "2026-03-28T10:00:00Z" }, // dup
    ]);

    expect(count).toBe(2);

    const events = db.getLifecycleEvents("s1");
    expect(events).toHaveLength(2);
  });

  // ---- 9. Query turns by session ----

  it("queries turns by session", () => {
    db.upsertSession({ sessionId: "s1" });
    db.upsertSession({ sessionId: "s2" });

    db.upsertTurn({ sessionId: "s1", turnNumber: 1, status: "completed" });
    db.upsertTurn({ sessionId: "s1", turnNumber: 2, status: "active" });
    db.upsertTurn({ sessionId: "s2", turnNumber: 1, status: "active" });

    const s1Turns = db.getTurns("s1");
    expect(s1Turns).toHaveLength(2);
    expect(s1Turns[0].turnNumber).toBe(1);
    expect(s1Turns[1].turnNumber).toBe(2);

    const s2Turns = db.getTurns("s2");
    expect(s2Turns).toHaveLength(1);
  });

  // ---- 10. Query agent lifecycles by session and turn ----

  it("queries agent lifecycles by session and turn", () => {
    db.upsertSession({ sessionId: "s1" });
    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "a1" });
    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "a2" });
    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 2, agentId: "a3" });

    // All lifecycles for session
    const all = db.getAgentLifecycles("s1");
    expect(all).toHaveLength(3);

    // Filtered by turn
    const turn1 = db.getAgentLifecycles("s1", 1);
    expect(turn1).toHaveLength(2);
    expect(turn1.map((l) => l.agentId).sort()).toEqual(["a1", "a2"]);

    const turn2 = db.getAgentLifecycles("s1", 2);
    expect(turn2).toHaveLength(1);
    expect(turn2[0].agentId).toBe("a3");
  });

  // ---- 11. Query lifecycle events filtered by agentId ----

  it("queries lifecycle events filtered by agentId", () => {
    db.upsertSession({ sessionId: "s1" });

    db.insertEvent({ sessionId: "s1", agentId: "a1", eventType: "user", eventUuid: "e1" });
    db.insertEvent({ sessionId: "s1", agentId: "a1", eventType: "assistant", eventUuid: "e2" });
    db.insertEvent({ sessionId: "s1", agentId: "a2", eventType: "user", eventUuid: "e3" });

    const a1Events = db.getLifecycleEvents("s1", undefined, "a1");
    expect(a1Events).toHaveLength(2);

    const a2Events = db.getLifecycleEvents("s1", undefined, "a2");
    expect(a2Events).toHaveLength(1);
  });

  // ---- 12. getGraphAtEvent ----

  it("getGraphAtEvent returns partial state up to event index", () => {
    db.upsertSession({ sessionId: "s1" });
    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "a1", status: "active" });
    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "a2", status: "active" });

    // Insert events in order — IDs will be 1, 2, 3, 4
    db.insertEvent({ sessionId: "s1", turnNumber: 1, agentId: "a1", eventType: "user", eventUuid: "e1", timestamp: "2026-03-28T10:00:00Z" });
    db.insertEvent({ sessionId: "s1", turnNumber: 1, agentId: "a1", eventType: "assistant", eventUuid: "e2", timestamp: "2026-03-28T10:00:01Z" });
    db.insertEvent({ sessionId: "s1", turnNumber: 1, agentId: "a2", eventType: "user", eventUuid: "e3", timestamp: "2026-03-28T10:00:02Z" });
    db.insertEvent({ sessionId: "s1", turnNumber: 1, agentId: "a2", eventType: "assistant", eventUuid: "e4", timestamp: "2026-03-28T10:00:03Z" });

    // Get graph up to event index 2 (first 2 events)
    const partial = db.getGraphAtEvent("s1", 1, 2);
    expect(partial.events).toHaveLength(2);
    expect(partial.events.map((e) => e.eventUuid)).toEqual(["e1", "e2"]);
    // Agents visible: only a1 had events in that range
    expect(partial.agents.length).toBeGreaterThanOrEqual(1);
    expect(partial.agents.some((a) => a.agentId === "a1")).toBe(true);

    // Get graph up to event index 4 (all events)
    const full = db.getGraphAtEvent("s1", 1, 4);
    expect(full.events).toHaveLength(4);
    expect(full.agents).toHaveLength(2);
  });

  // ---- 13. Upsert idempotency ----

  it("upsert is idempotent — re-inserting same data updates, does not duplicate", () => {
    db.upsertSession({ sessionId: "s1", model: "claude-sonnet-4-6" });
    db.upsertSession({ sessionId: "s1", model: "claude-sonnet-4-6" });

    const sessions = db.getSessions();
    expect(sessions).toHaveLength(1);

    db.upsertTurn({ sessionId: "s1", turnNumber: 1, status: "active" });
    db.upsertTurn({ sessionId: "s1", turnNumber: 1, status: "active" });

    const turns = db.getTurns("s1");
    expect(turns).toHaveLength(1);

    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "a1" });
    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "a1" });

    const lifecycles = db.getAgentLifecycles("s1");
    expect(lifecycles).toHaveLength(1);
  });

  // ---- 14. deleteSession cascades ----

  it("deleteSession cascades to turns and agent_lifecycles", () => {
    db.upsertSession({ sessionId: "s1" });
    db.upsertTurn({ sessionId: "s1", turnNumber: 1 });
    db.upsertAgentLifecycle({ sessionId: "s1", turnNumber: 1, agentId: "a1" });
    db.insertEvent({ sessionId: "s1", turnNumber: 1, agentId: "a1", eventType: "user", eventUuid: "e1" });

    db.deleteSession("s1");

    expect(db.getSession("s1")).toBeUndefined();
    expect(db.getTurns("s1")).toEqual([]);
    expect(db.getAgentLifecycles("s1")).toEqual([]);
    // lifecycle_events are also cleaned up (manual DELETE, no FK)
    expect(db.getLifecycleEvents("s1")).toEqual([]);
  });
});
