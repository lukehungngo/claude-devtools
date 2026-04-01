import type { SessionEvent } from "../types.js";
export interface TurnRecord {
    sessionId: string;
    turnNumber: number;
    promptText: string;
    startTime: string;
    endTime: string;
    status: "running" | "completed";
}
export interface AgentLifecycleRecord {
    sessionId: string;
    turnNumber: number;
    agentId: string;
    agentType: string;
    parentAgentId: string | null;
    spawnedAt: string;
    completedAt: string | null;
    status: "running" | "completed" | "error";
    description: string | null;
}
export interface LifecycleEventRecord {
    sessionId: string;
    turnNumber: number;
    agentId: string;
    eventType: string;
    eventJson: string;
    timestamp: string;
    toolName: string | null;
    toolResultError: boolean;
    eventUuid: string;
}
export interface LifecycleRecords {
    turns: TurnRecord[];
    agentLifecycles: AgentLifecycleRecord[];
    lifecycleEvents: LifecycleEventRecord[];
}
export interface LifecycleBuilderState {
    currentTurnNumber: number;
    pendingTurnStartTime: string | null;
    pendingTurnPrompt: string;
    knownAgents: Map<string, {
        status: string;
        lastTimestamp: string;
    }>;
    lastEventTimestamp: string | null;
    /** Derived turn status from the last event processed, used for incremental flush */
    lastDerivedTurnStatus: "running" | "completed";
}
export declare function createInitialState(): LifecycleBuilderState;
export declare function buildLifecycleRecords(sessionId: string, events: SessionEvent[], subagentMeta: Map<string, {
    agentType: string;
    description: string;
}>): LifecycleRecords;
export declare function processNewEvents(sessionId: string, newEvents: SessionEvent[], subagentMeta: Map<string, {
    agentType: string;
    description: string;
}>, state: LifecycleBuilderState | null): {
    records: LifecycleRecords;
    state: LifecycleBuilderState;
};
