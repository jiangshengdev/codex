import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { NotFoundPage } from "./NotFoundPage";
import App from "./App";
import { CurrentTaskPage } from "./features/currentTask/CurrentTaskPage";
import { ThreadHistoryListPage } from "./features/threadHistory/ThreadHistoryListPage";

function historyRoutePlaceholder() {
  return <main className="min-h-0 w-full flex-1" />;
}

const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: NotFoundPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: CurrentTaskPage,
});

const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  component: ThreadHistoryListPage,
});

const historyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history/$threadId",
  component: historyRoutePlaceholder,
});

const routeTree = rootRoute.addChildren([indexRoute, historyRoute, historyDetailRoute]);

export function createAppRouter(history?: RouterHistory) {
  return history == null ? createRouter({ routeTree }) : createRouter({ history, routeTree });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface Register {
    router: typeof router;
  }
}
