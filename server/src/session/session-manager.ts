import { randomUUID } from "node:crypto";
import type { PermissionResult, PermissionUpdate, Query, RewindFilesResult } from "@anthropic-ai/claude-agent-sdk";
import { sessionLog } from "../logger.js";

/** Subset of the canUseTool options parameter we forward to the dashboard */
export interface CanUseToolOptions {
  title?: string;
  displayName?: string;
  description?: string;
  suggestions?: PermissionUpdate[];
  toolUseID: string;
  agentID?: string;
}

/** Permission modes matching the SDK PermissionMode type.
 *  'bypassPermissions' requires allowDangerouslySkipPermissions to be set. */
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";

const VALID_PERMISSION_MODES: ReadonlySet<string> = new Set([
  "default", "acceptEdits", "bypassPermissions", "plan", "dontAsk",
]);

// Active session tracking
export type EffortLevel = "low" | "medium" | "high";

export interface ActiveSession {
  sessionId: string;
  cwd: string;
  status: "idle" | "streaming" | "waiting-permission" | "error";
  permissionMode: PermissionMode;
  model?: string;
  fastMode: boolean;
  effortLevel?: EffortLevel;
  abortController: AbortController;
  permissionResolvers: Map<string, (result: PermissionResult) => void>;
  questionResolvers: Map<string, (answer: string) => void>;
  createdAt: string;
  /** Active SDK Query object for mid-session control (setModel, setPermissionMode, rewindFiles) */
  activeQuery?: Query;
}

// Broadcast function type (injected to avoid circular deps)
type BroadcastFn = (data: unknown) => void;

// Idle sessions are cleaned up after 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000;
const GC_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

// Permission/question Promises time out after 10 minutes
const RESOLVER_TIMEOUT_MS = 10 * 60 * 1000;

export class SessionManager {
  private activeSessions = new Map<string, ActiveSession>();
  private broadcast: BroadcastFn;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
    this.gcTimer = setInterval(() => this.cleanupIdleSessions(), GC_INTERVAL_MS);
  }

  /** Remove sessions that have been idle longer than SESSION_TTL_MS */
  private cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.activeSessions) {
      if (session.status === "idle") {
        const age = now - new Date(session.createdAt).getTime();
        if (age > SESSION_TTL_MS) {
          sessionLog.info({ sessionId: id, ageMs: age }, "gc: removing idle session");
          session.abortController.abort();
          this.activeSessions.delete(id);
        }
      }
    }
  }

  /** Stop the GC timer (for clean shutdown in tests) */
  dispose(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
  }

  /** Start a brand new session, returns sessionId */
  async startSession(cwd: string): Promise<string> {
    const sessionId = randomUUID();
    const session: ActiveSession = {
      sessionId,
      cwd,
      status: "idle",
      permissionMode: "default",
      fastMode: false,
      abortController: new AbortController(),
      permissionResolvers: new Map(),
      questionResolvers: new Map(),
      createdAt: new Date().toISOString(),
    };
    this.activeSessions.set(sessionId, session);
    sessionLog.info({ sessionId, cwd }, "session created");
    return sessionId;
  }

  /** Send a message to an existing session (multi-turn). Returns async iterable of SDK messages. */
  async *sendMessage(
    sessionId: string,
    prompt: string,
    images?: Array<{ mediaType?: string; data: string }>
  ): AsyncGenerator<unknown> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status === "streaming") throw new Error(`Session ${sessionId} is already streaming`);

    sessionLog.info({ sessionId, promptLength: prompt.length }, "sendMessage: streaming started");
    session.status = "streaming";
    session.abortController = new AbortController();

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      // Build prompt: if images are provided, construct content blocks array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let queryPrompt: any = prompt;
      if (images && images.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contentBlocks: any[] = [];
        if (prompt) {
          contentBlocks.push({ type: "text", text: prompt });
        }
        for (const img of images) {
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType || "image/png",
              data: img.data,
            },
          });
        }
        queryPrompt = contentBlocks;
      }

      const responseStream = query({
        prompt: queryPrompt,
        options: {
          abortController: session.abortController,
          cwd: session.cwd,
          resume: sessionId,
          forkSession: false,
          includePartialMessages: true,
          enableFileCheckpointing: true,
          permissionMode: session.permissionMode,
          ...(session.permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
          ...(session.model ? { model: session.model } : {}),
          ...(session.effortLevel ? { effort: session.effortLevel } : {}),
          ...(session.fastMode ? { settings: { fastMode: true } } : {}),
          canUseTool: async (toolName, input, options) => {
            return this.handlePermission(session, toolName, input, {
              title: options.title,
              displayName: options.displayName,
              description: options.description,
              suggestions: options.suggestions,
              toolUseID: options.toolUseID,
              agentID: options.agentID,
            });
          },
        },
      });

      // Store the Query object for mid-session SDK control methods
      session.activeQuery = responseStream;

      for await (const message of responseStream) {
        yield message;
      }

      sessionLog.info({ sessionId }, "sendMessage: streaming completed");
      session.activeQuery = undefined;
      session.status = "idle";
    } catch (err) {
      session.activeQuery = undefined;
      if (err instanceof Error && err.message === "Aborted") {
        sessionLog.warn({ sessionId }, "sendMessage: aborted by user");
        session.status = "idle";
      } else {
        sessionLog.error({ sessionId, error: String(err) }, "sendMessage: error");
        session.status = "error";
      }
      throw err;
    }
  }

  /** Handle permission request -- returns Promise that resolves when user decides.
   *  Note: The SDK handles mode-specific auto-resolution natively via the permissionMode
   *  query option. This callback is still needed for the WebSocket-based UI flow where
   *  the dashboard user manually approves/denies tool use. */
  private handlePermission(
    session: ActiveSession,
    toolName: string,
    input: Record<string, unknown>,
    options?: CanUseToolOptions
  ): Promise<PermissionResult> {
    const requestId = randomUUID();

    sessionLog.info({ sessionId: session.sessionId, requestId, toolName }, "permission requested");
    session.status = "waiting-permission";

    // Broadcast permission request to dashboard with rich SDK fields
    this.broadcast({
      type: "permission-request",
      permission: {
        id: requestId,
        sessionId: session.sessionId,
        agentId: options?.agentID ?? "main",
        toolName,
        input,
        timestamp: new Date().toISOString(),
        status: "pending",
        ...(options?.title ? { title: options.title } : {}),
        ...(options?.displayName ? { displayName: options.displayName } : {}),
        ...(options?.description ? { description: options.description } : {}),
        ...(options?.suggestions?.length ? { suggestions: options.suggestions } : {}),
        ...(options?.toolUseID ? { toolUseId: options.toolUseID } : {}),
      },
    });

    return new Promise<PermissionResult>((resolve) => {
      const timeout = setTimeout(() => {
        session.permissionResolvers.delete(requestId);
        if (session.status === "waiting-permission") {
          session.status = "streaming";
        }
        sessionLog.warn({ sessionId: session.sessionId, requestId, toolName }, "permission timed out");
        resolve({ behavior: "deny", message: "Permission request timed out" });
      }, RESOLVER_TIMEOUT_MS);

      session.permissionResolvers.set(requestId, (result) => {
        clearTimeout(timeout);
        session.permissionResolvers.delete(requestId);
        if (session.status === "waiting-permission") {
          session.status = "streaming";
        }
        resolve(result);
      });
    });
  }

  /** Set the permission mode for a session.
   *  If session is actively streaming, calls the SDK method for immediate effect. */
  setPermissionMode(sessionId: string, mode: PermissionMode): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.permissionMode = mode;

    // If streaming, call SDK method for immediate mid-session effect
    if (session.activeQuery?.setPermissionMode) {
      session.activeQuery.setPermissionMode(mode).catch((err) => {
        sessionLog.warn({ sessionId, error: String(err) }, "SDK setPermissionMode failed");
      });
    }

    sessionLog.info({ sessionId, permissionMode: mode }, "permission mode changed");
    return true;
  }

  /** Check if a permission mode is valid */
  static isValidPermissionMode(mode: string): mode is PermissionMode {
    return VALID_PERMISSION_MODES.has(mode);
  }

  /** Resolve a pending permission request (called when dashboard user clicks approve/deny) */
  resolvePermission(requestId: string, decision: "approved" | "denied"): boolean {
    for (const session of this.activeSessions.values()) {
      const resolver = session.permissionResolvers.get(requestId);
      if (resolver) {
        sessionLog.info({ sessionId: session.sessionId, requestId, decision }, "permission resolved");
        const result: PermissionResult = decision === "approved"
          ? { behavior: "allow" }
          : { behavior: "deny", message: "User denied permission" };
        resolver(result);
        return true;
      }
    }
    return false;
  }

  /** Resolve a pending question (called when dashboard user submits an answer) */
  resolveQuestion(questionId: string, answer: string): boolean {
    for (const session of this.activeSessions.values()) {
      const resolver = session.questionResolvers.get(questionId);
      if (resolver) {
        resolver(answer);
        session.questionResolvers.delete(questionId);
        return true;
      }
    }
    return false;
  }

  /** Resume a historical session (registers it with a known sessionId) */
  async resumeSession(sessionId: string, cwd: string): Promise<void> {
    if (this.activeSessions.has(sessionId)) {
      sessionLog.debug({ sessionId }, "resumeSession: already tracked");
      return;
    }
    const session: ActiveSession = {
      sessionId,
      cwd,
      status: "idle",
      permissionMode: "default",
      fastMode: false,
      abortController: new AbortController(),
      permissionResolvers: new Map(),
      questionResolvers: new Map(),
      createdAt: new Date().toISOString(),
    };
    this.activeSessions.set(sessionId, session);
    sessionLog.info({ sessionId, cwd }, "session resumed");
  }

  /** Abort an active streaming session */
  abortSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    sessionLog.warn({ sessionId }, "session aborted");
    session.abortController.abort();
    session.activeQuery = undefined;
    session.status = "idle";
    return true;
  }

  /** Get status of a specific session */
  getStatus(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** Set the model for a session (used by /model command).
   *  If session is actively streaming, calls the SDK method for immediate effect. */
  setModel(sessionId: string, model: string | undefined): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.model = model;

    // If streaming, call SDK method for immediate mid-session effect
    if (session.activeQuery?.setModel) {
      session.activeQuery.setModel(model).catch((err) => {
        sessionLog.warn({ sessionId, error: String(err) }, "SDK setModel failed");
      });
    }

    sessionLog.info({ sessionId, model: model ?? "default" }, "model changed");
    return true;
  }

  /** Set fast mode for a session */
  setFastMode(sessionId: string, enabled: boolean): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.fastMode = enabled;
    sessionLog.info({ sessionId, fastMode: enabled }, "fast mode changed");
    return true;
  }

  /** Set effort level for a session */
  setEffortLevel(sessionId: string, level: EffortLevel): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.effortLevel = level;
    sessionLog.info({ sessionId, effortLevel: level }, "effort level changed");
    return true;
  }

  /** Rewind files to their state at a specific user message.
   *  Requires an active streaming session with file checkpointing enabled. */
  async rewindFiles(
    sessionId: string,
    userMessageId: string,
    dryRun: boolean
  ): Promise<RewindFilesResult> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { canRewind: false, error: "Session not found" };
    }
    if (!session.activeQuery?.rewindFiles) {
      return { canRewind: false, error: "No active query — session must be streaming to rewind files" };
    }

    sessionLog.info({ sessionId, userMessageId, dryRun }, "rewindFiles requested");

    try {
      const result = await session.activeQuery.rewindFiles(userMessageId, { dryRun });
      sessionLog.info({ sessionId, userMessageId, dryRun, canRewind: result.canRewind }, "rewindFiles completed");
      return result;
    } catch (err) {
      sessionLog.error({ sessionId, userMessageId, error: String(err) }, "rewindFiles failed");
      return { canRewind: false, error: String(err) };
    }
  }

  /** List all active sessions */
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }

  /** List all pending questions across active sessions */
  getPendingQuestions(): Array<{ questionId: string; sessionId: string }> {
    const pending: Array<{ questionId: string; sessionId: string }> = [];
    for (const session of this.activeSessions.values()) {
      for (const questionId of session.questionResolvers.keys()) {
        pending.push({ questionId, sessionId: session.sessionId });
      }
    }
    return pending;
  }

  /** Remove a session from tracking */
  removeSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    sessionLog.info({ sessionId }, "session removed");
    session.abortController.abort();
    session.activeQuery = undefined;
    return this.activeSessions.delete(sessionId);
  }
}
