export interface SessionRow {
    sessionId: string;
    projectHash: string | null;
    cwd: string | null;
    model: string | null;
    startTime: string | null;
    lastUpdated: string | null;
}
export interface TurnRow {
    id: number;
    sessionId: string;
    turnNumber: number;
    promptText: string | null;
    startTime: string | null;
    endTime: string | null;
    status: string | null;
}
export interface AgentLifecycleRow {
    id: number;
    sessionId: string;
    turnNumber: number | null;
    agentId: string;
    agentType: string | null;
    parentAgentId: string | null;
    spawnedAt: string | null;
    completedAt: string | null;
    status: string | null;
    description: string | null;
}
export interface LifecycleEventRow {
    id: number;
    sessionId: string;
    turnNumber: number | null;
    agentId: string | null;
    eventType: string;
    eventJson: string | null;
    timestamp: string | null;
    toolName: string | null;
    toolResultError: number;
    eventUuid: string;
}
export declare class DebugDB {
    private db;
    private stmts;
    /**
     * Factory method. Returns null if NODE_ENV !== 'development'.
     */
    static open(dbPath: string): DebugDB | null;
    private constructor();
    upsertSession(info: {
        sessionId: string;
        projectHash?: string;
        cwd?: string;
        model?: string;
        startTime?: string;
        lastUpdated?: string;
    }): void;
    upsertTurn(turn: {
        sessionId: string;
        turnNumber: number;
        promptText?: string;
        startTime?: string;
        endTime?: string;
        status?: string;
    }): void;
    upsertAgentLifecycle(lifecycle: {
        sessionId: string;
        turnNumber?: number;
        agentId: string;
        agentType?: string;
        parentAgentId?: string;
        spawnedAt?: string;
        completedAt?: string;
        status?: string;
        description?: string;
    }): void;
    insertEvent(event: {
        sessionId: string;
        turnNumber?: number;
        agentId?: string;
        eventType: string;
        eventJson?: string;
        timestamp?: string;
        toolName?: string;
        toolResultError?: boolean;
        eventUuid: string;
    }): boolean;
    insertEventBatch(events: Array<Parameters<DebugDB["insertEvent"]>[0]>): number;
    getSession(sessionId: string): SessionRow | undefined;
    getSessions(): SessionRow[];
    getTurns(sessionId: string): TurnRow[];
    getAgentLifecycles(sessionId: string, turnNumber?: number): AgentLifecycleRow[];
    getLifecycleEvents(sessionId: string, turnNumber?: number, agentId?: string): LifecycleEventRow[];
    getGraphAtEvent(sessionId: string, turnNumber: number, upToEventIndex: number): {
        agents: AgentLifecycleRow[];
        events: LifecycleEventRow[];
    };
    deleteSession(sessionId: string): void;
    close(): void;
}
