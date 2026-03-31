import { describe, it, expect, beforeAll } from "vitest";

/**
 * Tests for Vite manualChunks configuration.
 * We extract and test the chunk assignment function directly.
 */
describe("vite manualChunks", () => {
  // We import the chunk function from a shared module so it's testable
  // without importing the full vite config (which requires vite types at runtime)
  let getManualChunk: (id: string) => string | undefined;

  beforeAll(async () => {
    const mod = await import("../buildConfig/manualChunks");
    getManualChunk = mod.getManualChunk;
  });

  it("assigns react to vendor-react chunk", () => {
    expect(getManualChunk("/node_modules/react/index.js")).toBe("vendor-react");
    expect(getManualChunk("/node_modules/react-dom/client.js")).toBe("vendor-react");
    expect(getManualChunk("/node_modules/react/jsx-runtime.js")).toBe("vendor-react");
  });

  it("assigns tanstack packages to vendor-tanstack chunk", () => {
    expect(getManualChunk("/node_modules/@tanstack/react-router/dist/esm/index.js")).toBe("vendor-tanstack");
    expect(getManualChunk("/node_modules/@tanstack/react-virtual/dist/index.js")).toBe("vendor-tanstack");
    expect(getManualChunk("/node_modules/@tanstack/router-core/dist/esm/index.js")).toBe("vendor-tanstack");
  });

  it("returns undefined for non-vendor modules", () => {
    expect(getManualChunk("/src/routes/HomePage.tsx")).toBeUndefined();
    expect(getManualChunk("/src/components/Sidebar.tsx")).toBeUndefined();
  });

  it("returns undefined for other vendor modules (default chunking)", () => {
    expect(getManualChunk("/node_modules/lucide-react/dist/index.js")).toBeUndefined();
  });
});
