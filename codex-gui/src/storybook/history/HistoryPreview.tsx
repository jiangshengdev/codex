import { useEffect, useState } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { useAppDispatch } from "@/app/hooks";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { AppShell } from "@/features/appShell/AppShell";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { ThreadHistoryListPage } from "@/features/threadHistory/ThreadHistoryListPage";
import { ThreadHistoryDetailPage } from "@/features/threadHistory/ThreadHistoryDetailPage";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { PendingInputPreview } from "../composer/pendingInput/PendingInputScenarioView";
import { createHistoryScenario, type HistoryScenarioOptions } from "./historyScenario";

type Scenario = ReturnType<typeof createHistoryScenario>;

function HistoryShell({ scenario }: Readonly<{ scenario: Scenario }>) {
  const router = useRouter();
  const pathname = useLocation({ select: (location) => location.pathname });
  const threadId = pathname.split("/")[2] ?? "";
  const routeTarget: GuiRouteTarget = pathname.startsWith("/task/")
    ? { type: "currentTask", threadId }
    : threadId !== ""
      ? { type: "historyDetail", threadId }
      : { type: "historyList" };
  useEffect(() => {
    if (pathname.startsWith("/task/")) void scenario.session.view(threadId);
  }, [scenario, pathname, threadId]);
  return (
    <AppCapabilitiesContext
      value={{
        status: { label: "initialized" },
        authorizationToken: null,
        commands: scenario.commands,
        activeThreadSession: scenario.session,
        connectionRecovery: null,
        newSessionOwner: scenario.newSessionOwner,
        routeTarget,
      }}
    >
      <div
        data-history-route={pathname}
        data-history-depth={router.history.length}
        data-history-activations={scenario.getActivationCount()}
      >
        <AppShell>
          <Outlet />
        </AppShell>
      </div>
    </AppCapabilitiesContext>
  );
}

function HistoryRouter({ scenario }: Readonly<{ scenario: Scenario }>) {
  const [ready, setReady] = useState(false);
  const [router] = useState(() => {
    const root = createRootRoute({ component: () => <HistoryShell scenario={scenario} /> });
    const app = createRoute({ getParentRoute: () => root, id: "app", component: Outlet });
    const list = createRoute({
      getParentRoute: () => app,
      path: "/history",
      component: ThreadHistoryListPage,
    });
    const detail = createRoute({
      getParentRoute: () => app,
      path: "/history/$threadId",
      component: ThreadHistoryDetailPage,
    });
    const current = createRoute({
      getParentRoute: () => app,
      path: "/task/$threadId",
      component: CurrentTaskPage,
    });
    const previewRouter = createRouter({
      routeTree: root.addChildren([app.addChildren([list, detail, current])]),
      history: createMemoryHistory({ initialEntries: [scenario.initialPath] }),
    });
    const navigate = previewRouter.navigate;
    previewRouter.navigate = async (navigation) => {
      if (navigation.to === "/task/$threadId") scenario.beforeTaskNavigation();
      await navigate(navigation);
    };
    return previewRouter;
  });
  useEffect(() => {
    let active = true;
    void scenario.start().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [scenario]);
  if (!ready) return null;
  return <RouterProvider router={router} />;
}

export function HistoryPreview(options: HistoryScenarioOptions) {
  const dispatch = useAppDispatch();
  return (
    <PendingInputPreview
      key={JSON.stringify(options)}
      className=""
      createScenario={() => createHistoryScenario(dispatch, options)}
    >
      {(scenario) => <HistoryRouter scenario={scenario} />}
    </PendingInputPreview>
  );
}
