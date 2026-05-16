import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadDaemonTasks,
  type DaemonTaskRecord,
} from "./daemon-task-discovery.js";

function makeTask(
  dir: string,
  filename: string,
  payload: Record<string, unknown>,
): void {
  writeFileSync(join(dir, filename), JSON.stringify(payload), "utf-8");
}

let rootDir: string;
let sessionId: string;
let sessionDir: string;

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), "daemon-tasks-test-"));
  sessionId = "sess-test-001";
  sessionDir = join(rootDir, sessionId);
  mkdirSync(sessionDir, { recursive: true });
});

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe("loadDaemonTasks", () => {
  it("returns parsed records from valid JSON files in the session dir", () => {
    makeTask(sessionDir, "1.json", {
      id: "1",
      subject: "First task",
      status: "completed",
      blocks: [],
      blockedBy: [],
    });
    makeTask(sessionDir, "2.json", {
      id: "2",
      subject: "Second task",
      description: "Has a longer description",
      activeForm: "Doing second task",
      status: "in_progress",
      blocks: ["3"],
      blockedBy: ["1"],
    });

    const tasks = loadDaemonTasks(sessionId, { dir: rootDir });
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject<Partial<DaemonTaskRecord>>({
      id: "1",
      subject: "First task",
      status: "completed",
      blocks: [],
      blockedBy: [],
    });
    expect(tasks[1]).toMatchObject<Partial<DaemonTaskRecord>>({
      id: "2",
      subject: "Second task",
      description: "Has a longer description",
      activeForm: "Doing second task",
      status: "in_progress",
      blocks: ["3"],
      blockedBy: ["1"],
    });
  });

  it("sorts records numerically by id (10 after 2, not before)", () => {
    makeTask(sessionDir, "10.json", {
      id: "10",
      subject: "Tenth",
      status: "pending",
      blocks: [],
      blockedBy: [],
    });
    makeTask(sessionDir, "2.json", {
      id: "2",
      subject: "Second",
      status: "pending",
      blocks: [],
      blockedBy: [],
    });
    makeTask(sessionDir, "1.json", {
      id: "1",
      subject: "First",
      status: "pending",
      blocks: [],
      blockedBy: [],
    });

    const ids = loadDaemonTasks(sessionId, { dir: rootDir }).map((t) => t.id);
    expect(ids).toEqual(["1", "2", "10"]);
  });

  it("skips dotfiles (.lock, .highwatermark) and non-JSON files", () => {
    makeTask(sessionDir, "1.json", {
      id: "1",
      subject: "Only real task",
      status: "completed",
      blocks: [],
      blockedBy: [],
    });
    writeFileSync(join(sessionDir, ".lock"), "", "utf-8");
    writeFileSync(join(sessionDir, ".highwatermark"), "3", "utf-8");
    writeFileSync(join(sessionDir, "README.md"), "notes", "utf-8");

    const tasks = loadDaemonTasks(sessionId, { dir: rootDir });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].subject).toBe("Only real task");
  });

  it("skips malformed JSON files but returns the readable ones", () => {
    makeTask(sessionDir, "1.json", {
      id: "1",
      subject: "Good",
      status: "completed",
      blocks: [],
      blockedBy: [],
    });
    writeFileSync(join(sessionDir, "2.json"), "{not valid", "utf-8");
    makeTask(sessionDir, "3.json", {
      id: "3",
      subject: "Also good",
      status: "pending",
      blocks: [],
      blockedBy: [],
    });

    const tasks = loadDaemonTasks(sessionId, { dir: rootDir });
    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.id)).toEqual(["1", "3"]);
  });

  it("skips files missing required fields (id, subject, status)", () => {
    makeTask(sessionDir, "1.json", {
      id: "1",
      subject: "Good",
      status: "completed",
      blocks: [],
      blockedBy: [],
    });
    makeTask(sessionDir, "2.json", {
      subject: "No id",
      status: "completed",
      blocks: [],
      blockedBy: [],
    });
    makeTask(sessionDir, "3.json", {
      id: "3",
      status: "completed",
      blocks: [],
      blockedBy: [],
    });

    const tasks = loadDaemonTasks(sessionId, { dir: rootDir });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("1");
  });

  it("defaults blocks/blockedBy to [] when missing in JSON", () => {
    makeTask(sessionDir, "1.json", {
      id: "1",
      subject: "Minimal",
      status: "pending",
    });

    const tasks = loadDaemonTasks(sessionId, { dir: rootDir });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].blocks).toEqual([]);
    expect(tasks[0].blockedBy).toEqual([]);
  });

  it("returns [] when the session dir does not exist", () => {
    const tasks = loadDaemonTasks("non-existent-session", { dir: rootDir });
    expect(tasks).toEqual([]);
  });
});
