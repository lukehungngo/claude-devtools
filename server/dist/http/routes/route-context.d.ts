import { MetricsCache } from "../../cache/metrics-cache.js";
import type { ServerState } from "../server.js";
/** Shared metrics cache -- avoids re-parsing + re-computing metrics for unchanged files. */
export declare const metricsCache: MetricsCache;
/** Context passed to each route sub-module */
export interface RouteContext {
    state?: ServerState;
}
/** Check if a path exists (async) */
export declare function pathExists(p: string): Promise<boolean>;
/** Read settings.json safely, returning empty object on missing/invalid */
export declare function readSettingsJson(): Promise<Record<string, unknown>>;
/** Write settings.json, creating ~/.claude/ if needed */
export declare function writeSettingsJson(data: Record<string, unknown>): Promise<void>;
