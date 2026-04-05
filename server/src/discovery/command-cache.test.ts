import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Mock fs and child_process
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
}));

vi.mock("./skill-scanner.js", () => ({
  scanSkillsFromFilesystem: vi.fn(() => []),
}));

import { CommandCache } from "./command-cache.js";
import { spawnSync } from "child_process";
import { scanSkillsFromFilesystem } from "./skill-scanner.js";

const CACHE_DIR = join(homedir(), ".claude", "devtools");
const CACHE_FILE = join(CACHE_DIR, "command-cache.json");

describe("CommandCache", () => {
  let cache: CommandCache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = new CommandCache();
  });

  describe("get()", () => {
    it("returns null when no cache exists", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(cache.get()).toBeNull();
    });

    it("returns cached commands from disk", () => {
      const commands = [
        { name: "help", description: "Show help", argumentHint: "" },
        { name: "compact", description: "Compact context", argumentHint: "" },
      ];
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ commands, updatedAt: Date.now() }));

      const result = cache.get();
      expect(result).toEqual(commands);
    });

    it("returns null on corrupted cache file", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("not json");

      expect(cache.get()).toBeNull();
    });

    it("returns cached commands from memory on subsequent calls", () => {
      const commands = [
        { name: "help", description: "Show help", argumentHint: "" },
      ];
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ commands, updatedAt: Date.now() }));

      cache.get(); // First call reads from disk
      cache.get(); // Second call should use memory

      // readFileSync called only once (first get)
      expect(readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe("update()", () => {
    it("writes commands to disk", () => {
      const commands = [
        { name: "help", description: "Show help", argumentHint: "" },
        { name: "commit", description: "Commit changes", argumentHint: "" },
      ];

      cache.update(commands);

      expect(mkdirSync).toHaveBeenCalledWith(CACHE_DIR, { recursive: true });
      expect(writeFileSync).toHaveBeenCalledTimes(1);
      const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
      expect(written.commands).toEqual(commands);
      expect(written.updatedAt).toBeTypeOf("number");
    });

    it("makes subsequent get() return updated commands without disk read", () => {
      const commands = [
        { name: "help", description: "Show help", argumentHint: "" },
      ];

      cache.update(commands);
      const result = cache.get();

      expect(result).toEqual(commands);
      expect(readFileSync).not.toHaveBeenCalled();
    });

    it("does not update if new list is shorter than existing", () => {
      const full = [
        { name: "help", description: "Show help", argumentHint: "" },
        { name: "commit", description: "Commit", argumentHint: "" },
        { name: "review", description: "Review", argumentHint: "" },
      ];
      const partial = [
        { name: "help", description: "Show help", argumentHint: "" },
      ];

      cache.update(full);
      vi.mocked(writeFileSync).mockClear();

      cache.update(partial);

      // Should NOT overwrite with fewer commands
      expect(writeFileSync).not.toHaveBeenCalled();
      expect(cache.get()).toEqual(full);
    });

    it("does not write on fs error (fail-safe)", () => {
      vi.mocked(mkdirSync).mockImplementation(() => { throw new Error("EACCES"); });

      const commands = [{ name: "help", description: "Help", argumentHint: "" }];

      // Should not throw
      expect(() => cache.update(commands)).not.toThrow();
    });
  });

  describe("bootstrap()", () => {
    it("populates cache from filesystem scan first", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(scanSkillsFromFilesystem).mockReturnValue([
        { name: "commit", description: "Commit changes", source: "skill" },
        { name: "my-plugin:deploy", description: "Deploy", source: "plugin", pluginName: "my-plugin" },
      ]);

      cache.bootstrap();

      // Should NOT spawn CLI since scan succeeded
      expect(spawnSync).not.toHaveBeenCalled();
      expect(cache.get()?.length).toBe(2);
      expect(cache.get()?.[0].name).toBe("commit");
    });

    it("falls back to CLI when scan returns empty", () => {
      const commands = [
        { name: "help", description: "Show help", argumentHint: "" },
        { name: "compact", description: "Compact", argumentHint: "" },
        { name: "commit", description: "Commit changes", argumentHint: "<msg>" },
      ];
      const cliOutput = JSON.stringify({ commands });

      vi.mocked(scanSkillsFromFilesystem).mockReturnValue([]);
      const mockSpawnSync = vi.mocked(spawnSync);
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: Buffer.from(cliOutput),
        stderr: Buffer.from(""),
        pid: 1,
        output: [],
        signal: null,
      });

      // No existing cache
      vi.mocked(existsSync).mockReturnValue(false);

      cache.bootstrap();

      expect(mockSpawnSync).toHaveBeenCalled();
      expect(cache.get()?.length).toBe(3);
    });

    it("re-scans filesystem even if cache already has commands", () => {
      const oldCommands = [
        { name: "help", description: "Show help", argumentHint: "" },
      ];
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ commands: oldCommands, updatedAt: Date.now() }));
      vi.mocked(scanSkillsFromFilesystem).mockReturnValue([
        { name: "help", description: "Show help", source: "skill" as const },
        { name: "commit", description: "Commit changes", source: "skill" as const },
        { name: "review", description: "Review PR", source: "skill" as const },
      ]);

      cache.get(); // Load from disk (1 command)
      cache.bootstrap(); // Should re-scan and find 3

      expect(scanSkillsFromFilesystem).toHaveBeenCalled();
      expect(spawnSync).not.toHaveBeenCalled(); // scan succeeded, no CLI needed
      expect(cache.get()?.length).toBe(3);
    });

    it("handles CLI spawn failure gracefully when scan is empty", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(scanSkillsFromFilesystem).mockReturnValue([]);
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from("error"),
        pid: 1,
        output: [],
        signal: null,
      });

      expect(() => cache.bootstrap()).not.toThrow();
      expect(cache.get()).toBeNull();
    });

    it("handles CLI not found gracefully when scan is empty", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(scanSkillsFromFilesystem).mockReturnValue([]);
      vi.mocked(spawnSync).mockReturnValue({
        status: null,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
        pid: 1,
        output: [],
        signal: null,
        error: new Error("ENOENT"),
      });

      expect(() => cache.bootstrap()).not.toThrow();
      expect(cache.get()).toBeNull();
    });

    it("handles scanner throwing gracefully", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(scanSkillsFromFilesystem).mockImplementation(() => { throw new Error("EACCES"); });
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
        pid: 1,
        output: [],
        signal: null,
      });

      expect(() => cache.bootstrap()).not.toThrow();
    });
  });
});
