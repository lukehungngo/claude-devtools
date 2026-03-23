import { ReactNode } from "react";

interface LayoutProps {
  topBar: ReactNode;
  sidebar: ReactNode;
  center: ReactNode;
  topRight: ReactNode;
  bottomRight: ReactNode;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function Layout({
  topBar,
  sidebar,
  center,
  topRight,
  bottomRight,
  sidebarCollapsed = false,
  onToggleSidebar,
}: LayoutProps) {
  const sidebarWidth = sidebarCollapsed ? "48px" : "280px";

  return (
    <div
      className="app"
      style={{
        display: "grid",
        gridTemplateColumns: `${sidebarWidth} 1fr 1fr`,
        gridTemplateRows: "auto 1fr 1fr",
        gridTemplateAreas: `
          "topbar topbar topbar"
          "sidebar terminal graph"
          "sidebar terminal agents-log"
        `,
        height: "100vh",
        gap: "1px",
        background: "var(--border)",
        transition: "grid-template-columns 0.2s ease",
      }}
    >
      <header style={{ gridArea: "topbar" }}>{topBar}</header>

      <aside
        style={{
          gridArea: "sidebar",
          background: "var(--bg-1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Collapse toggle */}
        <div
          style={{
            display: "flex",
            justifyContent: sidebarCollapsed ? "center" : "flex-end",
            padding: "4px",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onToggleSidebar}
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-2)",
              cursor: "pointer",
              background: "transparent",
              border: "none",
              fontSize: "12px",
              transition: "transform 0.2s",
              transform: sidebarCollapsed ? "rotate(180deg)" : "none",
            }}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            &#x25C0;
          </button>
        </div>
        {/* Sidebar content - hidden when collapsed */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: sidebarCollapsed ? "none" : "flex",
            flexDirection: "column",
          }}
        >
          {sidebar}
        </div>
      </aside>

      <main
        style={{
          gridArea: "terminal",
          background: "var(--bg-1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {center}
      </main>

      <section
        style={{
          gridArea: "graph",
          background: "var(--bg-1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {topRight}
      </section>

      <section
        style={{
          gridArea: "agents-log",
          background: "var(--bg-1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {bottomRight}
      </section>
    </div>
  );
}
