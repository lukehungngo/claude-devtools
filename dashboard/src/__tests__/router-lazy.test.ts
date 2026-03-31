import { describe, it, expect } from "vitest";

describe("router lazy loading", () => {
  it("indexRoute uses lazyRouteComponent (not eager import)", async () => {
    // The router module should NOT statically import HomePage or SessionPage
    // We verify by checking that the router module's source does not contain
    // direct component imports for HomePage/SessionPage
    const routerSource = await import("../router?raw") as unknown as { default: string };
    // raw import gives us the source text
    expect(routerSource.default).not.toContain('import { HomePage }');
    expect(routerSource.default).not.toContain('import { SessionPage }');
  });

  it("router imports lazyRouteComponent from @tanstack/react-router", async () => {
    const routerSource = await import("../router?raw") as unknown as { default: string };
    expect(routerSource.default).toContain("lazyRouteComponent");
  });

  it("lazy routes use named exports (not default)", async () => {
    const routerSource = await import("../router?raw") as unknown as { default: string };
    // Should reference the named export strings
    expect(routerSource.default).toContain('"HomePage"');
    expect(routerSource.default).toContain('"SessionPage"');
  });

  it("AppLayout is still eagerly imported", async () => {
    const routerSource = await import("../router?raw") as unknown as { default: string };
    expect(routerSource.default).toContain('import { AppLayout }');
  });
});
