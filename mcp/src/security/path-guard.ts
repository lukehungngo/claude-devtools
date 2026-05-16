import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Validates that a session id contains no path traversal characters. */
export function validateSessionId(sessionId: string): void {
  if (!sessionId || !SAFE_ID.test(sessionId)) {
    throw new Error(`invalid session id: ${sessionId}`);
  }
}

/**
 * Finds a session JSONL file in the projects directory.
 * Layout: <projectsRoot>/<projectHash>/<sessionId>.jsonl
 * Walks all project hash subdirectories to find the file.
 */
export function findSessionPath(projectsRoot: string, sessionId: string): string {
  validateSessionId(sessionId);

  if (!existsSync(projectsRoot)) {
    throw new Error(`SESSION_NOT_FOUND: ${sessionId} (projects dir missing)`);
  }

  const filename = `${sessionId}.jsonl`;

  for (const entry of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(projectsRoot, entry.name, filename);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(`SESSION_NOT_FOUND: ${sessionId}`);
}
