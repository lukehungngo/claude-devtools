import { Router } from "express";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { computeHints, getEvidence, getDetectedResults } from "../../analyzer/efficiency/index.js";
import { mapSdkMessageToSSEEvents } from "../sse-event-handler.js";
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
    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range: ${range}` });
      return;
    }
    try {
      const result = computeHints(range as "24h" | "7d" | "30d" | "90d");
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
    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range: ${range}` });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const sessionManager = ctx.state?.sessionManager;
    if (!sessionManager) {
      res.write(`data: ${JSON.stringify({ error: "Session manager not available" })}\n\n`);
      res.end();
      return;
    }

    let sessionId: string | undefined;

    try {
      const hints = computeHints(range as "24h" | "7d" | "30d" | "90d");
      const detectedResults = getDetectedResults(range);

      // Build enriched prompt with full evidence data
      const issueBlocks = detectedResults.map((r, i) => {
        const sessionLines = r.evidence.sessions
          .slice(0, 10)
          .map((s) => `- ${s.id}: ${s.detail} ($${s.cost.toFixed(2)})`)
          .join("\n");
        const statsLines = Object.entries(r.evidence.stats)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        return `### ${i + 1}. ${r.category.replace(/_/g, " ")}
${r.punchline}

Affected sessions:
${sessionLines || "- (none)"}

Stats: ${statsLines}
Detector recommendation: ${r.evidence.recommendation}`;
      });

      const systemPrompt = `You are a Claude Code usage advisor. You analyze how a developer uses Claude Code and give them specific, actionable advice to improve.

You evaluate usage across four dimensions:

## 1. Cost
- Are they spending money efficiently?
- Which sessions burned money without producing results?
- Are they using expensive models (Opus) for tasks that cheaper models (Sonnet) handle equally well?
- Are they wasting tokens on retries that could have been prevented?
- What's their cost per completed task vs cost per failed attempt?

## 2. Efficiency
- Are they using the right tools in the right order? (Read before Edit, check before Bash)
- Are they starting too many sessions when one would do? (session fragmentation wastes cached context)
- Are they leveraging cache effectively? (continuing sessions vs restarting)
- How many tool calls does it take them to accomplish a task vs how many it should take?

## 3. Quality
- What percentage of edits succeed on the first try?
- How often do tool calls fail?
- How often do they abandon sessions without finishing?
- Are they getting into retry loops (same command 3+ times)?
- Do sessions that start with good context (Read first) produce better outcomes?

## 4. Latency
- How long are their sessions taking?
- How much time is wasted on retries and failed attempts?
- Are there sessions that ran unusually long relative to their complexity?
- Would better prompting or tool usage have shortened the task?

## Report format

Write the report in markdown with these exact sections:

### This period at a glance
3-5 bullet headline. Lead with the most important finding. Include total sessions, total cost, and the single biggest issue.

### Cost analysis
What they spent, where the waste is, specific sessions that burned money and why. Dollar amounts always.

### Efficiency & quality
Tool usage patterns, retry loops, blind edits, session fragmentation. Cite specific sessions and specific tool calls. Compare "what they did" vs "what would have been better."

### What to change this week
Exactly 3 recommendations. Each one:
- **What to do** (one sentence, imperative)
- **Why** (what evidence from their data supports this)
- **Expected impact** (estimated time or cost savings)

Prioritize by expected impact. Be specific — "use Read before Edit" is better than "improve your workflow."

## Rules
- Be direct. No pleasantries, no filler, no "great job overall."
- Every claim must cite data from the input (session IDs, dollar amounts, percentages).
- If a dimension has no issues, skip it — don't pad the report.
- Numbers are rounded. Don't say $7.523421 — say $7.52.
- If there are no issues at all, say so in one sentence and stop.`;

      const userMessage = `Analyze my Claude Code usage for the last ${range}.

## Data

Sessions: ${hints.sessionCount}
Total cost: $${hints.totalCost.toFixed(2)}

## Detected patterns

${issueBlocks.length > 0 ? issueBlocks.join("\n\n") : "No patterns detected — all metrics are within normal ranges."}`;

      // Create ephemeral session for report generation
      sessionId = await sessionManager.startSession(process.cwd());
      sessionManager.setPermissionMode(sessionId, "dontAsk");
      sessionManager.setModel(sessionId, "claude-sonnet-4-6");

      // Combine system prompt + user message into a single prompt
      // (Claude Code sessions take a single prompt string)
      const fullPrompt = systemPrompt + "\n\n---\n\n" + userMessage;

      let reportBuffer = "";
      for await (const message of sessionManager.sendMessage(sessionId, fullPrompt)) {
        const msg = message as { type: string; [key: string]: unknown };
        const sseEvents = mapSdkMessageToSSEEvents(msg);
        for (const evt of sseEvents) {
          if (evt.type === "stdout") {
            reportBuffer += evt.text;
            res.write(`data: ${JSON.stringify({ text: evt.text })}\n\n`);
          }
        }
      }

      // Save report after stream completes
      try {
        await saveReport(range, reportBuffer);
      } catch {
        // Non-fatal: report was already streamed to client
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch {
      res.write(`data: ${JSON.stringify({ error: "Report generation failed" })}\n\n`);
      res.end();
    } finally {
      // Clean up ephemeral session to avoid leaking into dashboard sidebar
      if (sessionId) {
        sessionManager.removeSession(sessionId);
      }
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
