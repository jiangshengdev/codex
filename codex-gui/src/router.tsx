import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  SearchParamError,
  type ErrorComponentProps,
  type RouterHistory,
  useMatches,
} from "@tanstack/react-router";
import { NotFoundPage } from "./NotFoundPage";
import App from "./App";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  isValidThreadId,
  selectGuiRouteTarget,
  validateEmptyRouteSearch,
} from "./features/browserLaunch/guiRouteTarget";
import { CurrentTaskPage } from "./features/currentTask/CurrentTaskPage";
import { ThreadHistoryDetailPage } from "./features/threadHistory/ThreadHistoryDetailPage";
import { ThreadHistoryListPage } from "./features/threadHistory/ThreadHistoryListPage";

const rootRoute = createRootRoute({
  errorComponent: RootRouteError,
  notFoundComponent: NotFoundPage,
  validateSearch: validateEmptyRouteSearch,
});

function RootRouteError({ error }: ErrorComponentProps) {
  if (error instanceof SearchParamError) {
    return <NotFoundPage />;
  }
  throw error;
}

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppRouteBoundary,
  notFoundComponent: NotFoundPage,
});

function AppRouteBoundary() {
  const target = useMatches({ select: selectGuiRouteTarget });
  return target == null ? <NotFoundPage /> : <App />;
}

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
    throw notFound({ routeId: rootRoute.id });
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
