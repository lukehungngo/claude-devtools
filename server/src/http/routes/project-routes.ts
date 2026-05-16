import { Router } from "express";
import { spawnSync } from "node:child_process";
import { discoverSessions } from "../../parser/session-discovery.js";
import { logger } from "../../logger.js";

/**
 * Timeout for `claude project purge` invocations. Purge can touch hundreds of
 * JSONL files for a long-lived project, so allow up to 30s. The CLI is
 * non-interactive (we always pass -y) so it should never block on a prompt.
 */
const PURGE_TIMEOUT_MS = 30_000;

/**
 * Resolve a `projectHash` back to a real on-disk path by consulting the most
 * recent session that recorded a `cwd` for that hash. We deliberately do NOT
 * decode the hash itself (replace `-` with `/`) — that transformation is lossy
 * for folder names that contain hyphens. See `session-discovery.ts` for the
 * same reasoning behind `groupSessionsIntoRepos`.
 */
function resolveProjectPath(projectHash: string): string | null {
  const sessions = discoverSessions();
  for (const s of sessions) {
    if (s.projectHash === projectHash && s.cwd) {
      return s.cwd;
    }
  }
  return null;
}

/**
 * Best-effort parse of `claude project purge --dry-run` stdout.
 * The CLI prints one path per line, typically prefixed with text like
 * "Would delete:" — we extract anything that looks like an absolute path.
 * On parse failure we fall back to returning the empty list; the caller still
 * gets `rawStdout` so the UI can show the unparsed output.
 */
function parseDryRunFiles(stdout: string): string[] {
  const files: string[] = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // Match an absolute path anywhere in the line, prefer the last token.
    const match = line.match(/(\/[^\s]+)/);
    if (match) {
      files.push(match[1]);
    }
  }
  return files;
}

export function createProjectRoutes(): Router {
  const router = Router();

  router.post("/projects/:hash/purge/dry-run", (req, res) => {
    const { hash } = req.params;
    const projectPath = resolveProjectPath(hash);
    if (!projectPath) {
      return res.status(404).json({ error: `Unknown project hash: ${hash}` });
    }

    const result = spawnSync(
      "claude",
      ["project", "purge", "--dry-run", "-y", projectPath],
      { timeout: PURGE_TIMEOUT_MS, encoding: "buffer" },
    );

    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code ?? "";
      const detail = code === "ENOENT"
        ? "Claude CLI not found in PATH"
        : `Failed to run claude: ${result.error.message}`;
      logger.warn({ hash, projectPath, error: result.error.message }, "purge dry-run failed");
      return res.status(500).json({ error: detail });
    }

    const rawStdout = result.stdout ? Buffer.from(result.stdout).toString("utf-8") : "";
    const rawStderr = result.stderr ? Buffer.from(result.stderr).toString("utf-8") : "";
    const files = parseDryRunFiles(rawStdout);

    res.json({
      files,
      rawStdout,
      rawStderr,
      exitCode: result.status ?? -1,
    });
  });

  router.post("/projects/:hash/purge", (req, res) => {
    const { hash } = req.params;
    const confirm = (req.body as { confirm?: unknown })?.confirm;
    if (confirm !== true) {
      return res.status(400).json({
        error: "Missing or false `confirm` flag. Send { confirm: true } to authorize purge.",
      });
    }

    const projectPath = resolveProjectPath(hash);
    if (!projectPath) {
      return res.status(404).json({ error: `Unknown project hash: ${hash}` });
    }

    const result = spawnSync(
      "claude",
      ["project", "purge", "-y", projectPath],
      { timeout: PURGE_TIMEOUT_MS, encoding: "buffer" },
    );

    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code ?? "";
      const detail = code === "ENOENT"
        ? "Claude CLI not found in PATH"
        : `Failed to run claude: ${result.error.message}`;
      logger.warn({ hash, projectPath, error: result.error.message }, "purge failed");
      return res.status(500).json({ error: detail });
    }

    const stdout = result.stdout ? Buffer.from(result.stdout).toString("utf-8") : "";
    const stderr = result.stderr ? Buffer.from(result.stderr).toString("utf-8") : "";
    const exitCode = result.status ?? -1;

    res.json({
      ok: exitCode === 0,
      stdout,
      stderr,
      exitCode,
    });
  });

  return router;
}
