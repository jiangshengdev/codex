import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  type RouteComponent,
} from "@tanstack/react-router";
import { useState } from "react";
import RootApp from "@/App";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { ThreadHistoryDetailPage } from "@/features/threadHistory/ThreadHistoryDetailPage";
import { ThreadHistoryListPage } from "@/features/threadHistory/ThreadHistoryListPage";
import { launchThreadId } from "./appBrowserTestSupport";

export function AppBrowserRenderHarness({
  currentTaskComponent = CurrentTaskPage,
  initialEntry = CURRENT_TASK_ROUTE_PATH.replace("$threadId", launchThreadId),
  routeTarget = { type: "currentTask", threadId: launchThreadId },
}: Readonly<{
  currentTaskComponent?: RouteComponent;
  initialEntry?: string;
  routeTarget?: GuiRouteTarget;
}>) {
  const [router] = useState(() => {
    const rootRoute = createRootRoute();
    const appRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: "app",
      component: () => <RootApp routeTarget={routeTarget} />,
    });
    const currentTaskRoute = createRoute({
      getParentRoute: () => appRoute,
      path: CURRENT_TASK_ROUTE_PATH,
      component: currentTaskComponent,
    });
    const historyListRoute = createRoute({
      getParentRoute: () => appRoute,
      path: HISTORY_LIST_ROUTE_PATH,
      component: ThreadHistoryListPage,
    });
    const historyDetailRoute = createRoute({
      getParentRoute: () => appRoute,
      path: HISTORY_DETAIL_ROUTE_PATH,
      component: ThreadHistoryDetailPage,
    });

    return createRouter({
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      routeTree: rootRoute.addChildren([
        appRoute.addChildren([currentTaskRoute, historyListRoute, historyDetailRoute]),
      ]),
    });
  });

  return <RouterProvider router={router} />;
}
