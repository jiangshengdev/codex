import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  type RouterHistory,
} from "@tanstack/react-router";
import { NotFoundPage } from "./NotFoundPage";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  isValidThreadId,
  validateEmptyRouteSearch,
} from "./features/browserLaunch/guiRouteTarget";
import { CurrentTaskPage } from "./features/currentTask/CurrentTaskPage";
import { ThreadHistoryDetailPage } from "./features/threadHistory/ThreadHistoryDetailPage";
import { ThreadHistoryListPage } from "./features/threadHistory/ThreadHistoryListPage";
import { AppRouteBoundary, RootRouteError } from "./routerComponents";

const rootRoute = createRootRoute({
  errorComponent: RootRouteError,
  notFoundComponent: NotFoundPage,
  validateSearch: validateEmptyRouteSearch,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppRouteBoundary,
  notFoundComponent: NotFoundPage,
});

const currentTaskRoute = createRoute({
  getParentRoute: () => appRoute,
  path: CURRENT_TASK_ROUTE_PATH,
  component: CurrentTaskPage,
  params: { parse: parseThreadIdParams },
});

const historyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: HISTORY_LIST_ROUTE_PATH,
  component: ThreadHistoryListPage,
});

const historyDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: HISTORY_DETAIL_ROUTE_PATH,
  component: ThreadHistoryDetailPage,
  params: { parse: parseThreadIdParams },
});

function parseThreadIdParams(params: Readonly<{ threadId: string }>): { threadId: string } {
  if (!isValidThreadId(params.threadId)) {
    return notFound({ routeId: rootRoute.id, throw: true }) as never;
  }
  return { threadId: params.threadId };
}

const routeTree = rootRoute.addChildren([
  appRoute.addChildren([currentTaskRoute, historyRoute, historyDetailRoute]),
]);

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
