import { randomUUID } from "node:crypto";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

// Active session tracking
export interface ActiveSession {
  sessionId: string;
  cwd: string;
  status: "idle" | "streaming" | "waiting-permission" | "error";
  abortController: AbortController;
  permissionResolvers: Map<string, (result: PermissionResult) => void>;
  questionResolvers: Map<string, (answer: string) => void>;
  createdAt: string;
}

// Broadcast function type (injected to avoid circular deps)
type BroadcastFn = (data: unknown) => void;

export class SessionManager {
  private activeSessions = new Map<string, ActiveSession>();
  private broadcast: BroadcastFn;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
  }

  /** Start a brand new session, returns sessionId */
  async startSession(cwd: string): Promise<string> {
    const sessionId = randomUUID();
    const session: ActiveSession = {
      sessionId,
      cwd,
      status: "idle",
      abortController: new AbortController(),
      permissionResolvers: new Map(),
      questionResolvers: new Map(),
      createdAt: new Date().toISOString(),
    };
    this.activeSessions.set(sessionId, session);
    return sessionId;
  }

  /** Send a message to an existing session (multi-turn). Returns async iterable of SDK messages. */
  async *sendMessage(sessionId: string, prompt: string): AsyncGenerator<unknown> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.status === "streaming") throw new Error(`Session ${sessionId} is already streaming`);

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
          canUseTool: async (toolName, input) => {
            return this.handlePermission(session, toolName, input);
          },
        },
      });

      for await (const message of responseStream) {
        yield message;
      }

      session.status = "idle";
    } catch (err) {
      if (err instanceof Error && err.message === "Aborted") {
        session.status = "idle";
      } else {
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
    const requestId = randomUUID();

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
      session.permissionResolvers.set(requestId, (result) => {
        session.permissionResolvers.delete(requestId);
        if (session.status === "waiting-permission") {
          session.status = "streaming";
        }
        resolve(result);
      });
    });
  }

  /** Resolve a pending permission request (called when dashboard user clicks approve/deny) */
  resolvePermission(requestId: string, decision: "approved" | "denied"): boolean {
    for (const session of this.activeSessions.values()) {
      const resolver = session.permissionResolvers.get(requestId);
      if (resolver) {
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
    if (this.activeSessions.has(sessionId)) return; // Already tracked
    const session: ActiveSession = {
      sessionId,
      cwd,
      status: "idle",
      abortController: new AbortController(),
      permissionResolvers: new Map(),
      questionResolvers: new Map(),
      createdAt: new Date().toISOString(),
    };
    this.activeSessions.set(sessionId, session);
  }

  /** Abort an active streaming session */
  abortSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.abortController.abort();
    session.status = "idle";
    return true;
  }

  /** Get status of a specific session */
  getStatus(sessionId: string): ActiveSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** List all active sessions */
  getActiveSessions(): ActiveSession[] {
    return Array.from(this.activeSessions.values());
  }

  /** Remove a session from tracking */
  removeSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;
    session.abortController.abort();
    return this.activeSessions.delete(sessionId);
  }
}
