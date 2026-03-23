export type PrimaryTab = "graph" | "log";

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
  ];

  return (
    <div className="primary-tabs flex border-b border-dt-border bg-dt-bg2 shrink-0">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-base font-semibold font-sans border-none cursor-pointer transition-all uppercase tracking-[0.5px] border-b-2 ${
              isActive
                ? "text-dt-text0 bg-dt-bg1 border-dt-accent"
                : "text-dt-text2 bg-transparent border-transparent"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge > 0 && (
              <span
                className={`text-xs px-1.25 py-px rounded-full font-semibold ${
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
