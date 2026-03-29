# Claude DevTools — Product Spec v3

**Author:** Luke
**Date:** 2026-03-24 (updated 2026-03-29)
**Status:** Active
**Version:** 3.1
**Supersedes:** v1.0 (observability-only), v2.0 (observability + conversation view)

---

## The Vision Shift

v1 and v2 positioned this app as an "observability cockpit" — you watch what the CLI does, but the CLI is the engine. v1 explicitly said "Non-Goal: Replacing the CLI."

**v3 reverses that.** This is a **full Claude Code web client** that can 100% replace the terminal CLI. You can start sessions, have multi-turn conversations, approve/deny tool permissions, see the agent graph, trace snapshot history — everything, in the browser. The terminal becomes optional, not required.

The observability layer (graph, snapshots, agent log, conversation view) is still the differentiator — it's what makes this better than the CLI, not just equivalent. But the foundation is a fully interactive Claude Code session, not a read-only replay viewer.

---

## What This App Is

A **web-based Claude Code client** with built-in agent observability. It does everything the CLI does — multi-turn conversation, tool execution, permission handling, session management — plus things the CLI physically cannot do:

1. **Spatial awareness** — See 12 agents as a live graph, not interleaved text
2. **Snapshot traceability** — Step back through each prompt's agent execution like browser history
3. **Cross-session context** — Switch between repos and sessions in one click
4. **Cost attribution** — See which agent burned how much, per-turn and per-session
5. **Visual permission control** — Approve/deny tool calls from a clean UI, not inline terminal prompts
6. **Filterable structured logs** — "Show me only what the engineer agent did" with one click

---

## Core Engine: Claude Agent SDK

The app is powered by `@anthropic-ai/claude-agent-sdk` (TypeScript). The SDK provides:

| Capability | SDK API | Status in Our Codebase |
|-----------|---------|----------------------|
| Multi-turn sessions | `query()` with `resume` / `continue` | ✅ Implemented — `SessionManager.sendMessage()` uses `resume: sessionId` via POST `/api/sessions/:id/message` |
| Real-time streaming | `includePartialMessages: true` → `stream_event` | ✅ Used in both session and legacy command routes (SSE) |
| Permission handling | `canUseTool` callback → `PermissionResultAllow/Deny` | ✅ Implemented — Promise-based in SessionManager (10min timeout), polling in legacy route |
| Session resume | `resume: sessionId` / `continue: true` | ✅ Implemented — `POST /api/sessions/:id/resume` + `SessionManager.resumeSession()` |
| Session listing | `listSessions()` / `getSessionMessages()` | ❌ Not used — we scan JSONL files directly |
| Subagent tracking | `parent_tool_use_id` on messages | ⚠️ Partial — DAG built from JSONL metadata, not live SDK events |
| Token/cost per query | `ResultMessage.usage` + `total_cost_usd` | ⚠️ Partial — we compute from JSONL, not SDK |
| Session forking | `forkSession: true` | ❌ Not used — `forkSession()` method not yet implemented |
| User questions | `canUseTool("AskUserQuestion")` → answers | ✅ Implemented — `QuestionBlock` UI + `POST /api/questions/:id/answer` + `GET /api/questions/pending` |

**Current state:** The SDK is wired up for multi-turn sessions via `SessionManager` (server/src/session/session-manager.ts). The legacy one-shot `/api/command` route coexists for backward compatibility. The remaining gap is `forkSession` support and migrating fully off the legacy route.

> **Important: `query({ resume })` latency.** Each `sendMessage()` call spawns a new CLI subprocess and replays the full session history from JSONL. For a 50-turn session, this means 10-30s reconstruction before the new prompt is processed. The spec's `<50ms` latency target applies only to event streaming *after* reconstruction completes. The `unstable_v2_resumeSession` / `SDKSession` API offers true persistent sessions but is marked `@alpha`. For v3, we accept the reconstruction latency and document it as a known limitation.

---

## Current System Audit

### What We Already Have (✅ Done Right)

**Server — Solid Foundation:**

| Component | File | What It Does | Quality |
|-----------|------|-------------|---------|
| JSONL Parser | `jsonl-reader.ts` | Full + incremental parsing with character offsets | ✅ Adequate — fail-safe, but reads full file on every change and uses character offsets (not byte offsets). Sufficient for current scale; may need optimization for very long sessions. |
| Session Discovery | `session-discovery.ts` | Scans `~/.claude/projects/`, groups by repo, detects worktrees | ✅ Good — handles subagents, metadata extraction |
| Metrics Engine | `metrics.ts` | Token aggregation, cost calc, context window % | ✅ Good — per-model pricing, cache tokens |
| DAG Builder | `dag-builder.ts` | Agent graph from JSONL events | ✅ Good — parent-child linking, status detection |
| Tool Stats | `tool-stats.ts` | Tool call counting, MCP detection | ✅ Good |
| Cost Aggregator | `cost-aggregator.ts` | 24h/7d cost windows with caching | ✅ Good |
| File Watcher | `watcher.ts` | Chokidar on `~/.claude/projects/**/*.jsonl` | ✅ Good — incremental, 200ms stabilization |
| WebSocket Broadcast | `server.ts` | Push new events to all clients | ✅ Good — clean broadcast pattern |
| Usage Client | `usage-client.ts` | Anthropic API usage with keychain + fallback | ✅ Excellent — graceful degradation, caching |
| SDK Integration | `routes.ts` + `session-manager.ts` | Multi-turn sessions via `SessionManager`, SSE streaming | ✅ Good — multi-turn with resume, Promise-based permissions, 10min timeout |
| Permission Handler | `permission-handler.ts` + `session-manager.ts` | In-memory permission store + Promise-based resolution | ⚠️ In-memory only; cleanup now scheduled on resolve |

**Dashboard — Well-Structured UI:**

| Component | File | What It Does | Quality |
|-----------|------|-------------|---------|
| ConversationView | `conversation/ConversationView.tsx` | Turn-grouped event display, search, auto-scroll | ✅ Good — matches v3 mockup design |
| TurnCard | `conversation/TurnCard.tsx` | Collapsible turns with agent pills, tool entries | ✅ Good |
| AgentPills | `conversation/AgentPills.tsx` | Clickable agent pills with status, cost, count | ✅ Good |
| ToolEntries | `conversation/ToolEntries.tsx` | Compact tool call rows | ✅ Good |
| PromptInput | `conversation/PromptInput.tsx` | Textarea with auto-resize, SSE streaming | ✅ Good — session-aware, routes to active session API |
| RightPanel | `right-panel/RightPanel.tsx` | 2-layer tabs (graph\|log × snapshots) | ✅ Good — matches v3 mockup |
| PrimaryTabs | `right-panel/PrimaryTabs.tsx` | Agent Graph \| Agent Log switching | ✅ Good |
| SnapshotTabs | `right-panel/SnapshotTabs.tsx` | Browser-style turn tabs with close/history | ✅ Good |
| AgentFlowDAG | `AgentFlowDAG.tsx` | @xyflow/react + dagre graph visualization | ✅ Good — animated, color-coded |
| AgentLogs | `AgentLogs.tsx` | Virtualized log with invocation grouping | ✅ Good — @tanstack/react-virtual |
| TopBar | `TopBar.tsx` | 3-row status strip with all metrics | ✅ Good |
| RepoList | `RepoList.tsx` | Sidebar with repo/session navigation | ✅ Good |
| Layout | `Layout.tsx` | 3-column CSS grid (260px \| 1fr \| 520px) | ✅ Good |
| Turn Snapshot Logic | `lib/turnSnapshot.ts` | Groups events into turns, computes per-turn cost | ✅ Good |
| Design Tokens | `tailwind.config.js` + `globals.css` | Full `dt-*` token system, dark theme | ✅ Good |

**Hooks — Data Pipeline:**

| Hook | What It Does | Quality |
|------|-------------|---------|
| `useSessionMetrics` | REST fetch of session metrics + events | ✅ Good |
| `useEventStream` | Callback handler for unified WS live events (capped 2000) | ⚠️ Cap is a limitation; no own WS — uses unified |
| `useRepos` | Fetch repo groups | ✅ Good |
| `useNewSessionListener` | WS detection of new sessions | ✅ Good |
| `useUsage` | Anthropic usage API (5min poll) | ✅ Good |
| `useCosts` | 24h/7d cost aggregation | ✅ Good |

**Tests — ~280 passing:**
- Server: 12 test files (~101 cases) — parser, analyzer, DAG, permissions, session manager, routes
- Dashboard: 25 test files (~177 cases) — pure logic, component logic, hooks
- Missing: most UI rendering integration tests

---

### What's Wrong (🔴 Done Wrong — updated 2026-03-25)

> **Note:** Items 1, 3, and 4 below have been largely addressed since the original spec was written. They are kept for historical context with updated status annotations.

#### 1. ~~One-Shot Command Model~~ (RESOLVED — legacy route coexists with SessionManager)

**Current:** POST `/api/command` sends `claude -p "prompt"` — one message, one response, session ends. This is the v1 "dispatch" model.

**Problem:** A full Claude Code client needs persistent sessions. User sends message 1, gets response, sends message 2 in the same session context. The SDK supports this with `resume: sessionId`, but we never use it.

**Fix:** Replace one-shot dispatch with a session-based conversation API:
```typescript
// NEW: Start or resume a session
POST /api/sessions/:sessionId/message
{ prompt: "Fix the auth bug", cwd: "/repo" }

// Server: query({ prompt, options: { resume: sessionId, includePartialMessages: true } })
// Streams SSE back to client
```

**Impact:** Medium — server route refactor + PromptInput client changes. SDK already supports it.

#### 2. Permission Polling (500ms) Instead of WebSocket Push

**Current:** The `canUseTool` callback in the command route (`routes.ts:244-253`) polls `getPermissionStatus()` every 500ms via `setInterval`. The full flow: hook script POSTs `/api/permissions/request` → `addPermissionRequest()` stores in-memory Map → broadcasts via WS → dashboard shows approve/deny → user clicks → POSTs `/api/permissions/:id/decide` → `resolvePermissionRequest()` → server-side `setInterval(500ms)` eventually sees the decision and clears. In-memory only — server restart loses all state.

**Problem:** 500ms latency on every permission decision. Blocking. Doesn't scale to rapid tool calls. Permission state vanishes on restart (P2 per audit).

**Fix:** Use a Promise-based approach — `canUseTool` returns a Promise that resolves when the WS-triggered approval arrives:
```typescript
canUseTool: async (toolName, input) => {
  const req = addPermissionRequest({ toolName, input });
  broadcast(state, { type: 'permission-request', request: req });
  return new Promise((resolve) => {
    permissionResolvers.set(req.id, resolve);
  });
}
// When POST /api/permissions/:id/decide arrives:
permissionResolvers.get(id)(decision);
```

**Impact:** Low — isolated to permission-handler.ts + command route.

#### 3. ~~Three Separate WebSocket Connections~~ (RESOLVED — single unified WS with reconnect)

**Current:** Dashboard opens 3 independent WS connections: `useEventStream`, `useNewSessionListener`, `usePermissions`. Plus 3s polling for agent logs (`useAgentLogs.ts:35`), 5min polling for usage (`useUsage.ts`). Reconnection logic exists (`useWebSocket.ts`) but is unused — dead code.

**Full audit of all event-listening paths** (from `docs/reports/event-listening-audit.md`):

| Path | Mechanism | Latency | Issues |
|------|-----------|---------|--------|
| Session events | `new WebSocket()` in `useEventStream.ts` | ~100ms push | Buffer cap 2000; no reconnect |
| New session notifications | `new WebSocket()` in `useNewSessionListener.ts` | ~100ms push | No reconnect |
| Permission requests | `new WebSocket()` in `usePermissions.ts` | ~100ms push | No error handling |
| Agent logs | `setInterval(fetch, 3000)` in `useAgentLogs.ts` | 3s pull | Runs always; no adaptive backoff |
| Anthropic usage | `setInterval(fetch, 300000)` in `useUsage.ts` | 5min pull | Fine as-is (infrequent) |
| Session metrics | REST fetch, debounced by WS events | 150ms (was 500ms, fixed in feedback_v4) | Re-fetches full session on every event |
| Command output | `fetch + getReader()` SSE | ~0ms streaming | Correct as-is (AbortController) |
| Server-side permission | `setInterval(check, 500)` in `routes.ts:244` | 500ms poll loop | Blocks in canUseTool callback |

**Audit verdict (Variant D):** The right technique varies by data shape. Do NOT unify everything to WS-only — that risks metric recompute thrashing (5-20x/sec `computeMetrics()`) and violates invariant #5. Instead, targeted fixes:

**Fix:** Single WS connection with message type dispatch + 4 targeted improvements:
```typescript
// Server broadcasts typed messages on single WS:
{ type: "new-events", filePath, events }
{ type: "new-session", filePath }
{ type: "permission-request", request }
{ type: "permission-resolved", id, decision }
{ type: "session-stream", sessionId, event }  // NEW: live SDK events

// Client: single useWebSocket() → route by type
```

| Fix | Current | Target | Effort |
|-----|---------|--------|--------|
| WS reconnect | No reconnect → silent dead feed | Adopt existing `useWebSocket.ts` backoff | 1h |
| Agent logs | 3s `setInterval` always running | WS-triggered refetch on `liveEvents.length` change | 1h |
| WS multiplexing | 3 separate connections | 1 connection + type-based dispatch | 2h |
| Debounce | 500ms → 150ms (already done in feedback_v4) | ✅ Done | — |

**Impact:** Medium — refactor all WS hooks into one multiplexed connection. SSE stays for command streaming (correct tool for unbounded LLM token streams). REST stays for initial hydration.

#### 4. ~~JSONL-Only Data Source for Live Sessions~~ (PARTIALLY RESOLVED — dual-path exists for web-UI sessions)

**Current:** Even for live sessions, we read JSONL files from disk. The file watcher detects changes, parses new events, broadcasts them. This is correct for **replaying historical sessions** but is the wrong architecture for **the active session we're running**.

**Problem:** When we're the ones running the SDK session, we have the events in-memory already — they come from the `query()` async iterator. Writing them to JSONL (which Claude Code does) and then reading them back from disk is a round-trip through the filesystem.

**Fix:** For sessions we start ourselves (via the web UI), stream SDK events directly to the client via SSE/WS. Still read JSONL for historical sessions and sessions started from the terminal CLI.

Two data paths:
```
Active session (started from web UI):
  SDK query() → async iterator → SSE/WS → Dashboard (real-time, <50ms)

Historical / CLI session (started from terminal):
  JSONL file → chokidar → parser → WS → Dashboard (real-time, ~200ms)
```

**Impact:** Medium — new streaming path for active sessions. Existing JSONL path stays for history.

#### 5. No Session Lifecycle Management

**Current:** The app discovers sessions from disk. It can view them but cannot: start a new session, resume an existing session, fork a session, or end a session.

**Problem:** A full client needs session lifecycle. "New conversation" button, "Resume this session" button, "Fork and try a different approach" button.

**Fix:** New API endpoints + SDK integration:
```typescript
POST   /api/sessions/new          → start new session (returns sessionId)
POST   /api/sessions/:id/message  → send message to session (SSE stream)
POST   /api/sessions/:id/resume   → resume existing session
POST   /api/sessions/:id/fork     → fork session (new branch)
DELETE /api/sessions/:id          → end/close session
GET    /api/sessions/:id/messages → get full transcript
```

**Impact:** High — new server-side session manager + dashboard UI.

---

### What's Missing (⬜ Gaps)

| Gap | Priority | Scope | Blocked By |
|-----|----------|-------|-----------|
| **Multi-turn session API** | P0 | Server route + SDK upgrade | Nothing — SDK supports it |
| **Session lifecycle UI** (new/resume/fork) | P0 | Dashboard + server endpoints | Multi-turn API |
| **Permission approval UI** (in conversation flow) | P0 | ConversationView + server | Promise-based canUseTool |
| **AskUserQuestion handling** | P0 | ConversationView UI | canUseTool callback |
| **WS multiplexing** (single connection) | P1 | Server broadcast + all hooks | Nothing |
| **WS reconnection** (use existing useWebSocket.ts) | P1 | Hook refactor | WS multiplexing |
| **Setup Gate** (first-launch wizard) | P1 | Full-screen wizard + server validation | Nothing |
| **Dual data path** (SDK direct + JSONL replay) | P1 | Server architecture | Multi-turn API |
| **Add Repo button handler** | P1 | Sidebar onClick | Nothing |
| **Empty state CTA** | P1 | Sidebar | Nothing |
| **Activity rings on graph nodes** | P2 | AgentFlowDAG enhancement | Nothing |
| **Graph tooltip "View in Agent Log →"** | P2 | AgentFlowDAG + RightPanel | Nothing |
| **SQLite session index** | P2 | Server persistence | Nothing |
| **True 10K+ log virtualization** | P2 | AgentLogs | Partially done (@tanstack/react-virtual exists) |

---

### Known Bugs

| Bug | Severity | File | Description |
|-----|----------|------|-------------|
| ~~Worktree .git detection~~ | ~~P2~~ | `session-discovery.ts` | ✅ FIXED — `resolveRepoRoot()` handles `.git` file (worktree symlink) correctly |
| Permission state lost on restart | P2 | `permission-handler.ts` | In-memory Map, no persistence. Cleanup now scheduled on resolve. Promise timeout (10min) prevents hangs. |
| ~~DAG node costs sonnet-only~~ | ~~P3~~ | `dag-builder.ts` | ✅ FIXED — `aggregateTokens()` now uses per-model pricing from `event.message.model` |
| ~~Dashboard sonnet pricing duplication~~ | ~~P3~~ | `turnSnapshot.ts`, `AgentLogs.tsx` | ✅ FIXED — constants extracted to shared `lib/cost.ts`, imported by both files |
| ~~SummaryCards gray colors~~ | ~~P3~~ | `SummaryCards.tsx` | ✅ FIXED — uses `dt-*` tokens now |
| Live event buffer 2000 cap | P2 | `useEventStream.ts` | Drops oldest beyond 2000; long sessions lose mid-stream events |
| ~~File watcher never closed~~ | ~~P3~~ | `watcher.ts` | ✅ FIXED — `startWatcher()` returns `{ close }` handle for cleanup |
| Model pricing hardcoded | P2 | `metrics.ts` | March 2026 rates; must manually update |

---

## Architecture: Current vs. Target

### Current Architecture (Observability-Only)

```
Terminal CLI ──writes──→ JSONL files ──reads──→ Server ──pushes──→ Dashboard
                                                  ↑
                              One-shot claude -p ─┘ (fire & forget)
```

The app is a **passive reader** of JSONL files that Claude Code CLI writes. The only active capability is one-shot command dispatch.

### Target Architecture (Full Client)

```
┌────────────────────────────────────────────────────────────────┐
│                     Dashboard (Browser)                         │
│                                                                │
│  ConversationView ←──SSE──→ Session Manager ←──WS──→ Sidebar  │
│  (multi-turn chat)          (active sessions)  (session list)  │
│  PermissionPanel ←──WS────→                                   │
│  AgentFlowDAG ←───WS──────→                                   │
│  AgentLogs ←──────WS──────→                                   │
└────────────────┬───────────────────────────┬──────────────────┘
                 │ SSE (active session)      │ WS (live events)
                 ↓                           ↓
┌────────────────────────────────────────────────────────────────┐
│                     Express Server                             │
│                                                                │
│  ┌──────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │ Session Manager   │  │ JSONL Pipeline   │  │ WS Hub       │ │
│  │ (SDK wrapper)     │  │ (read-only)      │  │ (multiplexed)│ │
│  │                   │  │                  │  │              │ │
│  │ • new session     │  │ • chokidar watch │  │ • new-events │ │
│  │ • resume session  │  │ • incremental    │  │ • new-session│ │
│  │ • send message    │  │   parse          │  │ • permission │ │
│  │ • canUseTool      │  │ • computeMetrics │  │ • session-   │ │
│  │ • stream events   │  │ • buildDAG       │  │   stream     │ │
│  │ • fork session    │  │                  │  │              │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────┘ │
│           │                      │                              │
│           ↓                      ↓                              │
│  Claude Agent SDK        ~/.claude/projects/**/*.jsonl          │
│  (multi-turn, streaming,  (source of truth for all sessions)   │
│   permissions, subagents)                                       │
└────────────────────────────────────────────────────────────────┘
```

**Two data paths, one dashboard:**

| Path | Source | Use Case | Latency |
|------|--------|----------|---------|
| **SDK Direct** | `query()` async iterator → SSE | Active session started from web UI | <50ms |
| **JSONL Replay** | chokidar → parser → WS | Historical sessions + CLI-started sessions | ~200ms |

Both paths produce the same `SessionEvent` shape. The dashboard doesn't care which path delivered the event — it renders the same ConversationView, AgentFlowDAG, and AgentLogs either way.

### Current Data Flow Paths (from event-listening audit)

These are the existing paths we keep, fix, or extend:

**Path 1 — Session Event Stream (KEEP + fix reconnect):**
```
JSONL file appended (Claude Code agent writes event)
  → chokidar watcher.on("change") [200ms stabilization]
  → parseJsonlIncremental(filePath, offset) [byte-offset, O(delta)]
  → broadcast({ type: "new-events", filePath, events })
  → useEventStream.ws.onmessage → append to liveEvents (cap @ 2000)
  → 150ms debounce → refreshMetrics() REST fetch full session
  → replace metrics state, merge with liveEvents
```
**Fix needed:** WS reconnect (currently silently dies on network glitch).

**Path 2 — Command Execution (UPGRADE to multi-turn):**
```
User types prompt → POST /api/command
  → SSE headers + flush
  → SDK query({ resume: sessionId, includePartialMessages: true })
  → for await stream_event → data: { type: "stdout", text }\n\n
  → for await assistant → text blocks
  → for await result → data: { type: "done" }\n\n
  → res.on("close") → controller.abort() → SDK cleanup
```
**Fix needed:** Change from one-shot `claude -p` to multi-turn `resume: sessionId`.

**Path 3 — Permission Flow (REPLACE polling with Promises):**
```
Hook script POST /api/permissions/request
  → addPermissionRequest() [in-memory Map]
  → broadcast({ type: "permission-request" })
  → usePermissions.ws.onmessage → UI shows approve/deny
  → User clicks → POST /api/permissions/:id/decide
  → resolvePermissionRequest()
  → broadcast({ type: "permission-resolved" })
  → server-side setInterval(500ms) sees decision → clears   ← REPLACE THIS
```
**Fix needed:** Promise-based resolution instead of 500ms polling loop.

**Path 4 — Agent Logs (REPLACE polling with WS trigger):**
```
Current: setInterval(fetchLogs, 3000) — always running, 3s lag
Target:  useEffect(() => fetchLogs(), [liveEvents.length]) — event-driven
```

### Event-Listening Technique Decision Matrix

Per the audit's analysis, the right technique depends on data shape:

| Data Shape | Technique | Rationale |
|------------|-----------|-----------|
| Unbounded LLM token stream | **SSE** | One-directional, HTTP proxy-safe, auto-reconnect |
| Discrete file change events | **WebSocket push** | Low latency, structured JSON, bidirectional |
| Initial session hydration | **REST** | Single response, cacheable, safe fallback |
| Infrequent aggregates (usage, costs) | **REST polling (5min)** | Data changes rarely; polling is correct |
| Agent-specific log events | **WS-triggered refetch** | Replace 3s poll; refetch on new-events |
| Permission decisions | **Promise resolution** | SDK awaits Promise; WS-triggered resolve |
| Active SDK session events | **SSE** (new) | Same as LLM token stream; extends Path 2 |

---

## Core Library: Session Manager (NEW)

The missing piece. A server-side module that wraps the Claude Agent SDK and manages active sessions.

```typescript
// server/src/session/session-manager.ts

interface ActiveSession {
  sessionId: string;
  cwd: string;
  status: 'idle' | 'streaming' | 'waiting-permission' | 'error';
  abortController: AbortController;
  permissionResolvers: Map<string, (result: PermissionResult) => void>;
}

class SessionManager {
  private activeSessions: Map<string, ActiveSession> = new Map();

  // Start a brand new session
  async startSession(cwd: string): Promise<string>;

  // Send a message to an existing session (multi-turn)
  // Returns an async iterator of SDK events for SSE streaming
  async sendMessage(sessionId: string, prompt: string): AsyncIterable<SDKMessage>;

  // Resume a session from disk (user clicks "Resume" on a historical session)
  async resumeSession(sessionId: string, cwd: string): Promise<void>;

  // Fork a session (creates a copy, new session ID)
  async forkSession(sessionId: string): Promise<string>;

  // Handle permission decision from dashboard
  resolvePermission(requestId: string, decision: PermissionResult): void;

  // Handle AskUserQuestion answer from dashboard
  resolveUserQuestion(requestId: string, answers: Record<string, string>): void;

  // Abort active streaming
  abortSession(sessionId: string): void;

  // Get active session status
  getStatus(sessionId: string): ActiveSession | undefined;
}
```

**How `sendMessage` works internally:**

```typescript
async *sendMessage(sessionId: string, prompt: string): AsyncIterable<SDKMessage> {
  const session = this.activeSessions.get(sessionId);
  session.status = 'streaming';

  for await (const message of query({
    prompt,
    options: {
      resume: sessionId,
      cwd: session.cwd,
      includePartialMessages: true,
      allowedTools: [...],  // configurable per session
      canUseTool: async (toolName, input, context) => {
        if (toolName === 'AskUserQuestion') {
          return this.handleUserQuestion(sessionId, input);
        }
        return this.handlePermission(sessionId, toolName, input);
      },
    },
  })) {
    yield message;  // Caller (route handler) streams this via SSE
  }

  session.status = 'idle';
}
```

**Permission handling (Promise-based, not polling):**

```typescript
private async handlePermission(
  sessionId: string,
  toolName: string,
  input: unknown
): Promise<PermissionResult> {
  const req = { id: uuid(), sessionId, toolName, input, timestamp: Date.now() };

  // Broadcast to dashboard via WS
  this.broadcast({ type: 'permission-request', request: req });

  // Return a Promise that resolves when user clicks approve/deny
  return new Promise((resolve) => {
    this.activeSessions.get(sessionId)!.permissionResolvers.set(req.id, resolve);
  });
}

// Called when POST /api/permissions/:id/decide arrives
resolvePermission(requestId: string, decision: PermissionResult): void {
  for (const session of this.activeSessions.values()) {
    const resolver = session.permissionResolvers.get(requestId);
    if (resolver) {
      resolver(decision);
      session.permissionResolvers.delete(requestId);
      return;
    }
  }
}
```

---

## API Design (Target)

### Session Lifecycle

```
POST   /api/sessions/new
  Body: { cwd: string }
  Response: { sessionId: string }

POST   /api/sessions/:sessionId/message
  Body: { prompt: string }
  Response: SSE stream of SDK events
    data: { type: "stream_event", event: { type: "content_block_delta", ... } }
    data: { type: "assistant", message: { ... } }
    data: { type: "permission_request", request: { id, toolName, input } }
    data: { type: "user_question", question: { id, questions: [...] } }
    data: { type: "result", message: { usage, total_cost_usd } }
    data: { type: "done" }

POST   /api/sessions/:sessionId/resume
  Body: { cwd: string }
  Response: { ok: true }

POST   /api/sessions/:sessionId/fork
  Response: { newSessionId: string }

POST   /api/sessions/:sessionId/abort
  Response: { ok: true }

DELETE /api/sessions/:sessionId
  Response: { ok: true }
```

### Permission & Question Resolution

```
POST   /api/permissions/:requestId/decide
  Body: { decision: "allow" | "deny", updatedInput?: unknown }

POST   /api/questions/:requestId/answer
  Body: { answers: Record<string, string> }
```

### Existing (Keep As-Is)

```
GET    /api/sessions                          → discover all sessions
GET    /api/repos                             → group sessions by repo
GET    /api/sessions/:hash/:id                → full session detail + metrics
GET    /api/sessions/:hash/:id/events/:agent  → agent-specific logs
GET    /api/usage                             → Anthropic usage data
GET    /api/costs                             → 24h/7d cost aggregation
POST   /api/open-file                         → open in editor
```

---

## Dashboard Changes

### ConversationView Upgrades

**Current:** Renders historical events from REST fetch + appends live WS events. PromptInput sends one-shot POST `/api/command`.

**Target:**
- PromptInput sends to POST `/api/sessions/:id/message` (multi-turn)
- New "Start Session" flow when no active session
- Permission requests render inline as UI blocks (approve/deny buttons)
- AskUserQuestion renders as interactive form (radio buttons for choices)
- Streaming text renders token-by-token in the current turn
- "Session resumed" / "Session forked" system messages

**New UI blocks in conversation:**

```
┌─ Permission Request ─────────────────────────────────────┐
│  🔒 Claude wants to use: Edit                            │
│     File: src/auth/login.ts                              │
│     Changes: +12 lines, −3 lines                         │
│                                                          │
│     [Preview Changes]   [✓ Allow]   [✗ Deny]            │
└──────────────────────────────────────────────────────────┘

┌─ Question ───────────────────────────────────────────────┐
│  ❓ Claude is asking:                                     │
│     "Which authentication approach do you prefer?"        │
│                                                          │
│     ○ JWT with refresh tokens                            │
│     ○ Session-based with Redis                           │
│     ○ OAuth 2.0 passthrough                              │
│                                                          │
│     [Submit Answer]                                       │
└──────────────────────────────────────────────────────────┘
```

### Sidebar Upgrades

- "New Session" button (opens folder picker → starts session)
- "Resume" badge on historical sessions (click to resume)
- Active session indicator shows which session is receiving messages
- Running sessions from CLI also visible (via JSONL watcher, as before)

### RightPanel

- No major changes — snapshot tabs, agent graph, agent log all work the same
- New: permission events show in Agent Log
- New: active session graph updates from SDK events (not just JSONL)

---

## Implementation Roadmap (Updated 2026-03-29)

> **Phase A (infrastructure) is 100% complete.** The old Phase B/C have been superseded by a tier-based roadmap driven by the CLI parity gap analysis (`docs/plans/cli-parity-gap-analysis.md`).
>
> Current effective CLI parity: **36%** (47% including partial). Full detail in `docs/plans/v3-okr-tiers.md`.

### Completed — Infrastructure Foundation

All core infrastructure is done:

- ✅ SessionManager (multi-turn, resume, abort, GC)
- ✅ Multi-turn routes (new/message/abort/resume/delete)
- ✅ PromptInput session routing
- ✅ Promise-based permissions (10min timeout)
- ✅ Unified WebSocket (reconnect, heartbeat)
- ✅ PermissionBlock + QuestionBlock (inline, tool-specific previews, agent ID badge)
- ✅ JSONL byte-range incremental parsing
- ✅ SystemEvent type (turn_duration for state machine)
- ✅ Turn status state machine (system/turn_duration signal, no heuristics)
- ✅ Markdown rendering (react-markdown + remark-gfm)
- ✅ Per-model pricing (opus/sonnet/haiku on both server and dashboard)
- ✅ Structured logging (pino, file + stdout)
- ✅ DAG deduplication + error detection
- ✅ Graph stability (filterDagForTurn fallback)
- ✅ Setup gate (first-launch wizard)
- ✅ 7/7 architecture invariants passing
- ✅ 424 tests, 0 P1 bugs

### Tier 1: "Can Replace CLI" (~24h)

**Goal:** A developer can use the web client for a full coding session without opening a terminal.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| T1-01 | Tool result display (data parsed, not rendered) | P1 | 3h |
| T1-02 | Code syntax highlighting (rehype-highlight/shiki) | P1 | 2h |
| T1-03 | `/clear` clears context (new session or SDK clear) | P1 | 2h |
| T1-04 | `/compact` with focus instructions | P1 | 3h |
| T1-05 | `/model` switching mid-session | P1 | 3h |
| T1-06 | Permission mode cycling (Shift+Tab + UI) | P1 | 3h |
| T1-07 | Wire "Allow for session" end-to-end | P1 | 2h |
| T1-08 | Auto-compact on context > 90% | P1 | 2h |
| T1-09 | `@` file path mentions with autocomplete | P1 | 4h |

**Success metric:** User completes "build feature → test → commit" without terminal.

### Tier 2: "Better Than CLI" (~47h)

**Goal:** Observability and control features the CLI fundamentally cannot provide.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| T2-01 | Diff viewer (per-turn file changes) | P2 | 4h |
| T2-02 | `/cost` detailed breakdown modal | P2 | 2h |
| T2-03 | `/context` visualization grid | P2 | 4h |
| T2-04 | `/permissions` rules viewer/editor | P2 | 3h |
| T2-05 | `/diff` git changes command | P2 | 3h |
| T2-06 | `/copy` clipboard command | P2 | 1h |
| T2-07 | Command history (Up/Down arrows) | P2 | 2h |
| T2-08 | `/plan` mode entry | P2 | 2h |
| T2-09 | `/fast` toggle | P2 | 1h |
| T2-10 | `/effort` level control | P2 | 1h |
| T2-11 | Ctrl+C cancel binding | P2 | 1h |
| T2-12 | `/rewind` (checkpoint) | P2 | 4h |
| T2-13 | `/mcp` server status panel | P2 | 3h |
| T2-14 | `/usage` detailed rate limits | P2 | 2h |
| T2-15 | Image paste/upload | P2 | 3h |
| T2-16 | Task list panel (Ctrl+T) | P2 | 3h |
| T2-17 | `!` bash mode | P2 | 2h |
| T2-18 | Session analytics dashboard | P2 | 6h |

**Success metric:** 10+ features that provide information/control the CLI cannot.

### Tier 3: "Power User Features" (~51h)

**Goal:** Feature coverage >= 90% of applicable CLI features.

| # | Task | Priority | Effort |
|---|------|----------|--------|
| T3-01 | Settings UI | P3 | 4h |
| T3-02 | Theme support (light/dark/colorblind) | P3 | 4h |
| T3-03 | MCP server management | P3 | 4h |
| T3-04 | Hook configuration editor | P3 | 3h |
| T3-05 | Session naming/rename | P3 | 2h |
| T3-06 | Continue last session shortcut | P3 | 1h |
| T3-07 | Fork session UI | P3 | 2h |
| T3-08 | `/export` conversation | P3 | 2h |
| T3-09 | `/init` CLAUDE.md wizard | P3 | 3h |
| T3-10 | `/memory` editor | P3 | 3h |
| T3-11 | Keyboard shortcut parity | P3 | 3h |
| T3-12 | Prompt suggestions | P3 | 4h |
| T3-13 | `/doctor` diagnostics | P3 | 3h |
| T3-14 | `/stats` usage statistics | P3 | 3h |
| T3-15 | Collaborative session viewing | P3 | 6h |
| T3-16 | Active session indicator in sidebar | P3 | 2h |
| T3-17 | Add Repo button handler | P3 | 1h |
| T3-18 | Empty state CTA | P3 | 1h |

**Success metric:** Feature coverage >= 90%, no reason to switch back to terminal.

**Total: 45 tasks, ~122h across all tiers**

---

## What We Keep vs. What We Change

### Keep (No Changes Needed)

| Component | Why |
|-----------|-----|
| JSONL parser (full + incremental) | Still needed for historical sessions |
| Session discovery | Still needed for sidebar |
| File watcher (chokidar) | Still needed for CLI-started sessions |
| Metrics engine (computeMetrics) | Still needed for historical sessions |
| DAG builder | Graph visualization unchanged |
| Cost aggregator | 24h/7d costs unchanged |
| Usage client | Anthropic API unchanged |
| All dashboard visualization components | Render layer unchanged |
| Tailwind design tokens | Style system unchanged |
| Test suite (130 tests) | All still valid |

### Upgrade (Extend Existing)

| Component | Current | Target |
|-----------|---------|--------|
| POST `/api/command` | One-shot `claude -p` | Multi-turn via `resume: sessionId` |
| `permission-handler.ts` | Polling (500ms) | Promise-based resolution |
| `PromptInput.tsx` | One-shot fetch | Session-aware, streams into active session |
| `ConversationView.tsx` | Read-only events | + Permission blocks, Question blocks |
| WS hooks | 3 separate connections | 1 multiplexed connection |
| `RepoList.tsx` | Browse-only | + New Session, Resume, Fork actions |

### Build New

| Component | Purpose |
|-----------|---------|
| `SessionManager` | Server-side SDK session wrapper |
| Session lifecycle API endpoints | new/resume/fork/abort/message |
| `PermissionBlock.tsx` | Inline approve/deny UI |
| `QuestionBlock.tsx` | AskUserQuestion interactive form |
| `useUnifiedWebSocket.ts` | Single multiplexed WS hook |
| Setup Gate wizard | First-launch validation |

---

## Architecture Invariants (Updated for v3)

The original 5 invariants still hold. Two new ones for the full-client model:

1. **Filesystem JSONL is the single source of truth** — unchanged
2. **Incremental parsing with byte offsets** — unchanged
3. **Fail-safe parsing (skip malformed lines)** — unchanged
4. **Metrics computed server-side, not client-side** — unchanged
5. **WebSocket broadcasts only new events** — unchanged
6. **NEW: Active sessions stream SDK events directly** — For sessions started from the web UI, events flow from the SDK `query()` iterator directly to the client via SSE. We do NOT wait for JSONL file writes and re-read them. JSONL is the persistence layer; SSE is the real-time transport.
7. **NEW: Permission resolution is Promise-based** — The `canUseTool` callback returns a Promise that resolves when the dashboard user clicks approve/deny. No polling. No timers. The SDK awaits the Promise; the server resolves it when the HTTP POST arrives. Promises time out after 10 minutes to prevent indefinite hangs.

---

## Security (Added 2026-03-25)

### Localhost-Only Binding

The server binds exclusively to `127.0.0.1` — it is not accessible from other machines on the network. Both the primary port and the fallback (random port on EADDRINUSE) enforce localhost binding.

### No Authentication Model

This is a **local development tool**. There is no authentication or authorization layer. Any process on localhost can access all endpoints, including code-execution endpoints (`POST /api/sessions/:id/message`). This is acceptable for the intended use case (single developer, local machine) but means:

- Do not expose the server to the internet (reverse proxy, tunnel, etc.)
- Do not run on shared multi-user machines without additional access controls
- The server should not be deployed as a hosted service without adding authentication

### Risk Profile

| Endpoint | Risk | Mitigation |
|----------|------|------------|
| `POST /api/sessions/:id/message` | Code execution via Claude | Localhost-only binding |
| `POST /api/open-file` | File access | Path validation + shell metachar rejection |
| `POST /api/permissions/:id/decide` | Permission bypass | Localhost-only binding |
| `POST /api/sessions/new` | Resource consumption | Session GC (1h idle TTL) |

---

## Success Metrics (Updated 2026-03-29)

### Infrastructure (Done)

| Metric | Target | Status |
|--------|--------|--------|
| Architecture invariants passing | 7/7 | ✅ 7/7 |
| Test suite | No regressions | ✅ 424 tests, 0 failures |
| P1 bugs | 0 open | ✅ 0 open |
| Structured logging | All critical ops logged | ✅ pino with 5 subsystems |

### Tier 1 — CLI Replacement

| Metric | Target | Status |
|--------|--------|--------|
| P1 features implemented | 9/9 | ❌ 0/9 |
| End-to-end workflow test | "Build → test → commit" without terminal | ❌ Not yet |
| CLI parity | >= 60% | ❌ 36% |

### Tier 2 — Observability Advantage

| Metric | Target | Status |
|--------|--------|--------|
| Unique observability features | 10+ | ✅ 16 (DAG, snapshots, costs, etc.) |
| P2 slash commands working | 8+ | ❌ 0/18 |
| CLI parity | >= 80% | ❌ 36% |

### Tier 3 — Full Parity

| Metric | Target | Status |
|--------|--------|--------|
| Feature coverage | >= 90% of applicable CLI features | ❌ 36% |
| Configuration areas manageable from web | 4/4 (settings, themes, MCP, hooks) | ❌ 0/4 |
| Keyboard shortcut parity | >= 80% | ❌ ~10% |

---

## Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | Does `resume: sessionId` maintain full conversation history including tool calls? | If not, resume might lose context | Needs SDK testing |
| 2 | Can we run multiple active SDK sessions concurrently? (Memory/CPU) | Affects multi-session support | Needs benchmarking |
| 3 | How does the SDK handle `/compact` — does the session JSONL reflect compaction? | Affects turn grouping for long sessions | Needs investigation |
| 4 | What happens when SDK session and CLI session write to same JSONL simultaneously? | Could corrupt file | Needs investigation — may need locking |
| 5 | Should we support `allowedTools` configuration per session from the UI? | UX decision | Open |
| 6 | How to handle the SDK's lack of skills/hooks/plugins? | Feature gap vs CLI | Defer to v4 — focus on core conversation first |

---

_This spec represents a fundamental shift from observability tool to full client. The good news: ~70% of the existing codebase carries forward unchanged. The bad news: the 30% that needs changing is the most critical path (session management, permissions, data flow)._
