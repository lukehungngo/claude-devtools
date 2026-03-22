---
name: devtools
description: >
  Open the Claude DevTools browser dashboard for visualizing session logs,
  agent execution flows, token/cost metrics, and sending commands.
  Trigger with "open devtools", "show dashboard", "session metrics",
  "agent flow", or "token usage".
---

# DevTools Dashboard

When triggered, use the `open-dashboard` MCP tool to launch the browser dashboard.

The dashboard shows:
- Agent execution flow (DAG visualization)
- Token usage and cost breakdown by model
- Tool call inventory with success/error rates
- Session timeline with expandable events
- Command input for sending prompts

The dashboard runs on localhost:3142 and auto-opens in the default browser.
