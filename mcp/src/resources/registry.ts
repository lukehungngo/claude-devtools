import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface ResourceDefinition {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
  read: (uri: string) => Promise<{
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }>;
}

const resources: ResourceDefinition[] = [];

export function registerResource(def: ResourceDefinition): void {
  resources.push(def);
}

export function allResourceDefinitions(): ResourceDefinition[] {
  return resources;
}

export function registerResources(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resources.map(({ uri, name, mimeType, description }) => ({
      uri,
      name,
      mimeType,
      description,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const requestUri = req.params.uri;
    // Match exact URI or prefix for template URIs
    const def = resources.find(
      (d) =>
        requestUri === d.uri ||
        (d.uri.includes("{") && requestUri.startsWith(d.uri.split("{")[0]!)),
    );
    if (!def) throw new Error(`UNKNOWN_RESOURCE: ${requestUri}`);
    return def.read(requestUri);
  });
}
