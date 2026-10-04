import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useMatches,
  type RouteComponent,
} from "@tanstack/react-router";
import { createContext, use, useState } from "react";
import RootApp from "@/App";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  selectGuiRouteTarget,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { ThreadHistoryDetailPage } from "@/features/threadHistory/ThreadHistoryDetailPage";
import { ThreadHistoryListPage } from "@/features/threadHistory/ThreadHistoryListPage";
import { launchThreadId } from "./appBrowserTestSupport";

const HarnessRouteTargetContext = createContext<GuiRouteTarget | undefined>(undefined);

function HarnessAppBoundary() {
  const routeTarget = use(HarnessRouteTargetContext);
  const matchedTarget = useMatches({ select: selectGuiRouteTarget });
  const target = routeTarget ?? matchedTarget;
  if (target == null) throw new Error("Expected a valid App harness route");
  return <RootApp routeTarget={target} />;
}

export function AppBrowserRenderHarness({
  currentTaskComponent = CurrentTaskPage,
  initialEntry = CURRENT_TASK_ROUTE_PATH.replace("$threadId", launchThreadId),
  routeTarget,
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
      component: HarnessAppBoundary,
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

  return (
    <HarnessRouteTargetContext value={routeTarget}>
      <RouterProvider router={router} />
    </HarnessRouteTargetContext>
  );
}
