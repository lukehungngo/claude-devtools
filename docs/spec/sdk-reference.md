# SDK Reference — @anthropic-ai/claude-agent-sdk

Package: `@anthropic-ai/claude-agent-sdk` v0.2.81+
Source of truth: `server/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`

---

## Core Function: query()

```typescript
function query(params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}): Query;
```

Returns a `Query` object — an `AsyncGenerator<SDKMessage, void>` with control methods.

---

## Options (Complete Catalog)

### Session Control

| Option | Type | Description | We Use? |
|--------|------|-------------|---------|
| `resume` | `string` | Session ID to resume | **Yes** |
| `continue` | `boolean` | Continue most recent session | No |
| `forkSession` | `boolean` | Fork resumed session | No (stub 501) |
| `sessionId` | `string` | Specific UUID | No |
| `resumeSessionAt` | `string` | Resume up to message UUID | No |
| `persistSession` | `boolean` | Save to disk (default: true) | No |
| `enableFileCheckpointing` | `boolean` | Track file changes for rewind | No |

### Model & Behavior

| Option | Type | Description | We Use? |
|--------|------|-------------|---------|
| `model` | `string` | Model ID | **Yes** |
| `fallbackModel` | `string` | Fallback if primary unavailable | No |
| `effort` | `"low"\|"medium"\|"high"\|"max"` | Effort level | **Yes** |
| `thinking` | `ThinkingConfig` | `{type:"adaptive"}`, `{type:"enabled",budgetTokens:N}`, `{type:"disabled"}` | No |
| `maxTurns` | `number` | Max turns before stopping | No |
| `maxBudgetUsd` | `number` | USD budget cap | No |
| `includePartialMessages` | `boolean` | Emit stream_event during streaming | **Yes** |
| `promptSuggestions` | `boolean` | Emit predicted next prompt | No |
| `agentProgressSummaries` | `boolean` | Periodic AI summaries for subagents | No |

### Permissions

| Option | Type | Description | We Use? |
|--------|------|-------------|---------|
| `canUseTool` | `CanUseTool` | Permission callback | **Yes** (partial) |
| `permissionMode` | `PermissionMode` | Mode preset | No (we do it manually) |
| `allowedTools` | `string[]` | Auto-allowed tools | No |
| `disallowedTools` | `string[]` | Blocked tools | No |
| `allowDangerouslySkipPermissions` | `boolean` | Required with bypassPermissions | No |

### Tools & Agents

| Option | Type | Description | We Use? |
|--------|------|-------------|---------|
| `tools` | `string[]\|{type:"preset",preset:"claude_code"}` | Available tools | No |
| `agent` | `string` | Agent name for main thread | No |
| `agents` | `Record<string,AgentDefinition>` | Custom subagent definitions | No |
| `toolConfig` | `ToolConfig` | Per-tool configuration | No |

### MCP & Hooks

| Option | Type | Description | We Use? |
|--------|------|-------------|---------|
| `mcpServers` | `Record<string,McpServerConfig>` | MCP servers | No |
| `hooks` | `Partial<Record<HookEvent,HookCallbackMatcher[]>>` | Hook callbacks | No |
| `onElicitation` | `OnElicitation` | MCP elicitation handler | No |
| `strictMcpConfig` | `boolean` | Strict MCP validation | No |

### System Prompt & Output

| Option | Type | Description | We Use? |
|--------|------|-------------|---------|
| `systemPrompt` | `string\|{type:"preset",preset:"claude_code",append?:string}` | System prompt | No |
| `outputFormat` | `JsonSchemaOutputFormat` | Structured JSON output | No |
| `settings` | `string\|Settings` | Override settings | No |
| `settingSources` | `SettingSource[]` | Which filesystem settings to load | No |

### Environment

| Option | Type | Description | We Use? |
|--------|------|-------------|---------|
| `cwd` | `string` | Working directory | **Yes** |
| `abortController` | `AbortController` | Cancel query | **Yes** |
| `env` | `Record<string,string\|undefined>` | Environment variables | No |
| `additionalDirectories` | `string[]` | Extra accessible directories | No |
| `plugins` | `SdkPluginConfig[]` | Local plugins | No |
| `betas` | `SdkBeta[]` | Beta features | No |
| `debug` | `boolean` | Verbose logging | No |
| `sandbox` | `SandboxSettings` | Execution isolation | No |

**Summary: We use 7 of 50+ options.** The unused options represent features we either haven't built or have reimplemented client-side.

---

## Query Control Methods

The `Query` object has methods for mid-session control. **We use NONE of these.**

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  // Session control
  interrupt(): Promise<void>;                    // Mid-stream interruption
  close(): void;                                 // Close session

  // Runtime configuration
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  setMaxThinkingTokens(n: number | null): Promise<void>;
  applyFlagSettings(settings: Settings): Promise<void>;

  // Discovery
  initializationResult(): Promise<SDKControlInitializeResponse>;
  supportedCommands(): Promise<SlashCommand[]>;
  supportedModels(): Promise<ModelInfo[]>;
  supportedAgents(): Promise<AgentInfo[]>;
  accountInfo(): Promise<AccountInfo>;

  // Checkpoint / Rewind
  rewindFiles(userMessageId: string, opts?: { dryRun?: boolean }): Promise<RewindFilesResult>;

  // MCP management
  mcpServerStatus(): Promise<McpServerStatus[]>;
  reconnectMcpServer(serverName: string): Promise<void>;
  toggleMcpServer(serverName: string, enabled: boolean): Promise<void>;
  setMcpServers(servers: Record<string, McpServerConfig>): Promise<McpSetServersResult>;

  // Advanced
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>;
  stopTask(taskId: string): Promise<void>;
}
```

### What This Means

We've been reimplementing SDK features at the application level:

| Feature | Our Approach | SDK Approach |
|---------|-------------|-------------|
| Model switching | `session.model` + new query | `query.setModel()` |
| Permission mode | `session.permissionMode` + manual check | `query.setPermissionMode()` |
| Abort | `AbortController.abort()` | `query.interrupt()` (graceful) |
| Rewind | Text passthrough "/rewind" | `query.rewindFiles(uuid)` |
| MCP status | Read settings.json | `query.mcpServerStatus()` |
| Available models | Hardcoded list | `query.supportedModels()` |
| Available commands | Hardcoded list in PromptInput | `query.supportedCommands()` |

---

## Other SDK Functions

```typescript
// Session management (filesystem-based)
function listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
function getSessionInfo(sessionId: string, options?): Promise<SDKSessionInfo | undefined>;
function getSessionMessages(sessionId: string, options?): Promise<SessionMessage[]>;
function renameSession(sessionId: string, title: string, options?): Promise<void>;
function tagSession(sessionId: string, tag: string | null, options?): Promise<void>;
function forkSession(sessionId: string, options?): Promise<ForkSessionResult>;

// MCP server creation
function createSdkMcpServer(options): McpSdkServerConfigWithInstance;
function tool(name, description, inputSchema, handler, extras?): void;
```

**Note:** We do our own session discovery via `session-discovery.ts` (direct filesystem scan) rather than using `listSessions()`. This is intentional — SDK functions spawn a subprocess, our approach is a direct read.

But `renameSession()` and `tagSession()` would solve our localStorage-only naming problem.

---

## V2 Session API (Unstable)

```typescript
function unstable_v2_createSession(options: SDKSessionOptions): SDKSession;
function unstable_v2_resumeSession(sessionId: string, options): SDKSession;
function unstable_v2_prompt(message: string, options): Promise<SDKResultMessage>;
```

Provides `send()`/`stream()` interface instead of `query()`. May be more appropriate for a web client. Currently marked `@alpha` — monitor for stability.

---

## canUseTool Callback (Full Signature)

```typescript
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];     // SDK's suggested permission rules
    blockedPath?: string;                 // Path that triggered the block
    decisionReason?: string;              // Why permission was needed
    title?: string;                       // Full prompt sentence
    displayName?: string;                 // Short noun phrase for buttons
    description?: string;                 // Human-readable subtitle
    toolUseID: string;                    // Unique per tool call
    agentID?: string;                     // Set if within a subagent
  }
) => Promise<PermissionResult>;
```

**We only use `toolName` and `input`.** The `options` parameter has rich UI data (title, displayName, description, suggestions) that would significantly improve our PermissionBlock component.

---

## PermissionResult Type

```typescript
type PermissionResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[] }
  | { behavior: "deny"; message: string; interrupt?: boolean };
```

`updatedPermissions` allows the user to create persistent rules from a single decision (e.g., "Always allow Read for this project"). We don't use this.

---

## Built-in Tools (18+)

| Tool | Category | Description | We Render? |
|------|----------|-------------|-----------|
| `Read` | File I/O | Read file contents | Yes |
| `Write` | File I/O | Write/create files | Yes |
| `Edit` | File I/O | Edit existing files (diff-based) | Yes |
| `Bash` | Execution | Run shell commands | Yes |
| `Glob` | Search | File pattern matching | Yes |
| `Grep` | Search | Content search (ripgrep) | Yes |
| `Agent` | Orchestration | Spawn a subagent | Yes (DAG) |
| `TodoWrite` | Planning | Structured task list (status, activeForm) | **No — needs panel** |
| `TaskCreate` | Planning | Create a task | Partial |
| `TaskUpdate` | Planning | Update task status | Partial |
| `WebSearch` | Web | Search the web | Yes |
| `WebFetch` | Web | Fetch URL content | Yes |
| `AskUserQuestion` | Interaction | Structured questions with choices | **Partial — needs richer UI** |
| `BashOutput` | Execution | Retrieve background bash output | No |
| `KillBash` | Execution | Kill background bash process | No |
| `NotebookEdit` | File I/O | Edit Jupyter notebook cells | No |
| `ExitPlanMode` | Control | Exit plan mode programmatically | N/A |
| `ListMcpResources` | MCP | List MCP resources | No |
| `ReadMcpResource` | MCP | Read MCP resource content | No |
