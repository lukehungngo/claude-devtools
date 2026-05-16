#!/usr/bin/env tsx
/**
 * E2E smoke test: spawns the MCP server as subprocess, runs through
 * the core capabilities, and verifies responses.
 */
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main(): Promise<void> {
  const serverPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../src/index.ts",
  );
  const fixtureDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../src/__fixtures__/sessions",
  );

  const transport = new StdioClientTransport({
    command: "tsx",
    args: [serverPath],
    env: {
      ...process.env,
      CLAUDE_PROJECTS_DIR: fixtureDir,
      MCP_LOG_LEVEL: "silent",
    } as Record<string, string>,
  });

  const client = new Client(
    { name: "smoke-test", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  // Check tools
  const tools = await client.listTools();
  if (tools.tools.length !== 15) {
    throw new Error(`expected 15 tools, got ${tools.tools.length}`);
  }
  process.stderr.write(`Tools: ${tools.tools.length}/15\n`);

  // Check prompts
  const prompts = await client.listPrompts();
  if (prompts.prompts.length !== 5) {
    throw new Error(`expected 5 prompts, got ${prompts.prompts.length}`);
  }
  process.stderr.write(`Prompts: ${prompts.prompts.length}/5\n`);

  // Check resources
  const resources = await client.listResources();
  if (resources.resources.length !== 3) {
    throw new Error(`expected 3 resources, got ${resources.resources.length}`);
  }
  process.stderr.write(`Resources: ${resources.resources.length}/3\n`);

  // Call list_sessions
  const listResult = await client.callTool({
    name: "list_sessions",
    arguments: { range: "all" },
  });
  if (!listResult.content?.length) {
    throw new Error("list_sessions returned empty");
  }
  process.stderr.write("list_sessions: OK\n");

  // Get a prompt
  const prompt = await client.getPrompt({
    name: "perf_review",
    arguments: { range: "7d" },
  });
  if (!prompt.messages?.length) {
    throw new Error("perf_review returned no messages");
  }
  process.stderr.write("perf_review prompt: OK\n");

  // Read a resource
  const resource = await client.readResource({
    uri: "catalog://anti-patterns",
  });
  if (!resource.contents?.length) {
    throw new Error("anti-patterns resource empty");
  }
  process.stderr.write("catalog://anti-patterns: OK\n");

  await client.close();
  process.stdout.write("SMOKE OK\n");
}

main().catch((e: unknown) => {
  process.stderr.write(`SMOKE FAILED: ${String(e)}\n`);
  process.exit(1);
});
