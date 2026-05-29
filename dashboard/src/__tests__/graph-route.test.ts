import { describe, it, expect } from "vitest";

describe("/graph route registration", () => {
  it("router declares a /graph path", async () => {
    const routerSource = (await import("../router?raw")) as unknown as { default: string };
    expect(routerSource.default).toContain('path: "/graph"');
  });

  it("/graph lazily loads the GraphPage named export", async () => {
    const routerSource = (await import("../router?raw")) as unknown as { default: string };
    expect(routerSource.default).toContain('"GraphPage"');
    expect(routerSource.default).toContain("./routes/GraphPage");
  });

  it("graphRoute is added to the layout route children", async () => {
    const routerSource = (await import("../router?raw")) as unknown as { default: string };
    expect(routerSource.default).toContain("graphRoute");
    // graphRoute must appear inside addChildren alongside the other routes
    const addChildrenMatch = routerSource.default.match(/addChildren\(\[([\s\S]*?)\]\)/g);
    expect(addChildrenMatch?.some((m) => m.includes("graphRoute"))).toBe(true);
  });
});
