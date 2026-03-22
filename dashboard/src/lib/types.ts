// Mirrors server types — shared via API responses

export interface SessionInfo {
  id: string;
  projectHash: string;
  path: string;
  startTime: string;
  lastModified: string;
  eventCount: number;
  subagentCount: number;
}

export interface AgentNode {
  id: string;
  type: string;
  description?: string;
  parentId?: string;
  tokenUsage: AggregatedTokens;
  toolCalls: number;
  startTime?: string;
  endTime?: string;
}

export interface AgentEdge {
  source: string;
  target: string;
}

export interface AgentDAG {
  nodes: AgentNode[];
  edges: AgentEdge[];
}

export interface AggregatedTokens {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export interface ToolCallStat {
  name: string;
  count: number;
  errors: number;
  isMcp: boolean;
  mcpServer?: string;
}

export interface TurnTokens {
  index: number;
  timestamp: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  cost: number;
  cumulativeCost: number;
}

export interface SessionMetrics {
  session: SessionInfo;
  dag: AgentDAG;
  tokens: AggregatedTokens;
  tokensByModel: Record<string, AggregatedTokens>;
  tokensByTurn: TurnTokens[];
  tools: ToolCallStat[];
  totalEvents: number;
  totalToolCalls: number;
  totalAgents: number;
  models: string[];
  duration: number;
  permissionMode?: string;
}
