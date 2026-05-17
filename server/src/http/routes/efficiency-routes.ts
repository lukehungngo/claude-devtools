import { Router } from "express";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { computeHints, getEvidence, getDetectedResults } from "../../analyzer/efficiency/index.js";
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

export function createEfficiencyRoutes(_ctx: RouteContext): Router {
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

      const prompt = `You are analyzing a developer's Claude Code usage for the last ${range}.

## Summary
- ${hints.sessionCount} sessions, $${hints.totalCost.toFixed(2)} total spend

## Detected Issues

${issueBlocks.length > 0 ? issueBlocks.join("\n\n") : "No major issues detected."}

---

Write a report with these sections:
1. **This period at a glance** — 3-5 bullet summary
2. **What needs attention** — for each issue above, explain what happened, what it cost, and what to do differently. Cite session IDs.
3. **Three changes for next week** — prioritized by expected savings, with rationale and evidence

Tone: direct, specific, no fluff. Cite dollar amounts and session IDs.`;

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();

      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      let reportBuffer = "";
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          reportBuffer += event.delta.text;
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
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
