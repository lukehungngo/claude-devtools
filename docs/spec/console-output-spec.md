# Console Output Specification (v5)

How Claude Code renders content in the terminal, and what our dashboard must reproduce.

Sources: Claude Code v2.1.89 source analysis, official docs (code.claude.com), CHANGELOG, Piebald-AI system prompt extraction, existing claude-devtools codebase analysis.

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| v5 | 2026-04-01 | Narration collapsing: text before tool calls collapsed into "Working N steps" group (NarrationGroup component). Only final response shown prominently. Fixes wall-of-text problem where 66 narration blocks were displayed at near-equal prominence to 7 response blocks. |
| v4 | -- | Phase grouping, tool color coding, agent cards |

---

## 1. Architecture Overview

Claude Code's terminal UI is a React application rendered via Ink (React for terminals). The rendering pipeline:

```
React Components (146 components)
  -> Custom React Reconciler (ink-root, ink-box, ink-text, ink-virtual-text, ink-link)
  -> Yoga Layout Engine (flexbox)
  -> Output Builder -> Screen Buffer (2D cell array)
  -> Diff Engine -> ANSI Sequences -> TTY
```

Key performance characteristics:
- Double-buffered rendering (front/back frame swap)
- Int32Array-backed character pool with bitmask-encoded style metadata
- Style interning for O(1) ANSI transitions between color/formatting states
- Hardware scroll regions via DECSTBM when terminal supports it
- ~30fps throttle from Ink, with synchronized output (DEC mode 2026) to eliminate flicker

Our dashboard replaces this entire pipeline with standard React DOM rendering.

---

## 2. Content Block Types

These are the fundamental content types in Claude API responses. Each appears as a content block within either an assistant or user message.

### 2.1 TextBlock

**API structure:**
```typescript
{ type: "text", text: string }
```

**Appears in:** Assistant messages (`assistant` events)

**Terminal rendering:**
- Rendered as the primary conversational output
- Markdown is NOT rendered in the terminal (raw markdown syntax displayed)
  - This was an open feature request as of v2.1.89
- Text streams line-by-line as it is generated
- No special prefix or label -- text flows directly after the Claude avatar/marker
- Multiple text blocks in a single response are concatenated

**Our dashboard rendering:**
- **Final response** (text after last tool call): ResponseBlock renders markdown via react-markdown + remark-gfm at full size (13px, primary color). This is an area where we exceed CLI capabilities.
- **Narration** (text before tool calls): NarrationGroup collapses working notes into a "WORKING N steps" header, expandable on click. This prevents the verbose step-by-step narration from overwhelming the final answer.

**Visibility:** Final response always shown. Narration collapsed by default (expandable).

---

### 2.2 ThinkingBlock

**API structure:**
```typescript
{ type: "thinking", thinking: string, signature?: string }
```

**Appears in:** Assistant messages, when extended thinking is enabled

**Terminal rendering:**
- Shown as a collapsible section labeled "Thinking" or "Thought for Ns"
- During streaming: shows "Thinking..." with animated indicator
- After completion: shows "Thought for Ns" (duration pill)
- Visibility toggle: Tab key while Claude is thinking
- Default: collapsed (summary only) in interactive sessions since v2.1.89
  - `showThinkingSummaries: true` in settings.json restores summaries
- Thinking blocks contain model-bound signatures that are stripped on model switch

**Our dashboard rendering:**
- StreamingThinking: purple left border, italic monospace, 3-line preview with expand
- ThinkingGroup (in TurnCard): collapsed by default, expandable
- Pulsing cursor during streaming

**Visibility:** Collapsed by default. Expandable on demand.

---

### 2.3 ToolUseBlock

**API structure:**
```typescript
{ type: "tool_use", id: string, name: string, input: Record<string, unknown> }
```

**Appears in:** Assistant messages (stop_reason === "tool_use")

**Terminal rendering (4-tier tool rendering interface):**
Each tool implements four rendering methods:
1. `renderToolUseMessage(input)` -- displays the tool invocation
2. `renderToolUseProgressMessage(input, progress)` -- shows real-time progress
3. `renderToolResultMessage(output)` -- shows completion results
4. `renderToolUseErrorMessage(error)` -- displays execution failures

Additionally, tools may implement `renderGroupedToolUse()` for parallel groups.

**Two-state progress pattern:**
- Running state: verb + "-ing..." (e.g., "Reading...", "Searching...", "Running...")
- Completed state: past tense (e.g., "Read", "Searched", "Ran")

**Collapsed-by-default pattern:**
- Individual tool calls show a one-line summary
- Tool output is hidden behind "+N lines (ctrl+o to expand)"
- Consecutive same-type tools group: "Read 6 files" instead of 6 separate entries
- MCP tools collapse to "Queried {server}"
- ls/tree/du commands show "Listed N directories"

**Left margin indicators:**
- Colored dots on the left margin indicate message type (subtle)
- Colors vary by tool category (read=teal, search=purple, bash=yellow, edit=green, error=red)

**Our dashboard rendering:**
- ToolEntries component with ToolEntryRow and CollapsedGroupRow
- Left border color-coding matches Claude Code's category colors
- Semantic summaries (buildSemanticSummary, buildGroupSummary)
- Expand/collapse per entry with chevron icons
- Phase grouping (Level 2) wraps consecutive non-agent groups

**Visibility:** Summary shown, details collapsed. Expand on click/Ctrl+O.

---

### 2.4 ToolResultBlock

**API structure:**
```typescript
{ type: "tool_result", tool_use_id: string, content: string | ContentBlock[], is_error?: boolean }
```

**Appears in:** User messages (userType "internal")

**Terminal rendering:**
- Successful results: collapsed to summary line, expandable
- Error results: always shown expanded (red highlighting)
- Large results (>50K chars): saved to `~/.claude/tool-results/{uuid}/output.txt` with preview + file path
- Result size limit: 30K characters for Bash tool (overflow persists to disk)
- Read tool: compact line-number format, deduplicates unchanged re-reads

**Our dashboard rendering:**
- ToolResultBlock component shows formatted output
- DiffBlock for Edit/Write tools shows before/after
- Errors auto-expand (StreamingToolCall auto-expands on error)

**Visibility:** Collapsed (success) or expanded (error).

---

## 3. Event Types (JSONL + SDK Stream)

### 3.1 JSONL Events (Disk Persistence)

Written to `~/.claude/projects/{hash}/{sessionId}.jsonl`.

| Event Type | Subtypes | When Written | Terminal Display |
|-----------|----------|-------------|-----------------|
| `user` (external) | -- | User sends prompt | User message bubble |
| `user` (internal) | -- | After tool execution | Hidden (tool result attached to tool_use display) |
| `assistant` | -- | Claude responds | Text output + tool calls |
| `system` / `init` | init | Session start | Not displayed (metadata) |
| `system` / `turn_duration` | turn_duration | Turn ends | Completion indicator |
| `system` / `compact_boundary` | compact_boundary | Compaction occurs | "Compacting..." status |
| `system` / `status` | status | Status change | Status indicator |
| `system` / `custom-title` | custom-title | Session renamed | Not displayed |
| `system` / `task_started` | task_started | Background task starts | Task notification |
| `system` / `task_progress` | task_progress | Task progress | Task progress update |
| `system` / `task_notification` | task_notification | Task completes/fails | Task result notification |
| `progress` | -- | Hook/tool progress | Progress indicator |
| `queue-operation` | enqueue/dequeue | Prompt queuing | Not displayed |

### 3.2 SDK Stream Events (Real-time via SSE)

From iterating `query()` with `includePartialMessages: true`.

| SDK Message Type | Our SSE Type | What It Contains | Display |
|-----------------|-------------|-----------------|---------|
| `stream_event` / content_block_delta / text_delta | `stdout` | Incremental text | Append to response |
| `stream_event` / content_block_delta / thinking_delta | `thinking` | Incremental thinking | Append to thinking block |
| `stream_event` / content_block_delta / input_json_delta | `tool_delta` | Incremental tool input | Parse tool JSON progressively |
| `stream_event` / content_block_start / tool_use | `tool_start` | Tool name + ID | Show "Running... {tool}" |
| `stream_event` / content_block_stop | `tool_end` | Block complete | Mark tool input complete |
| `assistant` (complete) | `stdout` | Full text blocks | Complete response |
| `user` (tool_result) | `tool_result` | Tool execution result | Update tool entry |
| `tool_progress` | `tool_progress` | Elapsed time for tool | Timer display |
| `tool_use_summary` | `tool_summary` | Summary of tool call | Collapsed summary |
| `system` / `status` | `status` | "compacting", etc. | Status indicator |
| `system` / `compact_boundary` | `compact` | Pre-token count | Compact result banner |
| `system` / `init` | `init` | Tools, model, cwd | Session metadata |
| `rate_limit_event` | `rate_limit` | Retry-after seconds | Rate limit banner |
| `prompt_suggestion` | `prompt_suggestion` | Suggested next prompts | Prompt suggestions |
| `system` / `task_started` | `task_started` | Task ID, description | Task panel |
| `system` / `task_progress` | `task_progress` | Task progress | Task panel |
| `system` / `task_notification` | `task_notification` | Task result | Task panel |
| `system` / `hook_started` | `hook_started` | Hook name, ID | Hook indicator |
| `system` / `hook_progress` | `hook_progress` | Hook output | Hook output |
| `system` / `hook_response` | `hook_response` | Hook exit code | Hook result |
| `local_command_output` | `command_output` | Slash command output | Command result |
| `result` | `result` | Final cost, usage, errors | Turn completion |

---

## 4. Tool-Specific Rendering

### 4.1 File Operations

| Tool | Running State | Completed State | Summary Format | Result Display |
|------|-------------|----------------|----------------|---------------|
| Read | "Reading..." | "Read" | "Read {path}" | Compact line-number format |
| Write | "Writing..." | "Wrote" | "Write {path}" | New file content (diff from empty) |
| Edit | "Editing..." | "Edited" | "Edit {path}" | Before/after diff via gitDiff() |
| NotebookEdit | "Editing..." | "Edited" | "NotebookEdit {path}" | Cell changes |

**Grouping:** Consecutive Reads collapse to "Read N files" with count badge.

### 4.2 Search Tools

| Tool | Running State | Completed State | Summary Format | Result Display |
|------|-------------|----------------|----------------|---------------|
| Grep | "Searching..." | "Searched" | `Grep "{pattern}"` | Matching lines (3 output modes) |
| Glob | "Globbing..." | "Globbed" | `Glob "{pattern}"` | Matching file paths |

**Grouping:** Consecutive Greps/Globs collapse with pattern shown in quotes.

### 4.3 Execution Tools

| Tool | Running State | Completed State | Summary Format | Result Display |
|------|-------------|----------------|----------------|---------------|
| Bash | "Running..." | "Ran" | `Bash {command}` (60 char limit) | stdout/stderr (30K limit) |

**Grouping:** Consecutive Bash calls collapse to "Ran N commands".
**Special handling:** ls/tree/du show "Listed N directories" instead.

### 4.4 Web Tools

| Tool | Running State | Completed State | Summary Format | Result Display |
|------|-------------|----------------|----------------|---------------|
| WebSearch | "Searching..." | "Searched" | "WebSearch {query}" | Search results |
| WebFetch | "Fetching..." | "Fetched" | "WebFetch {url}" | Page content |

### 4.5 Agent/Orchestration Tools

| Tool | Running State | Completed State | Summary Format | Result Display |
|------|-------------|----------------|----------------|---------------|
| Agent | "Dispatching..." | "Dispatched" | "Dispatched {description}" | Agent result + stats |
| TaskCreate | -- | -- | Task created | Task in panel |
| TaskUpdate | -- | -- | Task updated | Task in panel |

**Special rendering:** Agent dispatches render as AgentCard (separate visual treatment), not as a normal tool row. They break phase grouping (agent dispatches split phases).

### 4.6 MCP Tools

All MCP tools follow the naming pattern `mcp__[server]__[action]`.

| Display | Running | Completed | Summary |
|---------|---------|-----------|---------|
| Single | "Running..." | Tool name | "Queried {server}" |
| Grouped | -- | -- | "Queried {server}" (collapsed) |

### 4.7 Other Tools

| Tool | Category | Display Notes |
|------|----------|--------------|
| AskUserQuestion | Interaction | Renders as QuestionBlock with choices |
| TodoWrite | Planning | Task checklist (real-time updates) |
| Skill | Skills | Executes a skill within conversation |
| LSP | Code Intel | Type errors/warnings, jump-to-def results |
| CronCreate/Delete/List | Scheduling | Session-scoped scheduled tasks |
| EnterPlanMode/ExitPlanMode | Control | Mode transition indicators |
| ToolSearch | Discovery | Loads deferred MCP tools |

---

## 5. Rendering Rules

### 5.1 What Gets Shown vs Hidden

| Content | Shown | Hidden | Notes |
|---------|-------|--------|-------|
| Assistant text (final) | Always | -- | Primary output — text after last tool call |
| Assistant text (narration) | Summary only | Full text | Collapsed "Working N steps" — text before tool calls |
| Thinking blocks | Summary only | Full text | Collapsed "Thinking" — expand on demand |
| Tool invocation | Summary line | -- | Always shows one line |
| Tool result (success) | Hidden | Full output | Expand on demand |
| Tool result (error) | Full output | -- | Always expanded |
| User prompt (external) | Always | -- | User bubble |
| User prompt (internal/tool) | Hidden | Full content | Part of tool result flow |
| System events | Hidden | -- | Metadata only |
| Progress events | Shown | -- | Hook/tool progress |
| Queue operations | Hidden | -- | Internal bookkeeping |
| Sidechain events | Hidden | -- | Subagent's own JSONL |
| isMeta user events | Hidden | -- | System-injected content |

#### 5.1.1 Narration vs Final Response (v5)

Claude's assistant text blocks fall into two categories:

1. **Narration** — text emitted *before* the last tool_use in a turn. These are working notes like "Let me check...", "Now I see...", "Let me verify...". In the CLI they scroll by quickly; in the dashboard they were previously rendered at full prominence, creating a noisy wall of text.

2. **Final response** — text emitted *after* the last tool_use (or all text when no tools are called). This is the actual answer the user cares about.

**Detection:** `extractResponseContent()` in TurnCard tags each text block with `isNarration: true` when `eventIdx < lastToolUseIdx` (the index of the last assistant event containing a `tool_use`).

**Rendering:**
- Narration → `NarrationGroup` component (collapsed by default, like ThinkingGroup)
  - Header: "WORKING {N} steps · {chars} chars"
  - Body: each narration block shown with left border, small monospace text
  - Click to expand/collapse
- Final response → `ResponseBlock` at full size (13px, primary color, markdown rendered)

This mirrors the CLI experience where narration is ephemeral (scrolls past) and only the final answer persists on screen.

### 5.2 Streaming vs Completed Display

During streaming (tool running):
- Animated spinner/pulsing dot
- Verb-ing form ("Reading...", "Searching...")
- Elapsed time counter (100ms tick)
- Partial JSON for tool input (accumulated progressively)
- No result content yet

After completion (tool done):
- Static status icon (checkmark or X)
- Past-tense form ("Read", "Searched")
- Final elapsed time
- Result available (collapsed by default, auto-expanded for errors)
- DiffBlock available for Edit/Write tools

### 5.3 Grouping Rules

**Level 1 (ToolGroup):** Consecutive same-name, non-error entries collapse.
- "Read 6 files" with count badge
- Error entries NEVER collapse into a passing group (always individual)
- Count badge color matches tool category

**Level 2 (Phase):** Consecutive non-agent groups form a phase.
- Agent dispatches split phases (each Agent/Task is a phase boundary)
- Single-group phases are not wrapped (no redundant nesting)
- Phase labels inferred from: thinking context > first Grep/Glob pattern > dominant filenames > fallback count

### 5.4 Color Coding

| Tool Category | Left Border Color | Badge Color |
|--------------|-------------------|-------------|
| Read, Glob, ListDir | Teal | Teal dim/teal |
| Grep, WebSearch, WebFetch | Purple | Accent dim/accent |
| Bash, Execute | Amber/Yellow | Yellow dim/yellow |
| Edit, Write | Green | Green dim/green |
| Agent, Task | Accent (brand) | -- |
| Error (any tool) | Red | -- |
| Other | Border default | bg-h/text3 |

### 5.5 Status Icons

| Status | Icon | Color |
|--------|------|-------|
| Success | Checkmark (U+2713) | Green |
| Running | Filled triangle (U+25B6) or pulsing dot | Amber |
| Error | X mark (U+2717) | Red |

---

## 6. Information Hierarchy (Turn Structure)

A complete turn in the terminal renders top-to-bottom:

```
[User avatar] User prompt text
  (collapsible if long)

[Claude avatar] Claude
  [Agent pills] (if subagents involved)
  
  [Thinking] "Thought for Ns"            <- collapsed, expandable
  
  [Narration] "WORKING 4 steps · 1935c"  <- collapsed, expandable (v5)
  
  [Final response text]                   <- markdown rendered, full prominence
  
  [Tool entries card]                     <- bordered container
    [Phase group] "Label..."             <- if multi-group phase
      [Tool row] checkmark Read src/...   <- individual or collapsed group
      [Tool row] checkmark Grep "pat"
    [Agent card] Dispatched "..."         <- separate visual treatment
    [Tool row] X Bash npm test            <- error, always individual
  
  [Cost footer] $0.05 (main) + $0.02 (2 agents)
  
  [Completion] checkmark Completed in 12s
```

### 6.1 Streaming Turn (Active)

```
[Thinking block] with pulsing cursor   <- if thinking enabled
[Streaming text] appearing incrementally
[Tool call 1] spinner Reading... src/foo.ts  2.1s
[Tool call 2] spinner Running... npm test    5.3s
[Compacting...] with pulsing dot        <- if context compaction
```

### 6.2 System Status Indicators

| Status | Display | Duration |
|--------|---------|----------|
| Compacting | "Compacting conversation context..." with pulsing dot | Until compact_boundary |
| Compact complete | "Context compacted (was N tokens)" green banner | 3 seconds then fade |
| Rate limited | Retry-after banner with timer | Until limit expires |
| Generating | "Generating..." with pulsing dot and elapsed timer | Until turn complete |
| Working | "Working..." with pulsing dot | During tool execution |

---

## 7. Permission Display

When a tool requires permission:

**Terminal (CLI):**
- Shows tool name, input preview, and description
- Options: Allow / Deny / Allow for Session
- Shift+Tab cycles permission modes
- Rich SDK fields available: title, displayName, description, suggestions, blockedPath, decisionReason

**Our dashboard:**
- PermissionBlock component with approve/deny buttons
- Forwards rich SDK fields (title, displayName, description, suggestions)
- WebSocket broadcast for real-time permission requests
- 10-minute timeout (auto-deny)

---

## 8. Special Content Types

### 8.1 Images

- Pasted images insert `[Image #N]` chip at cursor position
- Images are sent as base64 content blocks in user messages
- Terminal cannot display images (text reference only)
- Our dashboard can display inline image previews (advantage over CLI)

### 8.2 Diffs (Edit/Write)

- Edit tool shows before/after diff via gitDiff()
- Write tool shows full new content as diff from empty
- Terminal shows colored diff output (+green, -red)
- Our dashboard uses DiffBlock component with syntax highlighting

### 8.3 Tasks (TodoWrite / TaskCreate)

- TodoWrite renders as a checklist in non-interactive mode
- TaskCreate/Update render in a separate Task panel
- Real-time status updates as Claude works
- Task statuses: pending, running, completed, failed, killed
- Accessible via Ctrl+T or `/tasks` command

### 8.4 Questions (AskUserQuestion)

- Renders as a structured question with multiple-choice options
- Our dashboard uses QuestionBlock component
- WebSocket-based resolution (similar to permissions)
- 10-minute timeout

### 8.5 Hook Events

- hook_started: shows hook name starting
- hook_progress: shows hook output incrementally
- hook_response: shows completion with exit code
- Large hook output (>50K chars): saved to disk with preview

---

## 9. Gaps Between CLI and Dashboard

### Things CLI does that we render differently:

| Feature | CLI | Dashboard | Notes |
|---------|-----|-----------|-------|
| Markdown | Raw syntax | Rendered HTML | Dashboard is better |
| Images | Text reference only | Inline preview | Dashboard is better |
| Diffs | Colored terminal diff | DiffBlock component | Dashboard is better |
| Tool grouping | Dynamic collapse | Phase groups | Similar concept |
| Keyboard nav | Ctrl+O, Tab, Esc+Esc | Click-based | Different paradigm |

### Things CLI does that we don't yet:

| Feature | CLI Behavior | Our Status |
|---------|-------------|------------|
| Brief mode | Ctrl+Shift+B toggles all tool output | No global brief toggle |
| Transcript mode | Ctrl+O with / search, n/N nav | TranscriptSearch exists but different UX |
| Section navigation | Jump between messages via Esc+Esc | No equivalent |
| Tool search in deferred MCP | ToolSearch loads on demand | Not implemented |
| Output styles | `/output-style` changes formatting | Not implemented |
| Scroll-to-section | Hardware scroll regions | Standard browser scroll |

---

## 10. SDK Message Type Reference

Complete enumeration of SDK message types from the query() iterator:

| SDK Type | `type` Field | Content | Priority |
|----------|-------------|---------|----------|
| SDKPartialAssistantMessage | `stream_event` | Content block deltas | Forwarded |
| SDKAssistantMessage | `assistant` | Complete response + usage | Forwarded |
| SDKUserMessage | `user` | Tool results | Forwarded |
| SDKResultMessage | `result` | Final cost, usage, errors | Forwarded |
| SDKToolProgressMessage | `tool_progress` | Tool elapsed time | Forwarded |
| SDKToolUseSummaryMessage | `tool_use_summary` | Tool call summary | Forwarded |
| SDKSystemMessage / init | `system` | Tools, model, MCP, agents | Forwarded |
| SDKStatusMessage | `system` / status | "compacting", "thinking" | Forwarded |
| SDKCompactBoundaryMessage | `system` / compact_boundary | Compaction metadata | Forwarded |
| SDKRateLimitEvent | `rate_limit_event` | Retry-after seconds | Forwarded |
| SDKPromptSuggestionMessage | `prompt_suggestion` | Next prompt suggestions | Forwarded |
| SDKTaskStartedMessage | `system` / task_started | Background task start | Forwarded |
| SDKTaskProgressMessage | `system` / task_progress | Task progress | Forwarded |
| SDKTaskNotificationMessage | `system` / task_notification | Task result | Forwarded |
| SDKHookStartedMessage | `system` / hook_started | Hook start | Forwarded |
| SDKHookProgressMessage | `system` / hook_progress | Hook output | Forwarded |
| SDKHookResponseMessage | `system` / hook_response | Hook result | Forwarded |
| SDKLocalCommandOutputMessage | `local_command_output` | Slash command output | Forwarded |

All 21 SDK message types are mapped through `mapSdkMessageToSSEEvents()` in `server/src/http/sse-event-handler.ts`.

---

## 11. Subagent Output

### JSONL Structure
```
{sessionId}/subagents/agent-{agentId}.jsonl     # Agent conversation
{sessionId}/subagents/agent-{agentId}.meta.json  # { agentType, description }
```

### Display Rules
- Main session events with `isSidechain: true` are filtered from primary display
- Agent dispatch (tool_use with name "Agent" or "Task") renders as AgentCard
- AgentCard shows: agent name, description, status, tool stats, duration, cost
- Agent result text is truncated to 500 chars with expand
- Subagent events are visible in the Agent Log panel (separate from main conversation)
- DAG visualization shows agent relationships (XYFlow)

### Agent Types
- `Explore` -- codebase exploration (read-only tools)
- `Plan` -- architecture planning
- `general-purpose` -- broad tasks
- Custom agents from `.claude/agents/{name}/CLAUDE.md`

---

## 12. Context Compaction Display

When context window fills:

1. Status event: "compacting" -> dashboard shows "Compacting conversation context..." with pulsing dot
2. Compact boundary event with pre-token count -> "Context compacted (was N tokens)" green banner
3. Banner auto-fades after 3 seconds

Manual compact via `/compact [focus]` follows the same display path.

The `/context` command shows a colored grid visualization of context window usage (CLI-specific, not in dashboard).
