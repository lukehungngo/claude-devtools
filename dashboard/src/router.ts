import { createRouter, createRoute, createRootRoute } from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { AppLayout } from "./routes/AppLayout";
import { HomePage } from "./routes/HomePage";
import { SessionPage } from "./routes/SessionPage";

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
  component: HomePage,
});

const sessionRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: "/session/$repoSlug/$sessionId",
  component: SessionPage,
});

const routeTree = rootRoute.addChildren([
  layoutRoute.addChildren([indexRoute, sessionRoute]),
]);

export const router = createRouter({ routeTree });

// Type registration for TanStack Router
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
