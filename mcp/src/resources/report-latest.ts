import { registerResource, type ResourceDefinition } from "./registry.js";

export const reportLatest: ResourceDefinition = {
  uri: "report://latest",
  name: "Latest performance report",
  mimeType: "application/json",
  description: "Last generated performance review (stub for v1 — run perf_review prompt to produce one).",
  read: async () => ({
    contents: [
      {
        uri: "report://latest",
        mimeType: "application/json",
        text: JSON.stringify({
          generatedAt: null,
          body: "No report generated yet. Run the perf_review prompt to produce one.",
        }),
      },
    ],
  }),
};

registerResource(reportLatest);
