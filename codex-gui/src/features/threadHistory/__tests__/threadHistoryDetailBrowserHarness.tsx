import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode, useSyncExternalStore } from "react";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import {
  createActiveThreadSessionHarness,
  type ActiveThreadSessionHarnessOptions,
} from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import { AppShell } from "@/features/appShell/AppShell";
import { CURRENT_TASK_ROUTE_PATH } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { renderWithProviders } from "@/utils/test-utils";
import { ThreadHistoryDetailPage } from "../ThreadHistoryDetailPage";

export const detailThreadId = "00000000-0000-0000-0000-000000000088";

type CapabilitiesStore = Readonly<{
  getSnapshot: () => AppCapabilities;
  publish: (next: AppCapabilities) => void;
  subscribe: (listener: () => void) => () => void;
}>;

const createCapabilitiesStore = (initial: AppCapabilities): CapabilitiesStore => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    publish: (next) => {
      snapshot = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

type RenderDetailOptions = Readonly<{
  activate?: ActiveThreadSessionHarnessOptions["activate"];
  activeThreadSession?: ActiveThreadSession | null;
  authorizationToken?: string | null;
  commands?: GuiHostCommands | null;
  initialEntries?: string[];
  status?: AppCapabilities["status"];
  strictMode?: boolean;
}>;

export const renderDetail = async ({
  activate,
  activeThreadSession: suppliedActiveThreadSession,
  authorizationToken = "retained-secret",
  commands: suppliedCommands,
  initialEntries = [`/history/${detailThreadId}`],
  status = { label: "initialized" },
  strictMode = false,
}: RenderDetailOptions = {}) => {
  const commands = suppliedCommands === undefined ? createGuiHostCommands() : suppliedCommands;
  const activeThreadSessionHarness = createActiveThreadSessionHarness({
    activate: activate ?? { type: "ready", threadId: detailThreadId, warnings: [] },
  });
  const activeThreadSession =
    suppliedActiveThreadSession === undefined
      ? activeThreadSessionHarness.session
      : suppliedActiveThreadSession;
  const initialCapabilities: AppCapabilities = {
    activeThreadSession,
    activeThreadStartupError: null,
    authorizationToken,
    commands,
    routeTarget: { type: "historyDetail", threadId: detailThreadId },
    status,
  };
  const capabilitiesStore = createCapabilitiesStore(initialCapabilities);
  const Root = () => {
    const capabilities = useSyncExternalStore(
      capabilitiesStore.subscribe,
      capabilitiesStore.getSnapshot,
      capabilitiesStore.getSnapshot,
    );
    return (
      <AppCapabilitiesProvider capabilities={capabilities}>
        <AppShell>
          <Outlet />
        </AppShell>
      </AppCapabilitiesProvider>
    );
  };
  const CurrentTask = () => <main aria-label="Current task" />;
  const HistoryList = () => <main aria-label="History list" />;
  const Origin = () => <main aria-label="Origin" />;
  const rootRoute = createRootRoute({ component: Root });
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "app",
    component: Outlet,
  });
  const currentTaskRoute = createRoute({
    getParentRoute: () => appRoute,
    path: CURRENT_TASK_ROUTE_PATH,
    component: CurrentTask,
  });
  const historyRoute = createRoute({
    getParentRoute: () => appRoute,
    path: "/history",
    component: HistoryList,
  });
  const detailRoute = createRoute({
    getParentRoute: () => appRoute,
    path: "/history/$threadId",
    component: ThreadHistoryDetailPage,
  });
  const originRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/origin",
    component: Origin,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries }),
    routeTree: rootRoute.addChildren([
      appRoute.addChildren([currentTaskRoute, historyRoute, detailRoute]),
      originRoute,
    ]),
  });
  const app = <RouterProvider router={router} />;
  const screen = await renderWithProviders(strictMode ? <StrictMode>{app}</StrictMode> : app);
  return {
    activeThreadSessionHarness,
    capabilitiesStore,
    commands,
    initialCapabilities,
    router,
    screen,
  };
};
