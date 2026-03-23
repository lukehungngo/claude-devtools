import { ReactNode } from "react";

interface LayoutProps {
  topBar: ReactNode;
  sidebar: ReactNode;
  center: ReactNode;
  rightPanel: ReactNode;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function Layout({
  topBar,
  sidebar,
  center,
  rightPanel,
  sidebarCollapsed = false,
  onToggleSidebar,
}: LayoutProps) {
  const sidebarWidth = sidebarCollapsed ? "48px" : "260px";

  return (
    <div
      className="app bg-dt-border"
      style={{
        display: "grid",
        gridTemplateColumns: `${sidebarWidth} 1fr 520px`,
        gridTemplateRows: "auto 1fr",
        gridTemplateAreas: `
          "topbar topbar topbar"
          "sidebar center right-panel"
        `,
        height: "100vh",
        gap: "1px",
        transition: "grid-template-columns 0.2s ease",
      }}
    >
      <header className="overflow-hidden" style={{ gridArea: "topbar" }}>{topBar}</header>

      <aside
        className="overflow-hidden bg-dt-bg1 flex flex-col"
        style={{ gridArea: "sidebar" }}
      >
        {/* Collapse toggle */}
        <div
          className={`flex p-1 shrink-0 ${sidebarCollapsed ? "justify-center" : "justify-end"}`}
        >
          <button
            onClick={onToggleSidebar}
            className={`w-6 h-6 flex items-center justify-center rounded-dt-sm text-dt-text2 cursor-pointer bg-transparent border-none text-sm transition-transform ${
              sidebarCollapsed ? "rotate-180" : ""
            }`}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            &#x25C0;
          </button>
        </div>
        {/* Sidebar content - hidden when collapsed */}
        <div
          className={`flex-1 overflow-hidden ${sidebarCollapsed ? "hidden" : "flex flex-col"}`}
        >
          {sidebar}
        </div>
      </aside>

      <main
        className="bg-dt-bg1 overflow-hidden flex flex-col min-w-0"
        style={{ gridArea: "center" }}
      >
        {center}
      </main>

      <section
        className="bg-dt-bg1 overflow-hidden flex flex-col min-w-0"
        style={{ gridArea: "right-panel" }}
      >
        {rightPanel}
      </section>
    </div>
  );
}
