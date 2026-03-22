import { ReactNode } from "react";

export function Layout({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen bg-gray-950">
      <aside className="w-72 border-r border-gray-800 overflow-y-auto">
        {sidebar}
      </aside>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
