export type PrimaryTab = "graph" | "log" | "settings" | "hooks" | "memory" | "doctor" | "stats" | "mcp" | "permissions" | "tasks";

interface PrimaryTabsProps {
  activeTab: PrimaryTab;
  onTabChange: (tab: PrimaryTab) => void;
  agentCount?: number;
  logEntryCount?: number;
}

export function PrimaryTabs({
  activeTab,
  onTabChange,
  agentCount = 0,
  logEntryCount = 0,
}: PrimaryTabsProps) {
  const tabs: { id: PrimaryTab; icon: string; label: string; badge: number }[] = [
    { id: "graph", icon: "\u26A1", label: "Agent Graph", badge: agentCount },
    { id: "log", icon: "\u2630", label: "Agent Log", badge: logEntryCount },
    { id: "settings", icon: "\u2699", label: "Settings", badge: 0 },
    { id: "hooks", icon: "\u2693", label: "Hooks", badge: 0 },
    { id: "memory", icon: "\u2261", label: "Memory", badge: 0 },
    { id: "doctor", icon: "\u2695", label: "Doctor", badge: 0 },
    { id: "stats", icon: "\u2637", label: "Stats", badge: 0 },
    { id: "mcp", icon: "\u2B55", label: "MCP", badge: 0 },
    { id: "permissions", icon: "\uD83D\uDD12", label: "Perms", badge: 0 },
    { id: "tasks", icon: "\u2611", label: "Tasks", badge: 0 },
  ];

  return (
    <div className="primary-tabs flex border-b border-dt-border bg-dt-bg2/80 shrink-0">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-semibold font-sans border-none cursor-pointer transition-all duration-150 ease-dt-expo uppercase tracking-[0.5px] border-b-2 ${
              isActive
                ? "text-dt-text0 bg-transparent border-dt-accent"
                : "text-dt-text2 bg-transparent border-transparent hover:text-dt-text1"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge > 0 && (
              <span
                className={`text-xs px-1.5 py-px rounded-full font-semibold ${
                  isActive
                    ? "bg-dt-accent-dim text-dt-accent"
                    : "bg-dt-bg4 text-dt-text2"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
