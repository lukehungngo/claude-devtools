import { registerPrompt, type PromptDefinition } from "./registry.js";

export const antiPatternCheck: PromptDefinition = {
  name: "anti_pattern_check",
  description: "Run all anti-pattern detectors, rank by severity, link offending sessions.",
  arguments: [
    { name: "range", description: "Time range (24h|7d|30d|90d|all)", required: true },
  ],
  render: (args) => {
    const range = args.range ?? "7d";
    return {
      messages: [{
        role: "user",
        content: { type: "text", text:
`Check my Claude Code usage for anti-patterns over the last ${range}.

Steps:
1. Read the anti-pattern catalog from resource \`catalog://anti-patterns\`.
2. Call \`retry_loops_detected({ range: "${range}" })\` — flag sessions with 3+ consecutive identical tool calls.
3. Call \`edit_to_read_ratio({ range: "${range}" })\` — flag if ratio < 0.7.
4. Call \`subagent_fanout({ range: "${range}" })\` — flag sessions with breadth > 5.
5. Call \`unfinished_sessions({ range: "${range}" })\` — flag abandoned sessions.
6. Call \`cache_hit_trends({ range: "${range}" })\` — flag days with hit rate < 30%.

For each detected pattern:
- Name (from catalog)
- Severity
- Offending sessions (id + brief context)
- Suggested fix

Output as a ranked table: highest severity first.` },
      }],
    };
  },
};

registerPrompt(antiPatternCheck);
