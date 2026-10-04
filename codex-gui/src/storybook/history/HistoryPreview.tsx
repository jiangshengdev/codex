import { useEffect, useState, useSyncExternalStore } from "react";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
  useLocation,
  useRouter,
  useMatches,
} from "@tanstack/react-router";
import { useAppDispatch } from "@/app/hooks";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { AppShell } from "@/features/appShell/AppShell";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { ThreadHistoryListPage } from "@/features/threadHistory/ThreadHistoryListPage";
import { ThreadHistoryDetailPage } from "@/features/threadHistory/ThreadHistoryDetailPage";
import { selectGuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { DocumentTitleOwner } from "@/features/documentTitle/DocumentTitleOwner";
import { PendingInputPreview } from "../composer/pendingInput/PendingInputScenarioView";
import { createHistoryScenario, type HistoryScenarioOptions } from "./historyScenario";
import { ThreadForkOwner } from "@/features/threadFork/threadForkOwner";
import { ThreadForkContext } from "@/features/threadFork/ThreadForkContext";
import { ThreadForkNotice } from "@/features/threadFork/ThreadForkNotice";
import { forkSnapshots } from "./forkScenarios";

type Scenario = ReturnType<typeof createHistoryScenario>;

function HistoryShell({
  scenario,
  forkOwner,
}: Readonly<{ scenario: Scenario; forkOwner: ThreadForkOwner | null }>) {
  const router = useRouter();
  const activationCount = useSyncExternalStore(scenario.subscribe, scenario.getActivationCount);
  const forkCount = useSyncExternalStore(scenario.subscribe, scenario.getForkCount);
  const pathname = useLocation({ select: (location) => location.pathname });
  const routeTarget = useMatches({ select: selectGuiRouteTarget });
  const viewedThreadId = routeTarget?.type === "currentTask" ? routeTarget.threadId : null;
  useEffect(() => {
    if (viewedThreadId != null) void scenario.session.view(viewedThreadId);
  }, [scenario, viewedThreadId]);
  if (routeTarget == null) return null;
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
        data-history-activations={activationCount}
        data-history-forks={forkCount}
      >
        <ThreadForkContext
          value={
            forkOwner == null
              ? null
              : { owner: forkOwner, available: scenario.options.fork !== "unavailable" }
          }
        >
          <AppShell>
            <ThreadForkNotice />
            <Outlet />
          </AppShell>
        </ThreadForkContext>
      </div>
    </AppCapabilitiesContext>
  );
}

function HistoryRouter({ scenario }: Readonly<{ scenario: Scenario }>) {
  const [ready, setReady] = useState(false);
  const [{ router, forkOwner }] = useState(() => {
    const root = createRootRoute({
      component: () => <HistoryShell scenario={scenario} forkOwner={owner} />,
    });
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
      InnerWrap: DocumentTitleOwner,
      routeTree: root.addChildren([app.addChildren([list, detail, current])]),
      history: createMemoryHistory({ initialEntries: [scenario.initialPath] }),
    });
    const navigate = previewRouter.navigate;
    previewRouter.navigate = async (navigation) => {
      if (navigation.to === "/task/$threadId") scenario.beforeTaskNavigation();
      await navigate(navigation);
    };
    const owner =
      scenario.options.fork == null
        ? null
        : new ThreadForkOwner(async (threadId) => {
            await previewRouter.navigate({ to: "/task/$threadId", params: { threadId } });
            if (previewRouter.state.location.pathname !== `/task/${threadId}`)
              throw new Error("Fork navigation did not reach the saved conversation");
          }, forkSnapshots[scenario.options.fork]);
    return { router: previewRouter, forkOwner: owner };
  });
  useEffect(() => {
    let active = true;
    forkOwner?.setConnection(
      scenario.options.fork === "unavailable"
        ? null
        : { commands: scenario.commands, session: scenario.session },
    );
    forkOwner?.setNavigation(router.state.location);
    const unsubscribe = router.subscribe("onBeforeNavigate", (event) =>
      forkOwner?.setNavigation(event.toLocation),
    );
    void scenario.start().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      unsubscribe();
      forkOwner?.setNavigation(null);
      forkOwner?.setConnection(null);
    };
  }, [scenario, forkOwner, router]);
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
