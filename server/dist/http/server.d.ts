import { WebSocket } from "ws";
import { SessionManager } from "../session/session-manager.js";
import { DebugDB } from "../debug/debug-db.js";
import type { WsBroadcastMessage } from "../types.js";
export interface ServerState {
    clients: Set<WebSocket>;
    sessionManager?: SessionManager;
    debugDb?: DebugDB;
}
export declare function startHttpServer(port?: number): Promise<{
    url: string;
    close: () => void;
}>;
export declare function broadcast(state: ServerState, data: WsBroadcastMessage): void;
