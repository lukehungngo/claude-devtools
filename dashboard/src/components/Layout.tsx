import { ReactNode } from "react";

interface LayoutProps {
  topBar: ReactNode;
  sidebar: ReactNode;
  center: ReactNode;
  topRight: ReactNode;
  bottomRight: ReactNode;
}

export function Layout({
  topBar,
  sidebar,
  center,
  topRight,
  bottomRight,
}: LayoutProps) {
  return (
    <div
      className="app"
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 1fr",
        gridTemplateRows: "auto 1fr 1fr",
        gridTemplateAreas: `
          "topbar topbar topbar"
          "sidebar terminal graph"
          "sidebar terminal agents-log"
        `,
        height: "100vh",
        gap: "1px",
        background: "var(--border)",
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
        {sidebar}
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
