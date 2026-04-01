import { randomUUID } from "node:crypto";
import { sessionLog } from "../logger.js";
const VALID_PERMISSION_MODES = new Set([
    "default", "acceptEdits", "bypassPermissions", "plan", "auto", "dontAsk",
]);
// Idle sessions are cleaned up after 1 hour
const SESSION_TTL_MS = 60 * 60 * 1000;
const GC_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
// Permission/question Promises time out after 10 minutes
const RESOLVER_TIMEOUT_MS = 10 * 60 * 1000;
export class SessionManager {
    activeSessions = new Map();
    broadcast;
    gcTimer = null;
    constructor(broadcast) {
        this.broadcast = broadcast;
        this.gcTimer = setInterval(() => this.cleanupIdleSessions(), GC_INTERVAL_MS);
    }
    /** Remove sessions that have been idle longer than SESSION_TTL_MS */
    cleanupIdleSessions() {
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
    dispose() {
        if (this.gcTimer) {
            clearInterval(this.gcTimer);
            this.gcTimer = null;
        }
    }
    /** Start a brand new session, returns sessionId */
    async startSession(cwd) {
        const sessionId = randomUUID();
        const session = {
            sessionId,
            cwd,
            status: "idle",
            permissionMode: "default",
            fastMode: false,
            abortController: new AbortController(),
            permissionResolvers: new Map(),
            questionResolvers: new Map(),
            createdAt: new Date().toISOString(),
            isNew: true,
        };
        this.activeSessions.set(sessionId, session);
        sessionLog.info({ sessionId, cwd }, "session created");
        return sessionId;
    }
    /** Send a message to an existing session (multi-turn). Returns async iterable of SDK messages. */
    async *sendMessage(sessionId, prompt, images) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            throw new Error(`Session ${sessionId} not found`);
        if (session.status === "streaming")
            throw new Error(`Session ${sessionId} is already streaming`);
        sessionLog.info({ sessionId, promptLength: prompt.length }, "sendMessage: streaming started");
        session.status = "streaming";
        session.abortController = new AbortController();
        try {
            const { query } = await import("@anthropic-ai/claude-agent-sdk");
            // Build prompt: if images are provided, construct content blocks array
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let queryPrompt = prompt;
            if (images && images.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const contentBlocks = [];
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
                    // New sessions: use sessionId to assign the UUID.
                    // Resumed sessions: use resume to load conversation history from JSONL.
                    ...(session.isNew
                        ? { sessionId }
                        : { resume: sessionId }),
                    forkSession: false,
                    includePartialMessages: true,
                    enableFileCheckpointing: true,
                    // Our PermissionMode includes 'auto' which the SDK type omits.
                    // Cast through unknown to SdkPermissionMode for SDK compatibility.
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
            // After first successful message, session has a JSONL file — subsequent messages should resume
            if (session.isNew)
                session.isNew = false;
        }
        catch (err) {
            session.activeQuery = undefined;
            if (err instanceof Error && err.message === "Aborted") {
                sessionLog.warn({ sessionId }, "sendMessage: aborted by user");
                session.status = "idle";
            }
            else {
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
    handlePermission(session, toolName, input, options) {
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
        return new Promise((resolve) => {
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
    setPermissionMode(sessionId, mode) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return false;
        session.permissionMode = mode;
        // If streaming, call SDK method for immediate mid-session effect
        if (session.activeQuery?.setPermissionMode) {
            // Our PermissionMode includes 'auto' which SDK omits -- cast through unknown
            session.activeQuery.setPermissionMode(mode).catch((err) => {
                sessionLog.warn({ sessionId, error: String(err) }, "SDK setPermissionMode failed");
            });
        }
        sessionLog.info({ sessionId, permissionMode: mode }, "permission mode changed");
        return true;
    }
    /** Check if a permission mode is valid */
    static isValidPermissionMode(mode) {
        return VALID_PERMISSION_MODES.has(mode);
    }
    /** Resolve a pending permission request (called when dashboard user clicks approve/deny) */
    resolvePermission(requestId, decision) {
        for (const session of this.activeSessions.values()) {
            const resolver = session.permissionResolvers.get(requestId);
            if (resolver) {
                sessionLog.info({ sessionId: session.sessionId, requestId, decision }, "permission resolved");
                const result = decision === "approved"
                    ? { behavior: "allow" }
                    : { behavior: "deny", message: "User denied permission" };
                resolver(result);
                return true;
            }
        }
        return false;
    }
    /** Resolve a pending question (called when dashboard user submits an answer) */
    resolveQuestion(questionId, answer) {
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
    async resumeSession(sessionId, cwd) {
        if (this.activeSessions.has(sessionId)) {
            sessionLog.debug({ sessionId }, "resumeSession: already tracked");
            return;
        }
        const session = {
            sessionId,
            cwd,
            status: "idle",
            permissionMode: "default",
            fastMode: false,
            abortController: new AbortController(),
            permissionResolvers: new Map(),
            questionResolvers: new Map(),
            createdAt: new Date().toISOString(),
            isNew: false,
        };
        this.activeSessions.set(sessionId, session);
        sessionLog.info({ sessionId, cwd }, "session resumed");
    }
    /** Abort an active streaming session */
    abortSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return false;
        sessionLog.warn({ sessionId }, "session aborted");
        session.abortController.abort();
        session.activeQuery = undefined;
        session.status = "idle";
        return true;
    }
    /** Get status of a specific session */
    getStatus(sessionId) {
        return this.activeSessions.get(sessionId);
    }
    /** Set the model for a session (used by /model command).
     *  If session is actively streaming, calls the SDK method for immediate effect. */
    setModel(sessionId, model) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return false;
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
    setFastMode(sessionId, enabled) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return false;
        session.fastMode = enabled;
        sessionLog.info({ sessionId, fastMode: enabled }, "fast mode changed");
        return true;
    }
    /** Set effort level for a session */
    setEffortLevel(sessionId, level) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return false;
        session.effortLevel = level;
        sessionLog.info({ sessionId, effortLevel: level }, "effort level changed");
        return true;
    }
    /** Rewind files to their state at a specific user message.
     *  Requires an active streaming session with file checkpointing enabled. */
    async rewindFiles(sessionId, userMessageId, dryRun) {
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
        }
        catch (err) {
            sessionLog.error({ sessionId, userMessageId, error: String(err) }, "rewindFiles failed");
            return { canRewind: false, error: String(err) };
        }
    }
    /** List all active sessions */
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    /** List all pending questions across active sessions */
    getPendingQuestions() {
        const pending = [];
        for (const session of this.activeSessions.values()) {
            for (const questionId of session.questionResolvers.keys()) {
                pending.push({ questionId, sessionId: session.sessionId });
            }
        }
        return pending;
    }
    /** Remove a session from tracking */
    removeSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return false;
        sessionLog.info({ sessionId }, "session removed");
        session.abortController.abort();
        session.activeQuery = undefined;
        return this.activeSessions.delete(sessionId);
    }
}
//# sourceMappingURL=session-manager.js.map