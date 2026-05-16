import { registerResource, type ResourceDefinition } from "./registry.js";

const CATALOG = {
  patterns: [
    {
      name: "retry_loops",
      description: "Same tool+args called 3+ times consecutively.",
      threshold: 3,
      severity: "high",
    },
    {
      name: "low_edit_to_read_ratio",
      description: "Edits without prior Read of the same file.",
      threshold: 0.7,
      severity: "medium",
    },
    {
      name: "subagent_overfanout",
      description: "Subagent breadth exceeds 5 concurrent or depth > 4.",
      threshold: 5,
      severity: "medium",
    },
    {
      name: "long_idle_session",
      description: "Session idle > 30 minutes without end_turn.",
      threshold: 1_800_000,
      severity: "low",
    },
    {
      name: "low_cache_hit",
      description: "Cache hit rate < 30% over the range.",
      threshold: 0.3,
      severity: "high",
    },
  ],
} as const;

export const antiPatternCatalog: ResourceDefinition = {
  uri: "catalog://anti-patterns",
  name: "Anti-pattern catalog",
  mimeType: "application/json",
  description: "Static catalog of anti-patterns with thresholds and severity.",
  read: async () => ({
    contents: [
      {
        uri: "catalog://anti-patterns",
        mimeType: "application/json",
        text: JSON.stringify(CATALOG, null, 2),
      },
    ],
  }),
};

registerResource(antiPatternCatalog);
