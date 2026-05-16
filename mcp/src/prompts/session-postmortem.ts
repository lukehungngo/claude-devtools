import { registerPrompt, type PromptDefinition } from "./registry.js";

export const sessionPostmortem: PromptDefinition = {
  name: "session_postmortem",
  description: "Deep dive into a single session: timeline, errors, retries, what went wrong.",
  arguments: [
    { name: "session_id", description: "Session ID to analyze", required: true },
  ],
  render: (args) => {
    const sid = args.session_id ?? "";
    return {
      messages: [{
        role: "user",
        content: { type: "text", text:
`Perform a postmortem on session "${sid}".

Steps:
1. Call \`get_session({ id: "${sid}", include: ["metrics"] })\` for the full picture.
2. Call \`token_timeline({ session_id: "${sid}" })\` to see cost accumulation over time.
3. Identify: error spikes, retry loops, long idle periods, expensive model usage.
4. Summarize what went wrong and what could be done differently next time.

Output sections: "Session overview", "Timeline analysis", "Issues found", "Root cause", "Recommendations".` },
      }],
    };
  },
};

registerPrompt(sessionPostmortem);
