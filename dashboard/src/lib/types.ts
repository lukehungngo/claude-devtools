// Mirrors server types — shared via API responses

export interface SessionInfo {
  id: string;
  projectHash: string;
  path: string;
  startTime: string;
  lastModified: string;
  eventCount: number;
  subagentCount: number;
  cwd?: string;
  gitBranch?: string;
  permissionMode?: string;
  model?: string;
  isActive?: boolean;
}

export interface RepoGroup {
  cwd: string;
  repoName: string;
  gitBranch?: string;
  sessions: SessionInfo[];
  lastActive: string;
  hasActiveSessions: boolean;
}

export interface AgentNode {
  id: string;
  type: string;
  description?: string;
  parentId?: string;
  tokenUsage: AggregatedTokens;
  toolCalls: number;
  mcpToolCalls: number;
  status: "active" | "completed" | "error";
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

export interface UsageInfo {
  fiveHour: { utilization: number | null; resetsAt: string | null };
  sevenDay: { utilization: number | null; resetsAt: string | null };
  planName: string | null;
}

export interface CostSummary {
  cost24h: number;
  cost7d: number;
  sessionCount24h: number;
  sessionCount7d: number;
  tokenIn24h: number;
  tokenOut24h: number;
  tokenIn7d: number;
  tokenOut7d: number;
}

export interface PermissionRequest {
  id: string;
  sessionId: string;
  agentId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
  status: "pending" | "approved" | "denied";
}

export interface AgentLogEntry {
  timestamp: string;
  eventType: string;
  agentId: string;
  contentPreview: string;
  uuid: string;
}
