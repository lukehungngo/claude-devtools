import type { SessionEvent } from "../types.js";
export declare function parseJsonlFile(filePath: string): SessionEvent[];
/**
 * Incremental reader: only parse lines after a given byte offset.
 * Uses targeted byte-range reading to avoid re-reading the entire file.
 * Returns new events + updated byte offset.
 */
export declare function parseJsonlIncremental(filePath: string, fromOffset: number): {
    events: SessionEvent[];
    newOffset: number;
};
