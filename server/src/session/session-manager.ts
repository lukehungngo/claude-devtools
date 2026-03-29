import { randomUUID } from "node:crypto";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { sessionLog } from "../logger.js";

export type PermissionMode = "default" | "acceptEdits" | "plan";

const VALID_PERMISSION_MODES: ReadonlySet<string> = new Set(["default", "acceptEdits", "plan"]);

// Tools auto-approved in acceptEdits mode
const ACCEPT_EDITS_ALLOW: ReadonlySet<string> = new Set(["Edit", "Write", "Read"]);

// Tools auto-allowed in plan mode (read-only)
const PLAN_ALLOW: ReadonlySet<string> = new Set(["Read", "Glob", "Grep"]);

// Tools auto-denied in plan mode (write/execute)
const PLAN_DENY: ReadonlySet<string> = new Set(["Edit", "Write", "Bash"]);

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
  async *sendMessage(sessionId: string, prompt: string): AsyncGenerator<unknown> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status === "streaming") throw new Error(`Session ${sessionId} is already streaming`);

    sessionLog.info({ sessionId, promptLength: prompt.length }, "sendMessage: streaming started");
    session.status = "streaming";
    session.abortController = new AbortController();

    try {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      const responseStream = query({
        prompt,
        options: {
          abortController: session.abortController,
          cwd: session.cwd,
          resume: sessionId,
          forkSession: false,
          includePartialMessages: true,
          ...(session.model ? { model: session.model } : {}),
          ...(session.effortLevel ? { effort: session.effortLevel } : {}),
          canUseTool: async (toolName, input) => {
            return this.handlePermission(session, toolName, input);
          },
        },
      });

      for await (const message of responseStream) {
        yield message;
      }

      sessionLog.info({ sessionId }, "sendMessage: streaming completed");
      session.status = "idle";
    } catch (err) {
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

  /** Handle permission request -- returns Promise that resolves when user decides */
  private handlePermission(
    session: ActiveSession,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> {
    // Check permission mode for auto-resolution
    const autoResult = this.shouldAutoResolve(session.sessionId, toolName);
    if (autoResult) {
      sessionLog.info(
        { sessionId: session.sessionId, toolName, mode: session.permissionMode, behavior: autoResult.behavior },
        "permission auto-resolved by mode"
      );
      return Promise.resolve(autoResult);
    }

    const requestId = randomUUID();

    sessionLog.info({ sessionId: session.sessionId, requestId, toolName }, "permission requested");
    session.status = "waiting-permission";

    // Broadcast permission request to dashboard
    this.broadcast({
      type: "permission-request",
      permission: {
        id: requestId,
        sessionId: session.sessionId,
        agentId: "main",
        toolName,
        input,
        timestamp: new Date().toISOString(),
        status: "pending",
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

  /** Set the permission mode for a session */
  setPermissionMode(sessionId: string, mode: PermissionMode): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.permissionMode = mode;
    sessionLog.info({ sessionId, permissionMode: mode }, "permission mode changed");
    return true;
  }

  /** Check if a permission mode is valid */
  static isValidPermissionMode(mode: string): mode is PermissionMode {
    return VALID_PERMISSION_MODES.has(mode);
  }

  /** Determine if a tool should be auto-resolved based on permission mode.
   *  Returns PermissionResult if auto-resolved, null if user should be prompted. */
  shouldAutoResolve(sessionId: string, toolName: string): PermissionResult | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    switch (session.permissionMode) {
      case "acceptEdits":
        if (ACCEPT_EDITS_ALLOW.has(toolName)) {
          return { behavior: "allow" };
        }
        return null; // prompt user for Bash, Agent, etc.

      case "plan":
        if (PLAN_ALLOW.has(toolName)) {
          return { behavior: "allow" };
        }
        if (PLAN_DENY.has(toolName)) {
          return { behavior: "deny", message: "Blocked by plan mode" };
        }
        return null; // prompt for anything else

      default:
        return null; // "default" mode: always prompt user
    }
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
    session.status = "idle";
    return true;
  }

  /** Get status of a specific session */
  getStatus(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** Set the model for a session (used by /model command) */
  setModel(sessionId: string, model: string | undefined): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.model = model;
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
    return this.activeSessions.delete(sessionId);
  }
}
