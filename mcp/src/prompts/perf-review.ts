import { registerPrompt, type PromptDefinition } from "./registry.js";

export const perfReview: PromptDefinition = {
  name: "perf_review",
  description: "Five-step retrospective: summary, diff vs prior period, anti-patterns, worst sessions, 3 concrete changes.",
  arguments: [
    { name: "range", description: "Time range (24h|7d|30d|90d|all)", required: true },
    { name: "project", description: "Filter to a specific project hash" },
  ],
  render: (args) => {
    const range = args.range ?? "7d";
    const projectFilter = args.project ? ` filtered to project "${args.project}"` : "";
    return {
      messages: [{
        role: "user",
        content: { type: "text", text:
`You are reviewing my Claude Code usage over the last ${range}${projectFilter}.

Run these steps in order, calling claude-devtools-mcp tools as needed:

1. **Summary** - call \`usage_summary({ range: "${range}", group_by: "day" })\`, \`cost_by_project({ range: "${range}" })\`, and \`model_distribution({ range: "${range}" })\`. Render a 5-bullet headline.
2. **Diff vs prior period** - call \`usage_summary\` for the same window length immediately before, report deltas (cost, tokens, sessions, cache hit rate).
3. **Anti-patterns** - call \`retry_loops_detected({ range: "${range}" })\`, \`edit_to_read_ratio({ range: "${range}" })\`, \`subagent_fanout({ range: "${range}" })\`. Cite the catalog at resource \`catalog://anti-patterns\` by name.
4. **Worst sessions** - call \`longest_sessions({ range: "${range}", limit: 5 })\` and \`error_rate({ range: "${range}", group_by: "project" })\`, surface 3 sessions worth a postmortem.
5. **Three changes** - propose three concrete habit changes for next week. Each has: rationale, evidence (cite a tool result), expected impact.

Output sections exactly: "Headline", "Delta vs prior period", "Anti-patterns", "Worst sessions", "Three changes for next week".` },
      }],
    };
  },
};

registerPrompt(perfReview);
