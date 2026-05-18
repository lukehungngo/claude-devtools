import { Router } from "express";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readdir, readFile, stat } from "node:fs/promises";
import { INSIGHTS_DIAGNOSTICS_SYSTEM_PROMPT } from "../../analyzer/efficiency/ai-diagnostics-prompt.js";
import { computeHints, getEvidence } from "../../analyzer/efficiency/index.js";
import type { RouteContext } from "./route-context.js";

const VALID_RANGES = new Set(["24h", "7d", "30d", "90d"]);
const REPORT_ID_RE = /^\d{4}-\d{2}-\d{2}(?:-\d{6}(?:\d{3})?)?-(24h|7d|30d|90d)$/;
const RECENT_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

function reportsDir(): string {
  return join(homedir(), ".claude", "devtools", "reports");
}

function makeReportId(range: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 23).replace(/[:.]/g, "");
  return `${date}-${time}-${range}`;
}

async function saveReport(range: string, markdown: string): Promise<string> {
  const dir = reportsDir();
  await mkdir(dir, { recursive: true });
  const id = makeReportId(range);
  const filename = `${id}.md`;
  await writeFile(join(dir, filename), markdown, "utf-8");
  return id;
}

async function findRecentReport(range: string, nowMs = Date.now()): Promise<string | null> {
  const dir = reportsDir();
  await mkdir(dir, { recursive: true });
  const files = await readdir(dir);
  const candidates = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => {
        const id = file.replace(".md", "");
        if (!REPORT_ID_RE.test(id) || !id.endsWith(`-${range}`)) return null;
        const fileStat = await stat(join(dir, file));
        const ageMs = nowMs - fileStat.mtimeMs;
        if (ageMs < 0 || ageMs > RECENT_REPORT_WINDOW_MS) return null;
        return { id, mtimeMs: fileStat.mtimeMs };
      })
  );
  const recent = candidates
    .filter((candidate): candidate is { id: string; mtimeMs: number } => candidate !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return recent[0]?.id ?? null;
}

export function createEfficiencyRoutes(ctx: RouteContext): Router {
  const router = Router();

  router.get("/efficiency/hints", (req, res) => {
    const range = String(req.query.range ?? "7d");
    const repo = String(req.query.repo ?? "all");
    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range: ${range}` });
      return;
    }
    try {
      const result = computeHints(range as "24h" | "7d" | "30d" | "90d", repo);
      res.json(result);
    } catch {
      res.status(500).json({ error: "Failed to compute hints" });
    }
  });

  router.get("/efficiency/hints/:id/evidence", (req, res) => {
    const evidence = getEvidence(req.params.id);
    if (!evidence) {
      res.status(404).json({ error: "Hint not found" });
      return;
    }
    res.json(evidence);
  });

  router.post("/efficiency/report", async (req, res) => {
    const range = String(req.body?.range ?? "7d");
    const repo = String(req.body?.repo ?? "all");
    const force = req.body?.force === true;
    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range: ${range}` });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
      if (!force) {
        const recentReportId = await findRecentReport(range);
        if (recentReportId) {
          res.write(
            `data: ${JSON.stringify({
              done: true,
              skipped: true,
              reason: "recent_report_exists",
              reportId: recentReportId,
            })}\n\n`
          );
          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }
      }

      const hints = computeHints(range as "24h" | "7d" | "30d" | "90d", repo);
      const payload = {
        period: hints.period,
        diagnostics: hints.diagnostics,
        quick_wins: hints.quickWins,
      };
      const userMessage = JSON.stringify(payload, null, 2);

      let reportBuffer = "";

      // Try SessionManager first (seamless auth via Claude Code), fall back to API key
      const sessionManager = ctx.state?.sessionManager;
      if (sessionManager) {
        const sessionId = await sessionManager.startSession(process.cwd());
        try {
          sessionManager.setPermissionMode(sessionId, "dontAsk");
          sessionManager.setModel(sessionId, "claude-sonnet-4-6");
          const fullPrompt = INSIGHTS_DIAGNOSTICS_SYSTEM_PROMPT + "\n\n---\n\n" + userMessage;

          for await (const message of sessionManager.sendMessage(sessionId, fullPrompt)) {
            const msg = message as {
              type?: string;
              event?: { type?: string; delta?: { type?: string; text?: string } };
            };
            if (
              msg.type === "stream_event" &&
              msg.event?.type === "content_block_delta" &&
              msg.event.delta?.type === "text_delta" &&
              msg.event.delta.text
            ) {
              reportBuffer += msg.event.delta.text;
              res.write(`data: ${JSON.stringify({ text: msg.event.delta.text })}\n\n`);
            }
          }
        } finally {
          sessionManager.removeSession(sessionId);
        }
      } else {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic();
        const stream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: INSIGHTS_DIAGNOSTICS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            reportBuffer += event.delta.text;
            res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
          }
        }
      }

      let reportId: string | null = null;
      try {
        reportId = await saveReport(range, reportBuffer);
      } catch {
        // Non-fatal
      }

      res.write(`data: ${JSON.stringify({ done: true, reportId })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch {
      res.write(`data: ${JSON.stringify({ error: "Report generation failed" })}\n\n`);
      res.end();
    }
  });

  // List saved reports
  router.get("/efficiency/reports", async (_req, res) => {
    try {
      const dir = reportsDir();
      await mkdir(dir, { recursive: true });
      const files = await readdir(dir);
      const reports = files
        .filter((f) => f.endsWith(".md") && REPORT_ID_RE.test(f.replace(".md", "")))
        .map((f) => {
          const id = f.replace(".md", "");
          const parts = id.split("-");
          const range = parts[parts.length - 1]!;
          const date = parts.slice(0, 3).join("-");
          const time = parts.length >= 5 ? parts[3] : null;
          return { id, date, time, range, filename: f };
        })
        .sort((a, b) => b.id.localeCompare(a.id));
      res.json(reports);
    } catch {
      res.status(500).json({ error: "Failed to list reports" });
    }
  });

  // Get a saved report by ID
  router.get("/efficiency/reports/:id", async (req, res) => {
    const { id } = req.params;
    if (!REPORT_ID_RE.test(id)) {
      res.status(400).json({ error: "Invalid report ID" });
      return;
    }
    try {
      const filePath = join(reportsDir(), `${id}.md`);
      const markdown = await readFile(filePath, "utf-8");
      res.json({ markdown });
    } catch {
      res.status(404).json({ error: "Report not found" });
    }
  });

  return router;
}
