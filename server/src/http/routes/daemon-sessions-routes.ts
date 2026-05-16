import { Router } from "express";
import {
  listDaemonSessions,
  findDaemonSessionByPid,
} from "../../parser/daemon-session-discovery.js";

/**
 * REST endpoints exposing `~/.claude/sessions/<pid>.json` daemon state.
 *
 *   GET /api/daemon-sessions          → { sessions: DaemonSession[] }
 *   GET /api/daemon-sessions/:pid     → { session: DaemonSession | null }
 *
 * The dashboard cross-references this against discovered JSONL sessions to
 * show authoritative idle/busy status and a Remote Control indicator when
 * `bridgeSessionId` is present.
 */
export function createDaemonSessionsRoutes(): Router {
  const router = Router();

  router.get("/api/daemon-sessions", (_req, res) => {
    const sessions = listDaemonSessions();
    res.json({ sessions });
  });

  router.get("/api/daemon-sessions/:pid", (req, res) => {
    const pidParam = req.params.pid;
    const pid = Number.parseInt(pidParam, 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return res.status(400).json({ error: `Invalid pid: ${pidParam}` });
    }
    const session = findDaemonSessionByPid(pid);
    res.json({ session: session ?? null });
  });

  return router;
}
