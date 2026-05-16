/**
 * Types for the per-model + cache-hit-ratio Usage breakdown (TASK-B5 / P2-10).
 * Kept in a dedicated module to avoid editing types.ts (B1 owns that file).
 */

export interface PerModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** cache_read / (input + cache_read + cache_create); 0 if denominator is 0. */
  cacheHitRatio: number;
  totalCost: number;
}

export interface UsageBreakdown {
  perModel: PerModelUsage[];
  totalCost: number;
}

/**
 * R-3 + R-4: authoritative live-session context usage breakdown returned by
 * `query.getContextUsage()` (SDK type `SDKControlGetContextUsageResponse`).
 *
 * Mirrored locally (instead of re-exporting the SDK type) so the dashboard
 * has no runtime dep on `@anthropic-ai/claude-agent-sdk`. Server returns
 * `{ usage: LiveContextUsage | null }` — null means "not a live session,
 * fall back to /api/usage/breakdown".
 */
export interface LiveContextUsage {
  categories: { name: string; tokens: number; color: string; isDeferred?: boolean }[];
  totalTokens: number;
  maxTokens: number;
  rawMaxTokens?: number;
  percentage: number;
  gridRows: {
    color: string;
    isFilled: boolean;
    categoryName: string;
    tokens: number;
    percentage: number;
    squareFullness: number;
  }[][];
  model: string;
  memoryFiles: { path: string; type: string; tokens: number }[];
  mcpTools: { name: string; serverName: string; tokens: number; isLoaded?: boolean }[];
  deferredBuiltinTools?: { name: string; tokens: number; isLoaded: boolean }[];
  systemTools?: { name: string; tokens: number }[];
  systemPromptSections?: { name: string; tokens: number }[];
  agents: { agentType: string; source: string; tokens: number }[];
  slashCommands?: {
    totalCommands: number;
    includedCommands: number;
    tokens: number;
  };
  skills?: {
    totalSkills: number;
    includedSkills: number;
    tokens: number;
    skillFrontmatter: { name: string; source: string; tokens: number }[];
  };
  /** Fraction of context window at which autocompact fires (e.g. 0.92). */
  autoCompactThreshold?: number;
  isAutoCompactEnabled: boolean;
  messageBreakdown?: {
    toolCallTokens: number;
    toolResultTokens: number;
    attachmentTokens: number;
    assistantMessageTokens: number;
    userMessageTokens: number;
    redirectedContextTokens: number;
    unattributedTokens: number;
    toolCallsByType: { name: string; callTokens: number; resultTokens: number }[];
    attachmentsByType: { name: string; tokens: number }[];
  };
  apiUsage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  } | null;
}
