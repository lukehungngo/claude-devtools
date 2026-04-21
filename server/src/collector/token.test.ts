import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let tempDir: string;

beforeEach(() => {
  vi.resetModules();
  tempDir = mkdtempSync(join(tmpdir(), "devtools-token-test-"));
  process.env.DEVTOOLS_TOKEN_PATH = join(tempDir, "devtools.token");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DEVTOOLS_TOKEN_PATH;
});

describe("token", () => {
  it("generates a token with dt_ prefix", async () => {
    const { generateToken } = await import("./token.js");
    const t = generateToken();
    expect(t).toMatch(/^dt_[0-9a-f]{32}$/);
  });

  it("loadOrCreate creates and persists a token when none exists", async () => {
    const { loadOrCreate } = await import("./token.js");
    const t1 = loadOrCreate();
    expect(t1).toMatch(/^dt_[0-9a-f]{32}$/);
    const raw = readFileSync(process.env.DEVTOOLS_TOKEN_PATH!, "utf-8");
    expect(raw.trim()).toBe(t1);
  });

  it("loadOrCreate returns same token on second call", async () => {
    const { loadOrCreate } = await import("./token.js");
    const t1 = loadOrCreate();
    const t2 = loadOrCreate();
    expect(t1).toBe(t2);
  });

  it("loadOrCreate reads existing token from file", async () => {
    writeFileSync(process.env.DEVTOOLS_TOKEN_PATH!, "dt_abc123def456abc123def456abc123de");
    const { loadOrCreate } = await import("./token.js");
    const t = loadOrCreate();
    expect(t).toBe("dt_abc123def456abc123def456abc123de");
  });
});
