import { describe, it, expect } from "vitest";
import { validateSessionId, findSessionPath } from "./path-guard.js";

describe("validateSessionId", () => {
  it("accepts valid uuid-shaped session id", () => {
    expect(() => validateSessionId("abc-def-123")).not.toThrow();
  });
  it("rejects path traversal", () => {
    expect(() => validateSessionId("../etc/passwd")).toThrow(/invalid session id/);
  });
  it("rejects absolute paths", () => {
    expect(() => validateSessionId("/etc/passwd")).toThrow(/invalid session id/);
  });
  it("rejects ids with slashes", () => {
    expect(() => validateSessionId("a/b")).toThrow(/invalid session id/);
  });
  it("rejects empty string", () => {
    expect(() => validateSessionId("")).toThrow(/invalid session id/);
  });
  it("accepts typical CC session ids (hex UUIDs)", () => {
    expect(() => validateSessionId("23ba0306-1a2b-4c3d-8e9f-1234567890ab")).not.toThrow();
  });
});

describe("findSessionPath", () => {
  it("finds a session file in nested project structure", () => {
    const root = new URL("../__fixtures__/sessions", import.meta.url).pathname;
    const result = findSessionPath(root, "medium");
    expect(result).toContain("medium.jsonl");
  });
  it("throws for non-existent session", () => {
    const root = new URL("../__fixtures__/sessions", import.meta.url).pathname;
    expect(() => findSessionPath(root, "does-not-exist")).toThrow(/SESSION_NOT_FOUND/);
  });
});
