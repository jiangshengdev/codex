import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { attachResponse, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "@/features/appShell/AppCapabilitiesContext";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { renderWithProviders } from "@/utils/test-utils";
import type { Thread, ThreadListResponse } from "@codex-protocol/v2";
import { ThreadHistoryListPage } from "../ThreadHistoryListPage";

export const thread = (
  id: string,
  overrides: Partial<Pick<Thread, "name" | "preview" | "recencyAt" | "status" | "updatedAt">>,
): Thread => ({
  ...attachResponse.snapshot.thread,
  id,
  turns: [],
  ...overrides,
});

export const response = (data: Thread[], nextCursor: string | null): ThreadListResponse => ({
  data,
  nextCursor,
  backwardsCursor: null,
});

let sessionRevision = 0;
export const baselineAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) =>
  activeThreadReadModelTransitionApplied({
    sessionRevision: ++sessionRevision,
    facts: [{ type: "baselineAttached", response }],
  });

type RenderHistoryOptions = {
  activeThreadSession?: ActiveThreadSession | null;
  activeThreadStartupError?: string | null;
  commandsAvailable?: boolean;
  initialEntry?: string;
  runtimeThreadId?: string | null;
  strictMode?: boolean;
};

export const renderHistory = async (
  listThreads: GuiHostCommands["listThreads"],
  {
    activeThreadSession: suppliedActiveThreadSession,
    activeThreadStartupError = null,
    commandsAvailable = true,
    initialEntry = "/history",
    runtimeThreadId = attachResponse.snapshot.thread.id,
    strictMode = false,
  }: RenderHistoryOptions = {},
) => {
  const HistoryDetailPlaceholder = () => <main aria-label="History detail">History detail</main>;
  const activeThreadSessionHarness = createActiveThreadSessionHarness();
  activeThreadSessionHarness.publish(
    activeThreadSessionHarness.activeSnapshot({
      threadId: attachResponse.snapshot.thread.id,
      subscriptionId: attachResponse.subscriptionId,
    }),
  );
  const activeThreadSession =
    suppliedActiveThreadSession === undefined
      ? activeThreadSessionHarness.session
      : suppliedActiveThreadSession;
  const target = { type: "historyList" } as const;
  const capabilities: AppCapabilities = {
    activeThreadSession,
    activeThreadStartupError,
    authorizationToken: null,
    commands: commandsAvailable ? { ...createGuiHostCommands(), listThreads } : null,
    routeTarget: target,
    status: { label: "initialized" },
  };
  const Root = () => (
    <AppCapabilitiesProvider capabilities={capabilities}>
      <Outlet />
    </AppCapabilitiesProvider>
  );
  const rootRoute = createRootRoute({ component: Root });
  const historyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/history",
    component: ThreadHistoryListPage,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/history/$threadId",
    component: HistoryDetailPlaceholder,
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree: rootRoute.addChildren([historyRoute, detailRoute]),
  });
  const app = <RouterProvider router={router} />;
  const screen = await renderWithProviders(strictMode ? <StrictMode>{app}</StrictMode> : app);
  if (runtimeThreadId != null) {
    screen.store.dispatch(
      baselineAttached({
        ...attachResponse,
        snapshot: {
          ...attachResponse.snapshot,
          thread: { ...attachResponse.snapshot.thread, id: runtimeThreadId },
        },
      }),
    );
  }
  return { router, screen };
};
