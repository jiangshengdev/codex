import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import {
  createActiveThreadSessionHarness,
  type ActiveThreadSessionHarness,
} from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { renderWithProviders } from "@/utils/test-utils";
import { DocumentTitleOwner } from "@/features/documentTitle/DocumentTitleOwner";
import { AppShellTopBar } from "../AppShellTopBar";

export const currentThreadId = attachResponse.snapshot.thread.id;
const capabilities = ({
  activeThreadSessionHarness,
  routeTarget,
}: Readonly<{
  activeThreadSessionHarness: ActiveThreadSessionHarness;
  routeTarget: GuiRouteTarget;
}>): AppCapabilities => ({
  activeThreadSession: activeThreadSessionHarness.session,
  activeThreadStartupError: null,
  authorizationToken: null,
  commands: null,
  routeTarget,
  status: { label: "initialized" },
});

export const renderTopBar = async ({
  initialEntry,
  activeThreadId = currentThreadId,
  routeTarget,
}: Readonly<{
  initialEntry: string;
  activeThreadId?: string | null;
  routeTarget: GuiRouteTarget;
}>) => {
  function RoutePlaceholder() {
    return null;
  }

  const activeThreadSessionHarness = createActiveThreadSessionHarness();
  if (activeThreadId != null) {
    activeThreadSessionHarness.publish(
      activeThreadSessionHarness.activeSnapshot({
        threadId: activeThreadId,
        subscriptionId: `subscription-${activeThreadId}`,
      }),
    );
  }
  const rootRoute = createRootRoute({
    component: () => (
      <AppCapabilitiesProvider
        capabilities={capabilities({ activeThreadSessionHarness, routeTarget })}
      >
        <AppShellTopBar />
      </AppCapabilitiesProvider>
    ),
  });
  const currentTaskRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: CURRENT_TASK_ROUTE_PATH,
    component: RoutePlaceholder,
  });
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: HISTORY_LIST_ROUTE_PATH,
    component: RoutePlaceholder,
  });
  const historyDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: HISTORY_DETAIL_ROUTE_PATH,
    component: RoutePlaceholder,
  });

  const router = createRouter({
    InnerWrap: DocumentTitleOwner,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([currentTaskRoute, historyRoute, historyDetailRoute]),
  });
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  return { router, screen };
};
