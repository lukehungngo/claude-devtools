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
    <div
      className="primary-tabs"
      style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-2)",
        flexShrink: 0,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            className="primary-tab"
            onClick={() => onTabChange(tab.id)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "8px 12px",
              fontSize: "11px",
              fontWeight: 600,
              fontFamily: "var(--font-sans)",
              color: isActive ? "var(--text-0)" : "var(--text-2)",
              background: isActive ? "var(--bg-1)" : "transparent",
              border: "none",
              borderBottom: isActive
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.3px",
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge > 0 && (
              <span
                className="tab-badge"
                style={{
                  fontSize: "9px",
                  padding: "1px 5px",
                  borderRadius: "8px",
                  fontWeight: 600,
                  background: isActive
                    ? "var(--accent-dim)"
                    : "var(--bg-4)",
                  color: isActive
                    ? "var(--accent)"
                    : "var(--text-2)",
                }}
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
