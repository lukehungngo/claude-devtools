import { Router } from "express";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { INSIGHTS_DIAGNOSTICS_SYSTEM_PROMPT } from "../../analyzer/efficiency/ai-diagnostics-prompt.js";
import { computeHints, getEvidence } from "../../analyzer/efficiency/index.js";
import type { RouteContext } from "./route-context.js";

const VALID_RANGES = new Set(["24h", "7d", "30d", "90d"]);
const REPORT_ID_RE = /^\d{4}-\d{2}-\d{2}-(24h|7d|30d|90d)$/;

function reportsDir(): string {
  return join(homedir(), ".claude", "devtools", "reports");
}

async function saveReport(range: string, markdown: string): Promise<void> {
  const dir = reportsDir();
  await mkdir(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-${range}.md`;
  await writeFile(join(dir, filename), markdown, "utf-8");
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
    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range: ${range}` });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    try {
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

      try {
        await saveReport(range, reportBuffer);
      } catch {
        // Non-fatal
      }

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
          return { id, date, range, filename: f };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
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
