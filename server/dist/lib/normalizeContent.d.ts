import type { ContentItem } from "../types.js";
/**
 * Normalizes event.message.content which can be:
 * - an array of ContentItem objects
 * - a plain string
 * - undefined/null
 *
 * Always returns a ContentItem[] for safe iteration.
 */
export declare function normalizeContent(content: ContentItem[] | string | undefined | null): ContentItem[];
