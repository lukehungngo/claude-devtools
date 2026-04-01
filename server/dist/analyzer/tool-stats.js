import { normalizeContent } from "../lib/normalizeContent.js";
export function buildToolStats(events) {
    const stats = new Map();
    const toolUseIds = new Map(); // tool_use_id → tool_name
    // Collect tool_use calls
    for (const event of events) {
        if (event.type !== "assistant")
            continue;
        for (const content of normalizeContent(event.message.content)) {
            if (content.type === "tool_use") {
                toolUseIds.set(content.id, content.name);
                const existing = stats.get(content.name) || { count: 0, errors: 0 };
                existing.count++;
                stats.set(content.name, existing);
            }
        }
    }
    // Match tool_results for error tracking
    for (const event of events) {
        if (event.type !== "user")
            continue;
        for (const content of normalizeContent(event.message.content)) {
            if (content.type === "tool_result" && content.is_error) {
                const toolName = toolUseIds.get(content.tool_use_id);
                if (toolName) {
                    const existing = stats.get(toolName);
                    if (existing)
                        existing.errors++;
                }
            }
        }
    }
    // Convert to array with MCP detection
    return Array.from(stats.entries())
        .map(([name, { count, errors }]) => {
        const isMcp = name.startsWith("mcp__");
        const mcpServer = isMcp ? name.split("__")[1] : undefined;
        return { name, count, errors, isMcp, mcpServer };
    })
        .sort((a, b) => b.count - a.count);
}
//# sourceMappingURL=tool-stats.js.map