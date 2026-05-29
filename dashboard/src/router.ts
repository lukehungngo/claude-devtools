import { createRouter, createRoute, createRootRoute, lazyRouteComponent } from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { AppLayout } from "./routes/AppLayout";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const layoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "layout",
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./routes/HomePage"), "HomePage"),
});

const sessionRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/session/$repoSlug/$sessionId",
  component: lazyRouteComponent(() => import("./routes/SessionPage"), "SessionPage"),
});

const insightsRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/insights",
  component: lazyRouteComponent(
    () => import("./routes/InsightsPage"),
    "InsightsPage"
  ),
});

const graphRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/graph",
  component: lazyRouteComponent(
    () => import("./routes/GraphPage"),
    "GraphPage"
  ),
});

const routeTree = rootRoute.addChildren([
  layoutRoute.addChildren([indexRoute, sessionRoute, insightsRoute, graphRoute]),
]);

export const router = createRouter({ routeTree });

// Type registration for TanStack Router
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
