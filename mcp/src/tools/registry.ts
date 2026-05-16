export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: unknown) => Promise<unknown>;
}

// Tools are added by importing their modules. Each tool module pushes to this array.
const tools: ToolDefinition[] = [];

export function registerTool(def: ToolDefinition): void {
  tools.push(def);
}

export function allToolDefinitions(): ToolDefinition[] {
  return tools;
}
