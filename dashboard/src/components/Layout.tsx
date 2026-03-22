import { ReactNode } from "react";

interface LayoutProps {
  topBar: ReactNode;
  leftSidebar: ReactNode;
  center: ReactNode;
  rightSidebar: ReactNode;
  bottomPanel: ReactNode;
}

export function Layout({
  topBar,
  leftSidebar,
  center,
  rightSidebar,
  bottomPanel,
}: LayoutProps) {
  return (
    <div className="h-screen grid grid-rows-[116px_1fr_220px] grid-cols-[280px_1fr_420px] bg-white dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Top bar - spans all columns */}
      <header className="col-span-3">
        {topBar}
      </header>

      {/* Left sidebar */}
      <aside className="border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
        {leftSidebar}
      </aside>

      {/* Center - main content */}
      <main className="overflow-hidden">{center}</main>

      {/* Right sidebar */}
      <aside className="border-l border-gray-200 dark:border-gray-800 overflow-y-auto">
        {rightSidebar}
      </aside>

      {/* Bottom panel - spans all columns */}
      <footer className="col-span-3 border-t border-gray-200 dark:border-gray-800">
        {bottomPanel}
      </footer>
    </div>
  );
}
