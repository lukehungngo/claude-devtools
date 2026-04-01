import type { DebugDB } from "./debug-db.js";
/**
 * Backfill the debug DB with all existing sessions.
 * Runs synchronously on startup — only populates sessions not already in the DB.
 * Skips individual session failures so one bad JSONL doesn't block the rest.
 */
export declare function backfillDebugDb(db: DebugDB): void;
