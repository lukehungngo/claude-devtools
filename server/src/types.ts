// server/src/types.ts

// === JSONL Event Types ===

export interface BaseEvent {
  type: "queue-operation" | "user" | "assistant" | "progress";
  uuid: string;
  parentUuid?: string;
  timestamp: string;
  sessionId: string;
  isSidechain?: boolean;
  agentId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
}

export interface QueueOperationEvent extends BaseEvent {
  type: "queue-operation";
  operation: "enqueue" | "dequeue";
  content?: string;
}

export interface UserEvent extends BaseEvent {
  type: "user";
  message: {
    role: "user";
    content: ContentItem[];
  };
  userType: "external" | "internal";
  promptId?: string;
  sourceToolAssistantUUID?: string;
  toolUseResult?: Record<string, unknown>;
  permissionMode?: string;
}

export interface AssistantEvent extends BaseEvent {
  type: "assistant";
  requestId?: string;
  message: {
    role: "assistant";
    content: ContentItem[];
    model: string;
    id: string;
    type: "message";
    stop_reason: "end_turn" | "tool_use" | null;
    usage: TokenUsage;
  };
}

export interface ProgressEvent extends BaseEvent {
  type: "progress";
  data: {
    type: string;
    hookEvent?: string;
    hookName?: string;
    command?: string;
  };
  parentToolUseID?: string;
  toolUseID?: string;
}

export type SessionEvent =
  | QueueOperationEvent
  | UserEvent
  | AssistantEvent
  | ProgressEvent;

// === Content Types ===

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ToolUseContent {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentItem =
  | TextContent
  | ThinkingContent
  | ToolUseContent
  | ToolResultContent;

// === Token Usage ===

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string;
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
  };
}

// === Analyzed Data ===

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
  sessionName?: string;
}

export interface AgentNode {
  id: string;
  type: string; // "main" | "Explore" | "Plan" | "general-purpose" | etc
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
  duration: number; // ms
  permissionMode?: string;
  contextPercent: number;
  contextWindowSize: number;
  tasks: TaskSummary;
  hasRemoteControl: boolean;
}

export interface TaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
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

// === Repo & Dashboard Types ===

export interface RepoGroup {
  cwd: string;
  repoRoot?: string;
  repoName: string;
  gitBranch?: string;
  sessions: SessionInfo[];
  lastActive: string;
  hasActiveSessions: boolean;
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

// === API Response Types ===

export interface SessionListResponse {
  sessions: SessionInfo[];
}

export interface SessionDetailResponse {
  metrics: SessionMetrics;
  events: SessionEvent[];
}
