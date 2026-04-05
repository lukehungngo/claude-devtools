import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logger } from "../logger.js";

const log = logger.child({ subsystem: "skill-scanner" });

export interface ScannedCommand {
  name: string;
  description: string;
  source: "skill" | "plugin";
  pluginName?: string;
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Extracts `name:` and `description:` fields from `---` delimited block.
 * Returns null if no valid frontmatter found.
 */
export function parseFrontmatter(content: string): { name?: string; description?: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    // Handle empty frontmatter: ---\n---
    if (/^---\s*\n---/.test(content)) return {};
    return null;
  }

  const block = match[1];
  const result: { name?: string; description?: string } = {};

  const nameMatch = block.match(/^name:\s*(.+)$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  const descMatch = block.match(/^description:\s*(.+)$/m);
  if (descMatch) result.description = descMatch[1].trim();

  return result;
}

/**
 * Read installed plugin paths from ~/.claude/plugins/installed_plugins.json.
 * Returns a map of plugin name → install path.
 */
function readInstalledPlugins(claudeDir: string): Map<string, string> {
  const plugins = new Map<string, string>();
  const registryPath = join(claudeDir, "plugins", "installed_plugins.json");

  try {
    if (!existsSync(registryPath)) return plugins;
    const raw = readFileSync(registryPath, "utf-8");
    const data = JSON.parse(raw);

    if (!data.plugins || typeof data.plugins !== "object") return plugins;

    for (const [_key, entries] of Object.entries(data.plugins)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const e = entry as { installPath?: string };
        if (e.installPath && existsSync(e.installPath)) {
          // Read plugin name from plugin.json
          const pluginJsonPath = join(e.installPath, ".claude-plugin", "plugin.json");
          try {
            if (existsSync(pluginJsonPath)) {
              const pj = JSON.parse(readFileSync(pluginJsonPath, "utf-8"));
              if (pj.name) {
                plugins.set(pj.name, e.installPath);
              }
            }
          } catch {
            // Skip unreadable plugin.json
          }
        }
      }
    }
  } catch {
    // Fail-safe — corrupted registry
  }

  return plugins;
}

/**
 * Scan a directory of user skills: each subdirectory has a SKILL.md.
 * Pattern: baseDir/<skill-name>/SKILL.md
 */
function scanUserSkills(skillsDir: string): ScannedCommand[] {
  const commands: ScannedCommand[] = [];
  if (!existsSync(skillsDir)) return commands;

  try {
    for (const entry of readdirSync(skillsDir)) {
      try {
        const skillPath = join(skillsDir, entry, "SKILL.md");
        if (!existsSync(skillPath)) continue;

        const content = readFileSync(skillPath, "utf-8");
        const fm = parseFrontmatter(content);
        if (!fm) continue;

        const name = fm.name || entry;
        if (!name) continue;

        commands.push({
          name,
          description: fm.description || name,
          source: "skill",
        });
      } catch {
        // Skip individual skill errors
      }
    }
  } catch {
    // Skip unreadable directory
  }

  return commands;
}

/**
 * Scan a plugin's commands/ directory.
 * Pattern: pluginPath/commands/<name>.md — filename is the command name.
 */
function scanPluginCommands(pluginPath: string, pluginName: string): ScannedCommand[] {
  const commands: ScannedCommand[] = [];
  const commandsDir = join(pluginPath, "commands");
  if (!existsSync(commandsDir)) return commands;

  try {
    for (const file of readdirSync(commandsDir)) {
      if (!file.endsWith(".md")) continue;
      try {
        const name = file.replace(/\.md$/, "");
        const content = readFileSync(join(commandsDir, file), "utf-8");
        const fm = parseFrontmatter(content);
        const description = fm?.description || name;

        commands.push({
          name: `${pluginName}:${name}`,
          description,
          source: "plugin",
          pluginName,
        });
      } catch {
        // Skip individual command errors
      }
    }
  } catch {
    // Skip unreadable commands dir
  }

  return commands;
}

/**
 * Scan a plugin's skills/ directory.
 * Pattern: pluginPath/skills/<name>/SKILL.md
 */
function scanPluginSkills(pluginPath: string, pluginName: string): ScannedCommand[] {
  const commands: ScannedCommand[] = [];
  const skillsDir = join(pluginPath, "skills");
  if (!existsSync(skillsDir)) return commands;

  try {
    for (const entry of readdirSync(skillsDir)) {
      try {
        const entryPath = join(skillsDir, entry);
        if (!statSync(entryPath).isDirectory()) continue;

        const skillPath = join(entryPath, "SKILL.md");
        if (!existsSync(skillPath)) continue;

        const content = readFileSync(skillPath, "utf-8");
        const fm = parseFrontmatter(content);
        if (!fm) continue;

        const name = fm.name || entry;
        commands.push({
          name: `${pluginName}:${name}`,
          description: fm.description || name,
          source: "plugin",
          pluginName,
        });
      } catch {
        // Skip individual skill errors
      }
    }
  } catch {
    // Skip unreadable skills dir
  }

  return commands;
}

/**
 * Scan the filesystem for all discoverable skills and plugin commands.
 * Reads:
 *   1. ~/.claude/skills/          — user-level skills
 *   2. ~/.claude/plugins/         — installed plugin commands + skills
 *
 * @param claudeDir - Override for ~/.claude (used in tests). Defaults to homedir()/.claude.
 * @returns Array of discovered commands. Never throws.
 */
export function scanSkillsFromFilesystem(claudeDir?: string): ScannedCommand[] {
  const baseDir = claudeDir ?? join(homedir(), ".claude");
  const commands: ScannedCommand[] = [];

  try {
    // 1. User-level skills
    commands.push(...scanUserSkills(join(baseDir, "skills")));

    // 2. Installed plugins
    const plugins = readInstalledPlugins(baseDir);
    for (const [pluginName, installPath] of plugins) {
      commands.push(...scanPluginCommands(installPath, pluginName));
      commands.push(...scanPluginSkills(installPath, pluginName));
    }

    log.info({ skills: commands.length }, "scan: discovered commands from filesystem");
  } catch (err) {
    log.warn({ error: String(err) }, "scan: failed");
  }

  return commands;
}
