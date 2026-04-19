import type { ReactNode } from "react";

interface LayoutProps {
  titlebar: ReactNode;
  topBar: ReactNode | null;
  sidebar: ReactNode | null;
  turnHistory?: ReactNode | null;
  center: ReactNode;
  bottomPanel: ReactNode | null;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function Layout({
  titlebar,
  topBar,
  sidebar,
  turnHistory,
  center,
  bottomPanel,
  sidebarCollapsed = false,
  onToggleSidebar,
}: LayoutProps) {
  const sidebarWidth = sidebarCollapsed ? "48px" : "var(--sidebar-width, 220px)";

  return (
    <div
      className="app"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--t1)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Titlebar */}
      {titlebar}

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — only rendered when not null */}
        {sidebar !== null && (
          <aside
            className="flex flex-col shrink-0 overflow-y-auto overflow-x-hidden dt-scrollbar"
            style={{
              width: sidebarWidth,
              background: "var(--bg-s)",
              borderRight: "1px solid var(--bd)",
              transition: "width 0.2s var(--ease-out-expo)",
            }}
          >
            {/* Collapse toggle */}
            {onToggleSidebar && (
              <div
                className={`flex p-1 shrink-0 ${sidebarCollapsed ? "justify-center" : "justify-end"}`}
              >
                <button
                  onClick={onToggleSidebar}
                  className={`w-6 h-6 flex items-center justify-center rounded-full cursor-pointer bg-transparent border-none text-xs ${
                    sidebarCollapsed ? "rotate-180" : ""
                  }`}
                  style={{ color: "var(--t3)", transition: "all .15s" }}
                  title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  &#x25C0;
                </button>
              </div>
            )}
            {/* Sidebar content */}
            <div
              className={`flex-1 overflow-hidden ${sidebarCollapsed ? "hidden" : "flex flex-col"}`}
            >
              {sidebar}
            </div>
          </aside>
        )}

        {/* Turn history panel */}
        {turnHistory}

        {/* Main area */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Sticky HUD topbar — only rendered when not null */}
          {topBar !== null && topBar}

          {/* Conversation (center content) */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {center}
          </div>

          {/* Bottom panel — only rendered when not null */}
          {bottomPanel !== null && bottomPanel}
        </main>
      </div>
    </div>
  );
}
