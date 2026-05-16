import { registerPrompt, type PromptDefinition } from "./registry.js";

export const costAudit: PromptDefinition = {
  name: "cost_audit",
  description: "Spend breakdown by model/project/tool with Pareto analysis and cheaper substitutions.",
  arguments: [
    { name: "range", description: "Time range (24h|7d|30d|90d|all)", required: true },
    { name: "budget", description: "Optional USD budget to compare against" },
  ],
  render: (args) => {
    const range = args.range ?? "30d";
    const budgetNote = args.budget ? `\nBudget reference: $${args.budget} USD.` : "";
    return {
      messages: [{
        role: "user",
        content: { type: "text", text:
`Audit my Claude Code spend over the last ${range}.${budgetNote}

Steps:
1. Call \`cost_by_project({ range: "${range}" })\` and \`model_distribution({ range: "${range}" })\`.
2. Identify the Pareto split: which 20% of projects/models cause 80% of cost.
3. Call \`cache_hit_trends({ range: "${range}" })\` — low cache hit rate is a cost multiplier.
4. Call \`tool_usage_breakdown({ range: "${range}" })\` — identify expensive tool patterns.
5. Propose cheaper substitutions (model downgrades, caching improvements, fewer retries).

Output sections: "Spend summary", "Pareto analysis", "Cache efficiency", "Tool costs", "Recommendations".` },
      }],
    };
  },
};

registerPrompt(costAudit);
