import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanSkillsFromFilesystem, parseFrontmatter } from "./skill-scanner.js";

const TEST_DIR = join(tmpdir(), "vitest-skill-scanner");

function setup() {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("parseFrontmatter", () => {
  it("extracts name and description from valid frontmatter", () => {
    const content = `---
name: my-skill
description: Does something useful
origin: test
---

# My Skill
`;
    const fm = parseFrontmatter(content);
    expect(fm).toEqual({ name: "my-skill", description: "Does something useful" });
  });

  it("returns null when no frontmatter delimiters", () => {
    expect(parseFrontmatter("# Just a heading\nSome text")).toBeNull();
  });

  it("handles frontmatter with only name", () => {
    const content = `---
name: only-name
---
`;
    const fm = parseFrontmatter(content);
    expect(fm).toEqual({ name: "only-name" });
  });

  it("handles frontmatter with only description", () => {
    const content = `---
description: Just a description
---
`;
    const fm = parseFrontmatter(content);
    expect(fm).toEqual({ description: "Just a description" });
  });

  it("handles empty frontmatter block", () => {
    const content = `---
---
`;
    const fm = parseFrontmatter(content);
    expect(fm).toEqual({});
  });
});

describe("scanSkillsFromFilesystem", () => {
  it("scans user skills from skills/ directory", () => {
    setup();
    const skillsDir = join(TEST_DIR, "skills");
    mkdirSync(join(skillsDir, "commit"), { recursive: true });
    writeFileSync(
      join(skillsDir, "commit", "SKILL.md"),
      `---
name: commit
description: Create a git commit
---
# Commit Skill
`,
    );
    mkdirSync(join(skillsDir, "review-pr"), { recursive: true });
    writeFileSync(
      join(skillsDir, "review-pr", "SKILL.md"),
      `---
name: review-pr
description: Review a pull request
---
`,
    );

    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      name: "commit",
      description: "Create a git commit",
      source: "skill",
    });
    expect(result).toContainEqual({
      name: "review-pr",
      description: "Review a pull request",
      source: "skill",
    });
  });

  it("uses directory name when SKILL.md has no name field", () => {
    setup();
    const skillsDir = join(TEST_DIR, "skills");
    mkdirSync(join(skillsDir, "my-skill"), { recursive: true });
    writeFileSync(
      join(skillsDir, "my-skill", "SKILL.md"),
      `---
description: A skill without a name field
---
`,
    );

    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-skill");
    expect(result[0].description).toBe("A skill without a name field");
  });

  it("skips SKILL.md without frontmatter", () => {
    setup();
    const skillsDir = join(TEST_DIR, "skills");
    mkdirSync(join(skillsDir, "no-frontmatter"), { recursive: true });
    writeFileSync(
      join(skillsDir, "no-frontmatter", "SKILL.md"),
      "# Just a heading\nNo frontmatter here.",
    );

    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when skills/ does not exist", () => {
    setup();
    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toEqual([]);
  });

  it("returns empty array when base dir does not exist", () => {
    const result = scanSkillsFromFilesystem("/nonexistent/path");
    expect(result).toEqual([]);
  });

  it("scans plugin commands from commands/ directory", () => {
    setup();

    // Create installed_plugins.json
    const pluginsDir = join(TEST_DIR, "plugins");
    mkdirSync(pluginsDir, { recursive: true });

    const pluginPath = join(pluginsDir, "cache", "test-marketplace", "my-plugin", "1.0.0");
    mkdirSync(join(pluginPath, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(pluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "my-plugin", version: "1.0.0" }),
    );

    // Create commands
    mkdirSync(join(pluginPath, "commands"), { recursive: true });
    writeFileSync(
      join(pluginPath, "commands", "deploy.md"),
      `---
description: Deploy to production
---
# Deploy
`,
    );
    writeFileSync(
      join(pluginPath, "commands", "rollback.md"),
      `---
description: Rollback deployment
---
`,
    );

    // Write registry
    writeFileSync(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "my-plugin@test-marketplace": [
            { scope: "user", installPath: pluginPath, version: "1.0.0" },
          ],
        },
      }),
    );

    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      name: "my-plugin:deploy",
      description: "Deploy to production",
      source: "plugin",
      pluginName: "my-plugin",
    });
    expect(result).toContainEqual({
      name: "my-plugin:rollback",
      description: "Rollback deployment",
      source: "plugin",
      pluginName: "my-plugin",
    });
  });

  it("scans plugin skills from skills/ directory", () => {
    setup();

    const pluginsDir = join(TEST_DIR, "plugins");
    const pluginPath = join(pluginsDir, "cache", "mp", "test-plugin", "2.0.0");
    mkdirSync(join(pluginPath, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(pluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "test-plugin" }),
    );

    mkdirSync(join(pluginPath, "skills", "tdd-workflow"), { recursive: true });
    writeFileSync(
      join(pluginPath, "skills", "tdd-workflow", "SKILL.md"),
      `---
name: tdd-workflow
description: TDD development workflow
---
`,
    );

    writeFileSync(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "test-plugin@mp": [{ scope: "user", installPath: pluginPath }],
        },
      }),
    );

    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toContainEqual({
      name: "test-plugin:tdd-workflow",
      description: "TDD development workflow",
      source: "plugin",
      pluginName: "test-plugin",
    });
  });

  it("combines user skills and plugin commands", () => {
    setup();

    // User skill
    const skillsDir = join(TEST_DIR, "skills");
    mkdirSync(join(skillsDir, "my-skill"), { recursive: true });
    writeFileSync(
      join(skillsDir, "my-skill", "SKILL.md"),
      `---
name: my-skill
description: User skill
---
`,
    );

    // Plugin command
    const pluginsDir = join(TEST_DIR, "plugins");
    const pluginPath = join(pluginsDir, "cache", "mp", "plug", "1.0");
    mkdirSync(join(pluginPath, ".claude-plugin"), { recursive: true });
    mkdirSync(join(pluginPath, "commands"), { recursive: true });
    writeFileSync(
      join(pluginPath, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "plug" }),
    );
    writeFileSync(
      join(pluginPath, "commands", "cmd.md"),
      `---
description: Plugin command
---
`,
    );
    writeFileSync(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: { "plug@mp": [{ installPath: pluginPath }] },
      }),
    );

    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toHaveLength(2);
    const sources = result.map((r) => r.source);
    expect(sources).toContain("skill");
    expect(sources).toContain("plugin");
  });

  it("handles corrupted installed_plugins.json gracefully", () => {
    setup();
    const pluginsDir = join(TEST_DIR, "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(join(pluginsDir, "installed_plugins.json"), "not valid json");

    expect(() => scanSkillsFromFilesystem(TEST_DIR)).not.toThrow();
    expect(scanSkillsFromFilesystem(TEST_DIR)).toEqual([]);
  });

  it("skips plugins with missing install path", () => {
    setup();
    const pluginsDir = join(TEST_DIR, "plugins");
    mkdirSync(pluginsDir, { recursive: true });
    writeFileSync(
      join(pluginsDir, "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: {
          "ghost@mp": [{ installPath: "/nonexistent/path" }],
        },
      }),
    );

    const result = scanSkillsFromFilesystem(TEST_DIR);
    expect(result).toEqual([]);
  });
});
