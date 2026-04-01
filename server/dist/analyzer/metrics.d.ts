import type { SessionEvent, SessionMetrics, SessionInfo } from "../types.js";
export declare function calculateTokenCost(model: string, tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
}): number;
export declare function computeMetrics(sessionInfo: SessionInfo, mainEvents: SessionEvent[], subagentEvents: Map<string, SessionEvent[]>, subagentMeta: Map<string, {
    agentType: string;
    description: string;
}>): SessionMetrics;
