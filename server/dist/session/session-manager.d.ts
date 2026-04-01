import type { PermissionResult, PermissionUpdate, Query, RewindFilesResult } from "@anthropic-ai/claude-agent-sdk";
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
export type PermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan" | "auto" | "dontAsk";
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
    /** True for sessions created via startSession(), false for resumed JSONL sessions */
    isNew: boolean;
}
type BroadcastFn = (data: unknown) => void;
export declare class SessionManager {
    private activeSessions;
    private broadcast;
    private gcTimer;
    constructor(broadcast: BroadcastFn);
    /** Remove sessions that have been idle longer than SESSION_TTL_MS */
    private cleanupIdleSessions;
    /** Stop the GC timer (for clean shutdown in tests) */
    dispose(): void;
    /** Start a brand new session, returns sessionId */
    startSession(cwd: string): Promise<string>;
    /** Send a message to an existing session (multi-turn). Returns async iterable of SDK messages. */
    sendMessage(sessionId: string, prompt: string, images?: Array<{
        mediaType?: string;
        data: string;
    }>): AsyncGenerator<unknown>;
    /** Handle permission request -- returns Promise that resolves when user decides.
     *  Note: The SDK handles mode-specific auto-resolution natively via the permissionMode
     *  query option. This callback is still needed for the WebSocket-based UI flow where
     *  the dashboard user manually approves/denies tool use. */
    private handlePermission;
    /** Set the permission mode for a session.
     *  If session is actively streaming, calls the SDK method for immediate effect. */
    setPermissionMode(sessionId: string, mode: PermissionMode): boolean;
    /** Check if a permission mode is valid */
    static isValidPermissionMode(mode: string): mode is PermissionMode;
    /** Resolve a pending permission request (called when dashboard user clicks approve/deny) */
    resolvePermission(requestId: string, decision: "approved" | "denied"): boolean;
    /** Resolve a pending question (called when dashboard user submits an answer) */
    resolveQuestion(questionId: string, answer: string): boolean;
    /** Resume a historical session (registers it with a known sessionId) */
    resumeSession(sessionId: string, cwd: string): Promise<void>;
    /** Abort an active streaming session */
    abortSession(sessionId: string): boolean;
    /** Get status of a specific session */
    getStatus(sessionId: string): ActiveSession | undefined;
    /** Set the model for a session (used by /model command).
     *  If session is actively streaming, calls the SDK method for immediate effect. */
    setModel(sessionId: string, model: string | undefined): boolean;
    /** Set fast mode for a session */
    setFastMode(sessionId: string, enabled: boolean): boolean;
    /** Set effort level for a session */
    setEffortLevel(sessionId: string, level: EffortLevel): boolean;
    /** Rewind files to their state at a specific user message.
     *  Requires an active streaming session with file checkpointing enabled. */
    rewindFiles(sessionId: string, userMessageId: string, dryRun: boolean): Promise<RewindFilesResult>;
    /** List all active sessions */
    getActiveSessions(): ActiveSession[];
    /** List all pending questions across active sessions */
    getPendingQuestions(): Array<{
        questionId: string;
        sessionId: string;
    }>;
    /** Remove a session from tracking */
    removeSession(sessionId: string): boolean;
}
export {};
