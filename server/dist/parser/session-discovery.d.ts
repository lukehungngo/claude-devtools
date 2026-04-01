import type { SessionInfo, SessionEvent, RepoGroup } from "../types.js";
import { SessionCache } from "../cache/session-cache.js";
/** Shared session cache instance — used by discoverSessions(). */
export declare const sessionCache: SessionCache;
export declare function discoverSessions(): SessionInfo[];
export declare function discoverRepoGroups(): RepoGroup[];
export declare function loadFullSession(sessionInfo: SessionInfo): {
    mainEvents: SessionEvent[];
    subagentEvents: Map<string, SessionEvent[]>;
    subagentMeta: Map<string, {
        agentType: string;
        description: string;
    }>;
};
