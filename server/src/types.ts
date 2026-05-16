// server/src/types.ts
// NOTE: dashboard/src/lib/types.ts mirrors these types for client-side use.
// Keep both files in sync. The dashboard types are the canonical reference
// for fields that may appear as multiple types (e.g., content: ContentItem[] | string).

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
 * All top-level event `type` values observed in real CC session JSONL files
 * (as of v2.1.143). Devtools previously listed only 5; the missing 16 were
 * silently dropped by every downstream switch — see P0-4 in docs/spec/cc-parity-gaps.md.
 *
 * Two shapes:
 * - "Conversation" events (most): share the BaseEvent shape (uuid, timestamp,
 *   parentUuid, isSidechain, cwd, version, gitBranch).
 * - "Sidecar metadata" events: minimal records (sessionId-only or sessionId +
 *   small payload). These are produced by `last-prompt`, `permission-mode`,
 *   `file-history-snapshot`, `worktree-state`, `ai-title`. They are session-
 *   level state markers, not conversation turn data. Devtools must tolerate
 *   them in the JSONL stream without crashing or warning.
 */
export type SessionEventType =
  | "queue-operation"
  | "user"
  | "assistant"
  | "progress"
  | "system"
  // Hook lifecycle (CC v2.1.143)
  | "hook_success"
  | "hook_cancelled"
  | "hook_system_message"
  | "hook_additional_context"
  | "async_hook_response"
  // Runtime context deltas
  | "skill_listing"
  | "deferred_tools_delta"
  | "mcp_instructions_delta"
  | "task_reminder"
  | "todo_reminder"
  | "command_permissions"
  // Sidecar metadata (minimal shape)
  | "ai-title"
  | "last-prompt"
  | "permission-mode"
  | "file-history-snapshot"
  | "worktree-state";

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
    // May be a plain string for simple user prompts (matches Claude Code JSONL format)
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
    // May be a plain string in some SDK responses
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
 * Conversation-shape events that share the full BaseEvent layout
 * (uuid, timestamp, parentUuid, cwd, version, gitBranch, isSidechain).
 * Devtools currently treats them as opaque — no UI surfaces them — but
 * they MUST be parsed and counted so the user-facing event count and
 * cache invariants stay correct. Future P1/P2 work adds per-type UI.
 */
export interface HookSuccessEvent extends BaseEvent {
  type: "hook_success";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface HookCancelledEvent extends BaseEvent {
  type: "hook_cancelled";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface HookSystemMessageEvent extends BaseEvent {
  type: "hook_system_message";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface HookAdditionalContextEvent extends BaseEvent {
  type: "hook_additional_context";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface AsyncHookResponseEvent extends BaseEvent {
  type: "async_hook_response";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface SkillListingEvent extends BaseEvent {
  type: "skill_listing";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface DeferredToolsDeltaEvent extends BaseEvent {
  type: "deferred_tools_delta";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface McpInstructionsDeltaEvent extends BaseEvent {
  type: "mcp_instructions_delta";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface TaskReminderEvent extends BaseEvent {
  type: "task_reminder";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface TodoReminderEvent extends BaseEvent {
  type: "todo_reminder";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

export interface CommandPermissionsEvent extends BaseEvent {
  type: "command_permissions";
  attachment?: Record<string, unknown>;
  entrypoint?: string;
  userType?: "external" | "internal";
}

/**
 * Sidecar metadata records — NOT conversation events.
 * Minimal shape, no uuid/timestamp. Persist session-level state.
 * Devtools must tolerate them in the JSONL stream; UI is opt-in.
 */
export interface AiTitleRecord {
  type: "ai-title";
  sessionId: string;
  aiTitle: string;
}

export interface LastPromptRecord {
  type: "last-prompt";
  sessionId: string;
  leafUuid?: string;
  lastPrompt: string;
}

export interface PermissionModeRecord {
  type: "permission-mode";
  sessionId: string;
  permissionMode: string;
}

export interface FileHistorySnapshotRecord {
  type: "file-history-snapshot";
  messageId: string;
  isSnapshotUpdate?: boolean;
  snapshot: Record<string, unknown>;
}

export interface WorktreeStateRecord {
  type: "worktree-state";
  sessionId: string;
  worktreeSession: Record<string, unknown>;
}

export type SessionMetadataRecord =
  | AiTitleRecord
  | LastPromptRecord
  | PermissionModeRecord
  | FileHistorySnapshotRecord
  | WorktreeStateRecord;

const SIDECAR_METADATA_TYPES = new Set<string>([
  "ai-title",
  "last-prompt",
  "permission-mode",
  "file-history-snapshot",
  "worktree-state",
]);

export function isSidecarMetadataType(type: string): boolean {
  return SIDECAR_METADATA_TYPES.has(type);
}

export type SessionEvent =
  | QueueOperationEvent
  | UserEvent
  | AssistantEvent
  | ProgressEvent
  | SystemEvent
  | HookSuccessEvent
  | HookCancelledEvent
  | HookSystemMessageEvent
  | HookAdditionalContextEvent
  | AsyncHookResponseEvent
  | SkillListingEvent
  | DeferredToolsDeltaEvent
  | McpInstructionsDeltaEvent
  | TaskReminderEvent
  | TodoReminderEvent
  | CommandPermissionsEvent;

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
  // May be a string or an array of content blocks (SDK returns both forms)
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
  isRunning?: boolean;
  source?: string;
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
  duration: number; // ms
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

// === Insights Aggregate Types ===

export type InsightsTimeRange = "24h" | "7d" | "30d" | "90d" | "all";

export interface InsightsDailyBucket {
  date: string; // "YYYY-MM-DD" UTC
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface InsightsAggregate {
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cost: number;
  sessions: number;
  turns: number;
  avgCostPerTurn: number;
  avgTokensPerTurn: number;
  activeDays: number;
  peakHour: number; // 0-23 UTC hour with highest combined token activity
  daily: InsightsDailyBucket[];
}

export interface InsightsHeatmapCell {
  day: number;    // 0=Mon … 6=Sun (UTC weekday, Mon-indexed)
  hour: number;   // 0-23 UTC hour
  intensity: 0 | 1 | 2 | 3 | 4;
}

export interface InsightsHourlyBucket {
  hour: number;       // 0-23 UTC hour
  tokensAvg: number;  // average (tokensIn + tokensOut) across sessions starting in this hour
}

export interface InsightsActivity {
  heatmap: InsightsHeatmapCell[];
  hourly: InsightsHourlyBucket[];
}

export interface InsightsModelRow {
  model: string;      // e.g. "claude-sonnet-4-6"
  tokensIn: number;
  tokensOut: number;
  cost: number;
  turns: number;
  share: number;      // fraction 0-1 of total tokens
}

export interface InsightsModelMix {
  models: InsightsModelRow[];   // sorted by total tokens desc
  totalTokens: number;
}

export interface InsightsTopRepoRow {
  repo: string;         // basename of cwd
  cwd: string;          // full filesystem path
  tokensIn: number;
  tokensOut: number;
  totalTokens: number;
  cost: number;
  share: number;        // fraction 0-1 of #1 entry's totalTokens
}

export interface InsightsTopSessionRow {
  sessionId: string;
  date: string;         // "YYYY-MM-DD"
  repo: string;
  cost: number;
  share: number;        // fraction 0-1 of #1 entry's cost
}

export interface InsightsTopToolRow {
  name: string;
  count: number;
  share: number;        // fraction 0-1 of #1 entry's count
}

export interface InsightsTopConsumers {
  repos: InsightsTopRepoRow[];       // top 5
  sessions: InsightsTopSessionRow[]; // top 5
  tools: InsightsTopToolRow[];       // top 5
}

export type CasTrend = "improving" | "stable" | "regressing";

export interface InsightsCommandRow {
  name: string;    // e.g. "/compact"
  count: number;
  share: number;   // fraction 0-1 of #1 entry's count
  daily: number[]; // call counts per day in time window, oldest first
  trend: CasTrend;
  tokensIn: number;
  tokensOut: number;
  avgTokensIn: number;
  avgTokensOut: number;
}

export interface InsightsAgentRow {
  type: string;    // subagent_type or description, e.g. "mas:engineer:engineer"
  count: number;
  share: number;
  daily: number[]; // call counts per day in time window, oldest first
  trend: CasTrend;
  tokensIn: number;
  tokensOut: number;
  avgTokensIn: number;
  avgTokensOut: number;
}

export interface InsightsSkillRow {
  name: string;    // input.skill value, e.g. "verification"
  count: number;
  share: number;
  daily: number[]; // call counts per day in time window, oldest first
  trend: CasTrend;
  tokensIn: number;
  tokensOut: number;
  avgTokensIn: number;
  avgTokensOut: number;
}

export interface InsightsCommandsAgentsSkills {
  commands: InsightsCommandRow[];  // top 10, sorted by count desc
  agents: InsightsAgentRow[];      // top 10, sorted by count desc
  skills: InsightsSkillRow[];      // top 10, sorted by count desc
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
  /** File/dir path that triggered the permission (SDK blockedPath) */
  blockedPath?: string;
  /** SDK-provided reason for why permission is needed */
  decisionReason?: string;
}

export interface AgentLogEntry {
  timestamp: string;
  eventType: string;
  agentId: string;
  contentPreview: string;
  uuid: string;
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

export interface WsPermissionRequestMessage {
  type: "permission-request";
  permission: PermissionRequest;
}

export interface WsPermissionResolvedMessage {
  type: "permission-resolved";
  id: string;
  decision: "approved" | "denied";
}

export interface WsUserQuestionMessage {
  type: "user-question";
  question: {
    id: string;
    sessionId: string;
    questionText: string;
    status: "pending" | "answered";
  };
}

export interface WsQuestionAnsweredMessage {
  type: "question-answered";
  id: string;
  answer: string;
}

export type WsBroadcastMessage =
  | WsNewEventsMessage
  | WsNewSessionMessage
  | WsPermissionRequestMessage
  | WsPermissionResolvedMessage
  | WsUserQuestionMessage
  | WsQuestionAnsweredMessage;

// === API Response Types ===

export interface SessionListResponse {
  sessions: SessionInfo[];
}

export interface SessionDetailResponse {
  metrics: SessionMetrics;
  events: SessionEvent[];
}
