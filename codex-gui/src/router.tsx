import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router";
import { NotFoundPage } from "./NotFoundPage";
import App from "./App";
import { AppRuntimeLayout } from "./features/appRuntime/AppRuntimeLayout";

const rootRoute = createRootRoute({
  notFoundComponent: NotFoundPage,
});

const appRuntimeRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app-runtime",
  component: AppRuntimeLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appRuntimeRoute,
  path: "/",
  component: App,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRuntimeRoute,
  path: "/settings",
  component: Outlet,
});

const routeTree = rootRoute.addChildren([
  appRuntimeRoute.addChildren([indexRoute, settingsRoute]),
]);

export type CreateAppRouterOptions = {
  history?: RouterHistory;
};

export function createAppRouter({ history }: CreateAppRouterOptions = {}) {
  return createRouter({
    routeTree,
    ...(history == null ? {} : { history }),
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Register {
    router: typeof router;
  }
}
