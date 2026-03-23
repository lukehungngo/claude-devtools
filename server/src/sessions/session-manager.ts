import type {
  Query,
  SDKMessage,
  CanUseTool,
  PermissionResult,
} from "@anthropic-ai/claude-agent-sdk";
import {
  addPermissionRequest,
  getPermissionStatus,
} from "../hooks/permission-handler.js";
import type { ServerState } from "../http/server.js";
import { broadcast } from "../http/server.js";

// Re-export for route usage
export type { SDKMessage };

export interface ManagedSession {
  /** The original session ID we forked from */
  parentSessionId: string;
  /** The forked session's own ID (set after first message) */
  forkedSessionId: string | null;
  /** The active query (AsyncGenerator of SDKMessages) */
  query: Query;
  /** When the session was last active */
  lastActivity: number;
  /** Working directory */
  cwd: string;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const PERMISSION_POLL_INTERVAL_MS = 500;
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

/**
 * Manages long-lived Claude Code SDK sessions.
 * Each "send" forks from the original session to avoid JSONL race conditions.
 */
export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private state: ServerState | null = null;

  setState(state: ServerState) {
    this.state = state;
  }

  startCleanup() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Send a prompt to a session. Creates a new forked query each time
   * to avoid JSONL conflicts with the running interactive session.
   *
   * Returns an AsyncGenerator of SDKMessages.
   */
  async sendPrompt(
    sessionId: string,
    prompt: string,
    cwd: string
  ): Promise<Query> {
    // Close any existing session for this parent
    const existing = this.sessions.get(sessionId);
    if (existing) {
      try {
        existing.query.close();
      } catch {
        // ignore close errors
      }
      this.sessions.delete(sessionId);
    }

    // Dynamic import to avoid issues if SDK not installed
    const sdk = await import("@anthropic-ai/claude-agent-sdk");

    const canUseTool: CanUseTool = async (
      toolName,
      input,
      options
    ): Promise<PermissionResult> => {
      // Forward permission request to dashboard via permission-handler + WebSocket
      const permission = addPermissionRequest({
        sessionId,
        agentId: options.agentID || "main",
        toolName,
        input,
      });

      // Broadcast to dashboard
      if (this.state) {
        broadcast(this.state, {
          type: "permission-request",
          permission: {
            ...permission,
            title: options.title,
            description: options.description,
            displayName: options.displayName,
          },
        });
      }

      // Poll for decision (dashboard user approves/denies via REST)
      const result = await this.waitForPermissionDecision(
        permission.id,
        options.signal
      );

      if (result === "approved") {
        return { behavior: "allow" as const };
      } else {
        return {
          behavior: "deny" as const,
          message: "Permission denied by dashboard user",
        };
      }
    };

    const q = sdk.query({
      prompt,
      options: {
        resume: sessionId,
        forkSession: true,
        cwd,
        canUseTool,
        includePartialMessages: true,
        env: {
          ...process.env,
          CLAUDE_AGENT_SDK_CLIENT_APP: "claude-devtools/0.1.0",
        },
      },
    });

    const managed: ManagedSession = {
      parentSessionId: sessionId,
      forkedSessionId: null,
      query: q,
      lastActivity: Date.now(),
      cwd,
    };

    this.sessions.set(sessionId, managed);
    return q;
  }

  /**
   * Poll permission-handler for a decision.
   */
  private async waitForPermissionDecision(
    permissionId: string,
    signal: AbortSignal
  ): Promise<"approved" | "denied"> {
    const start = Date.now();

    return new Promise((resolve) => {
      const poll = () => {
        if (signal.aborted) {
          resolve("denied");
          return;
        }

        const status = getPermissionStatus(permissionId);
        if (status && status.status !== "pending") {
          resolve(status.status as "approved" | "denied");
          return;
        }

        if (Date.now() - start > PERMISSION_TIMEOUT_MS) {
          resolve("denied"); // Timeout → deny
          return;
        }

        setTimeout(poll, PERMISSION_POLL_INTERVAL_MS);
      };

      poll();
    });
  }

  /**
   * Get session info (for tracking forked sessions).
   */
  getSession(parentSessionId: string): ManagedSession | undefined {
    return this.sessions.get(parentSessionId);
  }

  /**
   * Close a specific session.
   */
  closeSession(parentSessionId: string) {
    const session = this.sessions.get(parentSessionId);
    if (session) {
      try {
        session.query.close();
      } catch {
        // ignore
      }
      this.sessions.delete(parentSessionId);
    }
  }

  /**
   * Clean up idle sessions.
   */
  private cleanup() {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > IDLE_TIMEOUT_MS) {
        try {
          session.query.close();
        } catch {
          // ignore
        }
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Close all sessions.
   */
  closeAll() {
    for (const [, session] of this.sessions) {
      try {
        session.query.close();
      } catch {
        // ignore
      }
    }
    this.sessions.clear();
    this.stopCleanup();
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
