import type { SessionEvent, AgentDAG, AggregatedTokens } from "../types.js";
export declare function buildAgentDAG(mainEvents: SessionEvent[], subagentEvents: Map<string, SessionEvent[]>, subagentMeta: Map<string, {
    agentType: string;
    description: string;
}>): AgentDAG;
/**
 * Exported for backward compatibility (used by tests and other modules).
 * Delegates to the single-pass analyzeEvents internally.
 */
export declare function aggregateTokens(events: SessionEvent[]): AggregatedTokens;
