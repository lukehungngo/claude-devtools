#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook script.
 * Receives hook payload on stdin, forwards to DevTools dashboard for approval.
 * Polls for decision, exits with 0 (approve) or 2 (deny).
 */

const DEVTOOLS_PORT = process.env.DEVTOOLS_PORT || "3142";
const BASE_URL = `http://localhost:${DEVTOOLS_PORT}/api`;
const POLL_INTERVAL_MS = 500;
const TIMEOUT_MS = 120_000;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function postRequest(path, body) {
  const url = new URL(path, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getRequest(path) {
  const url = new URL(path, BASE_URL);
  const res = await fetch(url.toString());
  return res.json();
}

async function main() {
  try {
    const input = await readStdin();
    const hookData = JSON.parse(input);

    // Register permission request
    const result = await postRequest("/permissions/request", {
      toolName: hookData.tool_name || hookData.name || "unknown",
      input: hookData.tool_input || hookData.input || {},
      sessionId: hookData.session_id || "",
      agentId: hookData.agent_id || "main",
    });

    const permissionId = result.id;
    if (!permissionId) {
      // Server unavailable, allow by default
      process.exit(0);
    }

    // Poll for decision
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      try {
        const status = await getRequest(`/permissions/${permissionId}/status`);
        if (status.status === "approved") {
          process.exit(0);
        } else if (status.status === "denied") {
          process.exit(2);
        }
        // Still pending, continue polling
      } catch {
        // Server might be restarting, continue
      }
    }

    // Timeout: deny by default
    process.exit(2);
  } catch {
    // If anything fails (server down, etc.), allow by default
    process.exit(0);
  }
}

main();
