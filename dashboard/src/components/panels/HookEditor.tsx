import { useState, useEffect } from "react";

interface HookItem {
  matcher: string;
  command: string;
  description?: string;
}

interface HooksResponse {
  hooks: Record<string, HookItem[]>;
}

export function HookEditor() {
  const [hooks, setHooks] = useState<Record<string, HookItem[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/settings/hooks")
      .then((r) => r.json())
      .then((data: HooksResponse) => {
        setHooks(data.hooks);
        // Expand all groups by default
        setExpandedGroups(new Set(Object.keys(data.hooks)));
        setLoading(false);
      })
      .catch(() => {
        setHooks({});
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-dt-text2 text-sm">
        Loading hooks...
      </div>
    );
  }

  const hookEntries = Object.entries(hooks ?? {});

  if (hookEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-dt-text2 text-sm gap-2 px-4">
        <span className="text-base font-semibold">No hooks configured</span>
        <span className="text-center">
          Hooks are configured in ~/.claude/settings.json under the &quot;hooks&quot; key.
        </span>
      </div>
    );
  }

  function toggleGroup(groupName: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col overflow-y-auto h-full py-2">
      {hookEntries.map(([eventType, items]) => {
        const isExpanded = expandedGroups.has(eventType);
        return (
          <div key={eventType} className="mb-2">
            <button
              onClick={() => toggleGroup(eventType)}
              className="flex items-center gap-1.5 w-full px-3 py-2 text-left bg-transparent border-none cursor-pointer text-dt-text0 text-sm font-bold uppercase tracking-wider"
              aria-expanded={isExpanded}
            >
              <span className="text-dt-text2 text-xs">
                {isExpanded ? "\u25BC" : "\u25B6"}
              </span>
              <span>{eventType}</span>
              <span className="text-dt-text2 text-xs font-normal ml-1">
                ({items.length})
              </span>
            </button>
            {isExpanded && (
              <div className="flex flex-col gap-1.5 px-3">
                {items.map((hook, i) => (
                  <div
                    key={`${eventType}-${i}`}
                    className="bg-dt-bg3 rounded-md p-2.5 border border-dt-border"
                  >
                    {hook.matcher && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-dt-text2 text-xs">matcher:</span>
                        <span className="text-dt-text0 font-mono text-xs">
                          {hook.matcher}
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-dt-text2 text-xs shrink-0">command:</span>
                      <code className="text-dt-accent font-mono text-xs break-all">
                        {hook.command}
                      </code>
                    </div>
                    {hook.description && (
                      <div className="text-dt-text2 text-xs mt-1 italic">
                        {hook.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
