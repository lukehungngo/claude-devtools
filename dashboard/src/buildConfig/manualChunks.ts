/**
 * Manual chunk assignment function for Vite/Rollup build.
 * Splits vendor dependencies into predictable, cacheable chunks.
 */
export function getManualChunk(id: string): string | undefined {
  if (id.includes("node_modules")) {
    // React core: react, react-dom, react/jsx-runtime
    if (
      id.includes("/react/") ||
      id.includes("/react-dom/") ||
      id.includes("/react-is/")
    ) {
      return "vendor-react";
    }

    // TanStack: router, virtual, router-core
    if (id.includes("/@tanstack/")) {
      return "vendor-tanstack";
    }
  }

  return undefined;
}
