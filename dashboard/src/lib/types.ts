// Mirrors server types — shared via API responses

// === Stop reasons (Anthropic Messages API) ===

/**
 * stop_reason values emitted by the Messages API.
 * - end_turn / max_tokens / stop_sequence / refusal: terminal (no more events without new user input).
 * - tool_use: non-terminal (tool_result and follow-up assistant events expected).
 * - pause_turn: non-terminal (extended thinking will resume automatically).
 * - null: in-flight / streaming.
 */
export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | "pause_turn"
  | "refusal"
  | null;

const TERMINAL_STOP_REASONS = new Set<StopReason>([
  "end_turn",
  "max_tokens",
  "stop_sequence",
  "refusal",
]);

export function isTerminalStopReason(reason: StopReason | undefined): boolean {
  return reason !== undefined && TERMINAL_STOP_REASONS.has(reason);
}

// === JSONL Event Types ===

/**
 * All top-level `type` values observed in real CC v2.1.143 session JSONLs.
 * See docs/spec/cc-parity-gaps.md P0-4. The `attachment` event wraps hook,
 * skill, MCP, and reminder runtime deltas (discriminated by attachment.type).
 */
export type SessionEventType =
  | "queue-operation"
  | "user"
  | "assistant"
  | "progress"
  | "system"
  | "attachment"
  | "ai-title"
  | "last-prompt"
  | "permission-mode"
  | "file-history-snapshot"
  | "worktree-state";

export type AttachmentInnerType =
  | "hook_success"
  | "hook_cancelled"
  | "hook_system_message"
  | "hook_additional_context"
  | "async_hook_response"
  | "skill_listing"
  | "deferred_tools_delta"
  | "mcp_instructions_delta"
  | "task_reminder"
  | "todo_reminder"
  | "command_permissions"
  | "queued_command";

export interface BaseEvent {
  type: SessionEventType;
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
    content: ContentItem[] | string;
  };
  userType: "external" | "internal";
  promptId?: string;
  sourceToolAssistantUUID?: string;
  toolUseResult?: Record<string, unknown>;
  permissionMode?: string;
  /** System-injected content (skill expansions, local command output, image refs) */
  isMeta?: boolean;
}

export interface AssistantEvent extends BaseEvent {
  type: "assistant";
  requestId?: string;
  message: {
    role: "assistant";
    content: ContentItem[] | string;
    model: string;
    id: string;
    type: "message";
    stop_reason: StopReason;
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

export interface SystemEvent extends BaseEvent {
  type: "system";
  subtype: string;
  durationMs?: number;
  messageCount?: number;
  isMeta?: boolean;
}

/**
 * Top-level `attachment` event — CC v2.1.143's wrapper for hook, skill,
 * MCP, reminder, and queued-command runtime deltas. The inner attachment.type
 * discriminates the payload class (see AttachmentInnerType).
 */
export interface HookSuccessAttachment {
  type: "hook_success";
  hookName: string;
  hookEvent: string;
  toolUseID?: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  content: string;
  durationMs: number;
  /**
   * Optional terminal escape sequence emitted by the hook (CC v2.1.143
   * CHANGELOG line 68 — `terminalSequence` hook output field). When set,
   * the dashboard surfaces a bell indicator on the hook row.
   */
  terminalSequence?: string;
}

export interface HookCancelledAttachment {
  type: "hook_cancelled";
  hookName?: string;
  hookEvent?: string;
  reason?: string;
}

export interface HookSystemMessageAttachment {
  type: "hook_system_message";
  hookName?: string;
  hookEvent?: string;
  message?: string;
}

export interface HookAdditionalContextAttachment {
  type: "hook_additional_context";
  hookName?: string;
  hookEvent?: string;
  context?: string;
}

export interface AsyncHookResponseAttachment {
  type: "async_hook_response";
  hookName?: string;
  hookEvent?: string;
  processId?: string;
  /**
   * PostToolUse async-hook response (CC v2.1.143). `response.duration_ms`
   * is the underlying tool execution time, per CHANGELOG line 524.
   */
  response?: {
    session_id?: string;
    transcript_path?: string;
    cwd?: string;
    permission_mode?: string;
    hook_event_name?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    tool_response?: {
      stdout?: string;
      stderr?: string;
      [key: string]: unknown;
    };
    duration_ms?: number;
    [key: string]: unknown;
  };
}

export interface SkillListingAttachment {
  type: "skill_listing";
  skills?: unknown[];
}

export interface DeferredToolsDeltaAttachment {
  type: "deferred_tools_delta";
  added?: string[];
  removed?: string[];
}

export interface McpInstructionsDeltaAttachment {
  type: "mcp_instructions_delta";
  serverName?: string;
  instructions?: string;
}

export interface TaskReminderAttachment {
  type: "task_reminder";
  taskId?: string;
  message?: string;
}

export interface TodoReminderAttachment {
  type: "todo_reminder";
  todoId?: string;
  message?: string;
}

export interface CommandPermissionsAttachment {
  type: "command_permissions";
  permissions?: unknown[];
}

export interface QueuedCommandAttachment {
  type: "queued_command";
  prompt: string;
  commandMode: string;
}

export type AttachmentPayload =
  | HookSuccessAttachment
  | HookCancelledAttachment
  | HookSystemMessageAttachment
  | HookAdditionalContextAttachment
  | AsyncHookResponseAttachment
  | SkillListingAttachment
  | DeferredToolsDeltaAttachment
  | McpInstructionsDeltaAttachment
  | TaskReminderAttachment
  | TodoReminderAttachment
  | CommandPermissionsAttachment
  | QueuedCommandAttachment
  | { type: string; [key: string]: unknown };

export interface AttachmentEvent extends BaseEvent {
  type: "attachment";
  attachment: AttachmentPayload;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export type SessionEvent =
  | QueueOperationEvent
  | UserEvent
  | AssistantEvent
  | ProgressEvent
  | SystemEvent
  | AttachmentEvent;

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
  content: string | unknown[];
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

// === API Response Types ===

export type SubagentMeta = Record<string, { agentType: string; description: string }>;

export interface SessionDetailResponse {
  metrics: SessionMetrics;
  events: SessionEvent[];
  subagentMeta?: SubagentMeta;
}

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
  isRunning?: boolean;
  source?: string;
  sessionName?: string;
  /**
   * CC entrypoint (P1-1/P1-2):
   * - "cli" — interactive claude CLI
   * - "sdk-cli" — claude --bg or `claude agents` dispatched session (background daemon)
   * - "sdk-ts" — TypeScript SDK
   * - "claude-desktop" — Claude Desktop app
   */
  entrypoint?: string;
}

export interface RepoGroup {
  cwd: string;
  repoRoot?: string;
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
  model?: string;
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

export interface RepoConfig {
  hooks: number;
  rules: number;
  agents: number;
  claudeMdFiles: number;
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
  contextPercent: number;
  contextWindowSize: number;
  tasks: TaskSummary;
  hasRemoteControl: boolean;
  repoConfig?: RepoConfig;
}

export interface TaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
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

export interface PermissionSuggestion {
  type: string;
  rules?: Array<{ toolName: string; ruleContent?: string }>;
  behavior?: string;
  destination?: string;
  mode?: string;
  directories?: string[];
}

export interface PermissionRequest {
  id: string;
  sessionId: string;
  agentId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: string;
  status: "pending" | "approved" | "denied";
  // Rich SDK fields (optional for backward compatibility)
  title?: string;
  displayName?: string;
  description?: string;
  suggestions?: PermissionSuggestion[];
  toolUseId?: string;
}

export interface AgentLogEntry {
  timestamp: string;
  eventType: string;
  agentId: string;
  contentPreview: string;
  uuid: string;
}

// === Session Control Types ===

/**
 * CC effort levels (CHANGELOG v2.1.143):
 * - low / medium / high — original three
 * - xhigh — Opus 4.7 only; sits between high and max (changelog 716, 718)
 * - max — top tier (changelog 694, 945)
 * Note: `/effort auto` is a CLI alias that resolves to `max`; not stored as its own level.
 */
export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

// === Insights Activity Types ===

export interface InsightsHeatmapCell {
  day: number;
  hour: number;
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface InsightsHourlyBucket {
  hour: number;
  tokensAvg: number;
}

export interface InsightsActivity {
  heatmap: InsightsHeatmapCell[];
  hourly: InsightsHourlyBucket[];
}

// === WebSocket Broadcast Types ===

export interface WsNewEventsMessage {
  type: "new-events";
  filePath: string;
  sessionId: string;
  source?: string;
  events: SessionEvent[];
}

export interface WsNewSessionMessage {
  type: "new-session";
  filePath: string;
  sessionId: string;
  source?: string;
}
