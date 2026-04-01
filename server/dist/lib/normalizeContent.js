/**
 * Normalizes event.message.content which can be:
 * - an array of ContentItem objects
 * - a plain string
 * - undefined/null
 *
 * Always returns a ContentItem[] for safe iteration.
 */
export function normalizeContent(content) {
    if (!content)
        return [];
    if (typeof content === "string") {
        return content.trim() ? [{ type: "text", text: content }] : [];
    }
    if (!Array.isArray(content))
        return [];
    return content;
}
//# sourceMappingURL=normalizeContent.js.map