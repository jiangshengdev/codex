import { useEffect, useState } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
  useMatches,
} from "@tanstack/react-router";
import { useAppDispatch } from "@/app/hooks";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { AppShell } from "@/features/appShell/AppShell";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { NewSessionPage } from "@/features/newSession/NewSessionPage";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  NEW_TASK_ROUTE_PATH,
  selectGuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import {
  DocumentTitleOwner,
  HistoryDetailDocumentTitleFactPublisher,
} from "@/features/documentTitle/DocumentTitleOwner";
import { PendingInputPreview } from "../composer/pendingInput/PendingInputScenarioView";
import { createShellScenario, shellThreadId, type ShellScenarioOptions } from "./shellScenario";

type Scenario = ReturnType<typeof createShellScenario>;

function Shell({ scenario }: Readonly<{ scenario: Scenario }>) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const routeTarget = useMatches({ select: selectGuiRouteTarget });
  const threadId = routeTarget?.type === "currentTask" ? routeTarget.threadId : null;
  useEffect(() => {
    if (threadId != null) void scenario.session.view(threadId);
  }, [scenario, threadId]);
  useEffect(() => {
    if (scenario.options.realPages)
      scenario.newSessionOwner.setNavigation(pathname === NEW_TASK_ROUTE_PATH, pathname);
  }, [pathname, scenario]);
  if (routeTarget == null) return null;
  return (
    <AppCapabilitiesContext
      value={{
        routeTarget,
        status:
          scenario.options.error === "connection"
            ? { label: "error", message: "STORYBOOK_CONNECTION_FAILED: local fixture" }
            : { label: "initialized" },
        authorizationToken: null,
        commands: scenario.options.inputUnavailable ? null : scenario.commands,
        activeThreadSession: scenario.session,
        connectionRecovery: null,
        newSessionOwner: scenario.newSessionOwner,
      }}
    >
      <AppShell>
        <Outlet />
      </AppShell>
    </AppCapabilitiesContext>
  );
}

function Placeholder({ scenario }: Readonly<{ scenario: Scenario }>) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const routeTarget = useMatches({ select: selectGuiRouteTarget });
  return (
    <main className="min-w-0 p-6 break-all">
      {routeTarget?.type === "historyDetail" ? (
        <HistoryDetailDocumentTitleFactPublisher
          threadId={routeTarget.threadId}
          title={scenario.title}
        />
      ) : null}
      <code>{pathname}</code>
    </main>
  );
}

function ShellRouter({ scenario }: Readonly<{ scenario: Scenario }>) {
  const [ready, setReady] = useState(false);
  const [router] = useState(() => {
    const root = createRootRoute({ component: () => <Shell scenario={scenario} /> });
    const paths = [
      CURRENT_TASK_ROUTE_PATH,
      HISTORY_LIST_ROUTE_PATH,
      HISTORY_DETAIL_ROUTE_PATH,
      NEW_TASK_ROUTE_PATH,
    ];
    const routes = paths.map((path) =>
      createRoute({
        getParentRoute: () => root,
        path,
        component: () =>
          scenario.options.realPages && path === CURRENT_TASK_ROUTE_PATH ? (
            <CurrentTaskPage />
          ) : scenario.options.realPages && path === NEW_TASK_ROUTE_PATH ? (
            <NewSessionPage />
          ) : (
            <Placeholder scenario={scenario} />
          ),
      }),
    );
    const initialPath =
      scenario.options.route === "historyList"
        ? HISTORY_LIST_ROUTE_PATH
        : scenario.options.route === "historyDetail"
          ? HISTORY_DETAIL_ROUTE_PATH.replace("$threadId", shellThreadId)
          : scenario.options.route === "newTask"
            ? NEW_TASK_ROUTE_PATH
            : CURRENT_TASK_ROUTE_PATH.replace("$threadId", shellThreadId);
    const router = createRouter({
      InnerWrap: DocumentTitleOwner,
      routeTree: root.addChildren(routes),
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    });
    if (scenario.options.collection === "navigationFailure") {
      const navigate = router.navigate;
      let failurePending = true;
      // Simulate one rejected navigation at the router boundary. The real menu
      // and session owner retain and clear the resulting operation error.
      router.navigate = (navigation) => {
        if (failurePending && navigation.to === CURRENT_TASK_ROUTE_PATH) {
          failurePending = false;
          return Promise.reject(new Error("STORYBOOK_NAVIGATION_FAILED: local router rejection"));
        }
        return navigate(navigation);
      };
    }
    return router;
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
  return ready ? <RouterProvider router={router} /> : null;
}

export function ShellPreview(options: ShellScenarioOptions) {
  const dispatch = useAppDispatch();
  return (
    <PendingInputPreview
      key={JSON.stringify(options)}
      className=""
      createScenario={() => createShellScenario(dispatch, options)}
    >
      {(scenario) => <ShellRouter scenario={scenario} />}
    </PendingInputPreview>
  );
}
