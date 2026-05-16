import { registerPrompt, type PromptDefinition } from "./registry.js";

export const weeklySummary: PromptDefinition = {
  name: "weekly_summary",
  description: "Lightweight weekly summary: top 5 wins, top 5 friction points, one habit to change.",
  arguments: [],
  render: () => {
    return {
      messages: [{
        role: "user",
        content: { type: "text", text:
`Give me a quick weekly summary of my Claude Code usage (last 7 days).

Steps:
1. Call \`usage_summary({ range: "7d", group_by: "day" })\` for daily activity.
2. Call \`list_sessions({ range: "7d", limit: 20 })\` to see recent sessions.
3. Call \`error_rate({ range: "7d", group_by: "tool" })\` to find friction.
4. Call \`cache_hit_trends({ range: "7d" })\` for efficiency check.

Produce:
- **Top 5 wins** - sessions/days with high productivity (many events, low errors, good cache usage)
- **Top 5 friction points** - high error rates, retry loops, unfinished sessions
- **One habit to change this week** - the single highest-impact suggestion

Keep it concise: 2-3 sentences per bullet max.` },
      }],
    };
  },
};

registerPrompt(weeklySummary);
