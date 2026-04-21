import { describe, it, expect, beforeEach } from "vitest";
import { CollectorBuffer } from "./buffer.js";
import type { SessionEvent, SessionInfo } from "../types.js";

function makeInfo(id: string, source: string): SessionInfo {
  return {
    id,
    projectHash: "hash-" + id,
    path: "/remote/.claude/projects/hash-" + id + "/" + id + ".jsonl",
    startTime: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    eventCount: 0,
    subagentCount: 0,
    source,
  };
}

function makeEvent(sessionId: string): SessionEvent {
  return {
    type: "system",
    uuid: "uuid-1",
    timestamp: new Date().toISOString(),
    sessionId,
    subtype: "init",
  };
}

describe("CollectorBuffer", () => {
  let buf: CollectorBuffer;

  beforeEach(() => {
    buf = new CollectorBuffer();
  });

  it("starts empty", () => {
    expect(buf.getSessions()).toHaveLength(0);
  });

  it("registers a session", () => {
    const info = makeInfo("s1", "remote:dev.box");
    buf.upsertSession(info);
    expect(buf.getSessions()).toHaveLength(1);
    expect(buf.getSessions()[0].id).toBe("s1");
  });

  it("adds events to a session", () => {
    const info = makeInfo("s1", "remote:dev.box");
    buf.upsertSession(info);
    buf.addEvents("s1", [makeEvent("s1")]);
    expect(buf.getEvents("s1")).toHaveLength(1);
  });

  it("returns empty array for unknown session events", () => {
    expect(buf.getEvents("nonexistent")).toHaveLength(0);
  });

  it("removes all sessions for a source", () => {
    buf.upsertSession(makeInfo("s1", "docker:app"));
    buf.upsertSession(makeInfo("s2", "docker:app"));
    buf.upsertSession(makeInfo("s3", "remote:dev.box"));
    buf.removeSource("docker:app");
    expect(buf.getSessions()).toHaveLength(1);
    expect(buf.getSessions()[0].id).toBe("s3");
  });
});
