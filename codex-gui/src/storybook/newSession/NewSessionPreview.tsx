import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
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
import { selectGuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { DocumentTitleOwner } from "@/features/documentTitle/DocumentTitleOwner";
import { NewSessionPage } from "@/features/newSession/NewSessionPage";
import { PendingInputPreview } from "../composer/pendingInput/PendingInputScenarioView";
import { DevOnly } from "../environment/DevOnly";
import { createNewSessionScenario, type NewSessionOptions } from "./newSessionScenario";
import { NewSessionAttachments } from "./NewSessionAttachments";

type Scenario = ReturnType<typeof createNewSessionScenario>;

function NewSessionShell({ scenario }: Readonly<{ scenario: Scenario }>) {
  const pathname = useLocation({ select: (location) => location.pathname });
  const routeTarget = useMatches({ select: selectGuiRouteTarget });
  const starts = useSyncExternalStore(scenario.subscribe, scenario.getStarts);
  const sends = useSyncExternalStore(scenario.subscribe, scenario.getSends);
  useEffect(() => {
    scenario.owner.setNavigation(pathname === "/new", pathname);
    if (routeTarget?.type === "currentTask") void scenario.session.view(routeTarget.threadId);
    scenario.start();
  }, [pathname, routeTarget, scenario]);
  if (routeTarget == null) return null;
  return (
    <AppCapabilitiesContext
      value={{
        status: { label: "initialized" },
        authorizationToken: scenario.uploads.token,
        commands: scenario.commands,
        activeThreadSession: scenario.session,
        connectionRecovery: null,
        newSessionOwner: scenario.owner,
        routeTarget,
      }}
    >
      <div
        data-new-session-route={pathname}
        data-new-session-starts={starts}
        data-new-session-sends={sends.length}
        data-new-session-input={JSON.stringify(sends[0]?.input)}
      >
        <AppShell>
          <Outlet />
        </AppShell>
      </div>
    </AppCapabilitiesContext>
  );
}

function NewSessionRouter({ scenario }: Readonly<{ scenario: Scenario }>) {
  const [router] = useState(() => {
    const root = createRootRoute({ component: () => <NewSessionShell scenario={scenario} /> });
    const app = createRoute({ getParentRoute: () => root, id: "app", component: Outlet });
    const initial = createRoute({
      getParentRoute: () => app,
      path: "/new",
      component: NewSessionPage,
    });
    const current = createRoute({
      getParentRoute: () => app,
      path: "/task/$threadId",
      component: CurrentTaskPage,
    });
    return createRouter({
      InnerWrap: DocumentTitleOwner,
      routeTree: root.addChildren([app.addChildren([initial, current])]),
      history: createMemoryHistory({ initialEntries: ["/new"] }),
    });
  });
  return <RouterProvider router={router} />;
}

export function NewSessionPreview(options: NewSessionOptions) {
  const dispatch = useAppDispatch();
  return (
    <PendingInputPreview
      key={JSON.stringify(options)}
      className=""
      createScenario={() => createNewSessionScenario(dispatch, options)}
    >
      {(scenario) => (
        <>
          <DevOnly>
            <p className="text-sm text-muted">
              <Trans>Local simulation. No real sessions, uploads or model responses.</Trans>
            </p>
            {scenario.options.failure === "handoff" ? (
              <>
                <p className="text-sm text-muted">
                  <Trans>Only for scenario preparation, not a product recovery entry point.</Trans>
                </p>
                <Button
                  variant="secondary"
                  onPress={() => {
                    scenario.recoverStorage();
                  }}
                >
                  <Trans comment="Clear the simulated storage fault and invoke existing persistence recovery before retrying on the new-session page">
                    Simulate storage recovery
                  </Trans>
                </Button>
              </>
            ) : null}
          </DevOnly>
          <NewSessionAttachments scenario={scenario}>
            <NewSessionRouter scenario={scenario} />
          </NewSessionAttachments>
        </>
      )}
    </PendingInputPreview>
  );
}
