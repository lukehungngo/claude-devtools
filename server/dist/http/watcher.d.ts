import { type ServerState } from "./server.js";
import type { SessionEvent, WsNewEventsMessage, WsNewSessionMessage } from "../types.js";
/**
 * Build a WsNewEventsMessage with sessionId extracted from the file path.
 */
export declare function buildNewEventsMessage(filePath: string, events: SessionEvent[]): WsNewEventsMessage;
/**
 * Build a WsNewSessionMessage with sessionId extracted from the file path.
 */
export declare function buildNewSessionMessage(filePath: string): WsNewSessionMessage;
/**
 * Extract session ID from a JSONL file path.
 * Main session:  .../{projectHash}/{sessionId}.jsonl
 * Subagent file: .../{sessionId}/subagents/agent-{agentId}.jsonl
 */
export declare function extractSessionIdFromPath(filePath: string): string;
export declare function startWatcher(state: ServerState): {
    close: () => Promise<void>;
};
