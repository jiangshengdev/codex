import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { NotFoundPage } from "./NotFoundPage";
import App from "./App";

const rootRoute = createRootRoute({
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: App,
});

const routeTree = rootRoute.addChildren([indexRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Register {
    router: typeof router;
  }
}
