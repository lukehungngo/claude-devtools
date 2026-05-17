import { Router } from "express";
import { computeHints, getEvidence } from "../../analyzer/efficiency/index.js";
import type { RouteContext } from "./route-context.js";

const VALID_RANGES = new Set(["24h", "7d", "30d", "90d"]);

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

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Fallback: return a static report when no API key is available
        const staticReport = generateStaticReport(hints);
        res.write(`data: ${JSON.stringify({ text: staticReport })}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });

      const prompt = `You are analyzing a developer's Claude Code usage for the last ${range}.

Here is the data:

Sessions: ${hints.sessionCount}
Total cost: $${hints.totalCost.toFixed(2)}

Issues found:
${hints.hints.map((h) => `- ${h.icon} ${h.punchline}`).join("\n") || "No major issues detected."}

Write a report with these sections:
1. **What happened this period** - 3-5 bullet headline summary
2. **Biggest issues** - for each issue: what happened, what it cost (time + money), what to do differently. Cite specific patterns.
3. **Three changes for next week** - prioritized by expected savings, with rationale

Tone: direct, specific, no fluff. Use dollar amounts and concrete numbers from the data above.`;

      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch {
      res.write(`data: ${JSON.stringify({ error: "Report generation failed" })}\n\n`);
      res.end();
    }
  });

  return router;
}

function generateStaticReport(hints: { sessionCount: number; totalCost: number; hints: Array<{ punchline: string }> }): string {
  const lines = [
    `## What happened this period\n`,
    `- Analyzed **${hints.sessionCount}** sessions`,
    `- Total cost: **$${hints.totalCost.toFixed(2)}**`,
    `- Found **${hints.hints.length}** efficiency issues\n`,
  ];

  if (hints.hints.length > 0) {
    lines.push(`## Biggest issues\n`);
    for (const h of hints.hints) {
      lines.push(`- ${h.punchline}`);
    }
    lines.push("");
  }

  lines.push(`## Three changes for next week\n`);
  lines.push(`1. Review the hints above and address the highest-impact one first`);
  lines.push(`2. Continue sessions instead of starting new ones for the same project`);
  lines.push(`3. Always read files before editing them\n`);
  lines.push(`\n*Note: Set ANTHROPIC_API_KEY for an AI-generated personalized report.*`);

  return lines.join("\n");
}
