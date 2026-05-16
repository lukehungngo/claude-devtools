import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface PromptMessage {
  role: "user" | "assistant";
  content: { type: "text"; text: string };
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required?: boolean }>;
  render: (args: Record<string, string>) => { messages: PromptMessage[] };
}

const prompts: PromptDefinition[] = [];

export function registerPrompt(def: PromptDefinition): void {
  prompts.push(def);
}

export function allPromptDefinitions(): PromptDefinition[] {
  return prompts;
}

export function registerPrompts(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: prompts.map(({ name, description, arguments: args }) => ({
      name,
      description,
      arguments: args,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const def = prompts.find((p) => p.name === req.params.name);
    if (!def) throw new Error(`UNKNOWN_PROMPT: ${req.params.name}`);
    const args = (req.params.arguments ?? {}) as Record<string, string>;
    return def.render(args);
  });
}
