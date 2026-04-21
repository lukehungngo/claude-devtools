import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { logger } from "../logger.js";

const INJECT_INTERVAL_MS = 60_000;
const injected = new Set<string>(); // container IDs already injected

function dockerAvailable(): boolean {
  return existsSync("/var/run/docker.sock");
}

function listRunningContainers(): Array<{ id: string; name: string }> {
  const result = spawnSync("docker", ["ps", "--format", "{{.ID}}\t{{.Names}}"], {
    encoding: "utf-8",
  });
  if (result.status !== 0) return [];
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split("\t");
      return { id: id.trim(), name: name.trim() };
    });
}

function hasClaudeProjects(containerId: string): boolean {
  const result = spawnSync(
    "docker",
    [
      "exec",
      containerId,
      "sh",
      "-c",
      "test -d /root/.claude/projects || test -d ~/.claude/projects",
    ],
    { encoding: "utf-8", timeout: 5000 }
  );
  return result.status === 0;
}

function injectCollector(
  containerId: string,
  containerName: string,
  serverUrl: string,
  token: string
): void {
  logger.info({ containerId, containerName }, "docker-injector: injecting collector");
  spawnSync(
    "docker",
    [
      "exec",
      "-d",
      containerId,
      "sh",
      "-c",
      `npx --yes @lukehungngo/claude-devtools collect --server ${serverUrl} --token ${token} --source docker:${containerName}`,
    ],
    { encoding: "utf-8" }
  );
}

export function startDockerInjector(
  serverPort: number,
  token: string
): { stop: () => void } {
  if (!dockerAvailable()) {
    logger.debug("docker-injector: Docker socket not found, skipping");
    return { stop: () => {} };
  }

  const collectorUrl = `ws://host.docker.internal:${serverPort}/collect`;

  function scan(): void {
    const containers = listRunningContainers();
    for (const { id, name } of containers) {
      if (injected.has(id)) continue;
      if (hasClaudeProjects(id)) {
        injected.add(id);
        injectCollector(id, name, collectorUrl, token);
      }
    }
    // Remove IDs that are no longer running
    const runningIds = new Set(containers.map((c) => c.id));
    for (const id of injected) {
      if (!runningIds.has(id)) injected.delete(id);
    }
  }

  scan(); // immediate first scan
  const interval = setInterval(scan, INJECT_INTERVAL_MS);

  return {
    stop: () => clearInterval(interval),
  };
}
