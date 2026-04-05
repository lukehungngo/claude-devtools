import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "child_process";
import { logger } from "../logger.js";
import { scanSkillsFromFilesystem } from "./skill-scanner.js";

interface CachedCommand {
  name: string;
  description: string;
  argumentHint?: string;
}

interface CacheFile {
  commands: CachedCommand[];
  updatedAt: number;
}

const CACHE_DIR = join(homedir(), ".claude", "devtools");
const CACHE_FILE = join(CACHE_DIR, "command-cache.json");

const log = logger.child({ subsystem: "command-cache" });

/**
 * Global command cache that persists the full slash command list across sessions.
 * Updated whenever any session's supportedCommands() succeeds.
 * Falls back to spawning `claude` CLI to bootstrap on first run.
 */
export class CommandCache {
  private commands: CachedCommand[] | null = null;
  private loaded = false;

  /** Get cached commands, reading from disk on first call. Returns null if no cache. */
  get(): CachedCommand[] | null {
    if (!this.loaded) {
      this.loadFromDisk();
    }
    return this.commands;
  }

  /**
   * Update the cache with a new command list.
   * Only writes if the new list is at least as long as the existing one
   * (prevents overwriting a full list with a partial/fallback list).
   */
  update(commands: CachedCommand[]): void {
    if (this.commands && commands.length < this.commands.length) {
      return;
    }
    this.commands = commands;
    this.loaded = true;
    this.writeToDisk(commands);
  }

  /**
   * Bootstrap the cache by scanning the filesystem for skills/plugins,
   * then falling back to spawning `claude` CLI if scan finds nothing.
   * Always re-scans filesystem to pick up newly installed skills/plugins.
   * Safe to call — never throws.
   */
  bootstrap(): void {

    // Tier 1: Fast filesystem scan (<100ms) — always re-scans to pick up new installs
    try {
      const scanned = scanSkillsFromFilesystem();
      if (scanned.length > 0) {
        const asCached: CachedCommand[] = scanned.map((s) => ({
          name: s.name,
          description: s.description,
        }));
        // Force-set (bypass length guard — filesystem is authoritative)
        this.commands = asCached;
        this.loaded = true;
        this.writeToDisk(asCached);
        log.info({ count: asCached.length }, "bootstrap: cached commands from filesystem scan");
        return;
      }
    } catch (err) {
      log.warn({ error: String(err) }, "bootstrap: filesystem scan failed");
    }

    // Skip CLI if cache already has commands from a previous run
    if (this.get() !== null) return;

    // Tier 2: Spawn CLI (slow, 15s timeout)
    try {
      const result = spawnSync(
        "claude",
        ["--print", "--output-format", "json", "-p", "/help"],
        {
          timeout: 15000,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env },
        },
      );

      if (result.error || result.status !== 0) {
        log.warn("bootstrap: claude CLI unavailable or failed");
        return;
      }

      const stdout = result.stdout.toString().trim();
      if (!stdout) return;

      try {
        const parsed = JSON.parse(stdout);
        if (parsed.commands && Array.isArray(parsed.commands) && parsed.commands.length > 0) {
          this.update(parsed.commands);
          log.info({ count: parsed.commands.length }, "bootstrap: cached commands from CLI");
        }
      } catch {
        // CLI output wasn't JSON — ignore
      }
    } catch (err) {
      log.warn({ error: String(err) }, "bootstrap: CLI spawn failed");
    }
  }

  private loadFromDisk(): void {
    this.loaded = true;
    try {
      if (!existsSync(CACHE_FILE)) return;
      const raw = readFileSync(CACHE_FILE, "utf-8");
      const data: CacheFile = JSON.parse(raw);
      if (data.commands && Array.isArray(data.commands) && data.commands.length > 0) {
        this.commands = data.commands;
      }
    } catch {
      // Corrupted cache — ignore
    }
  }

  private writeToDisk(commands: CachedCommand[]): void {
    try {
      mkdirSync(CACHE_DIR, { recursive: true });
      const data: CacheFile = { commands, updatedAt: Date.now() };
      writeFileSync(CACHE_FILE, JSON.stringify(data), "utf-8");
    } catch {
      // Fail-safe: don't crash if we can't write cache
    }
  }
}
